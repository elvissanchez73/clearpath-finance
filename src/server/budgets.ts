import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { ApiError } from "./errors";
import { budgetInput, copyBudgetInput, monthBounds, neighboringMonth, budgetTotals, type BudgetView } from "@/lib/budget";
import { parseMoney, cashFlowTotals } from "@/lib/finance";

export async function saveBudget(userId: string, month: string, input: unknown) {
  const { start } = monthBounds(month), data = budgetInput.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const existing = await tx.monthlyBudget.findUnique({ where: { userId_month: { userId, month: start } }, include: { items: true } });
    if ((existing?.updatedAt.toISOString() ?? null) !== data.expectedRevision) throw new ApiError(409, "This budget changed in another tab. Close the editor and reload before saving.");
    const ids = data.items.map(item => item.categoryId);
    const categories = await tx.category.findMany({ where: { userId, id: { in: ids } } });
    if (categories.length !== ids.length) throw new ApiError(404, "Record not found.");
    if (categories.some(category => category.archived && !existing?.items.some(item => item.categoryId === category.id))) throw new ApiError(409, "Archived categories cannot receive new allocations. Restore the category first.");
    const values = { plannedIncomeMinor: parseMoney(data.income), plannedSavingsMinor: parseMoney(data.savings), updatedAt: new Date(Math.max(Date.now(), (existing?.updatedAt.valueOf() ?? 0) + 1)) };
    const plan = existing
      ? await tx.monthlyBudget.update({ where: { id_userId: { id: existing.id, userId } }, data: values })
      : await tx.monthlyBudget.create({ data: { userId, month: start, ...values } });
    await tx.budgetItem.deleteMany({ where: { userId, budgetId: plan.id } });
    if (data.items.length) await tx.budgetItem.createMany({ data: data.items.map(item => ({ userId, budgetId: plan.id, categoryId: item.categoryId, amountMinor: parseMoney(item.amount), recurring: item.recurring })) });
    const nextMonth = neighboringMonth(month, 1);
    const activeCategoryIds = new Set(categories.filter(category => !category.archived).map(category => category.id));
    const repeatingItems = data.items.filter(item => item.recurring && activeCategoryIds.has(item.categoryId));
    if (nextMonth && repeatingItems.length && !(await tx.monthlyBudget.count({ where: { userId, month: monthBounds(nextMonth).start } }))) {
      const nextPlan = await tx.monthlyBudget.create({ data: { userId, month: monthBounds(nextMonth).start, plannedIncomeMinor: values.plannedIncomeMinor, plannedSavingsMinor: values.plannedSavingsMinor } });
      await tx.budgetItem.createMany({ data: repeatingItems.map(item => ({ userId, budgetId: nextPlan.id, categoryId: item.categoryId, amountMinor: parseMoney(item.amount), recurring: true })) });
    }
    return { revision: plan.updatedAt.toISOString() };
  });
}

export async function copyBudget(userId: string, month: string, input: unknown) {
  const { start } = monthBounds(month), data = copyBudgetInput.parse(input);
  const sourceDate = monthBounds(data.sourceMonth).start;
  if (sourceDate >= start) throw new ApiError(400, "Choose an earlier month to copy.");
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const source = await tx.monthlyBudget.findUnique({ where: { userId_month: { userId, month: sourceDate } }, include: { items: { include: { category: true } } } });
    if (!source) throw new ApiError(404, "No budget exists for that source month.");
    if (await tx.monthlyBudget.count({ where: { userId, month: start } })) throw new ApiError(409, "This month already has a budget. Edit it instead; copying never replaces an existing plan.");
    const items = source.items.filter(item => !item.category.archived && (!data.recurringOnly || item.recurring));
    const result = await tx.monthlyBudget.create({ data: { userId, month: start, plannedIncomeMinor: source.plannedIncomeMinor, plannedSavingsMinor: source.plannedSavingsMinor } });
    if (items.length) await tx.budgetItem.createMany({ data: items.map(item => ({ userId, budgetId: result.id, categoryId: item.categoryId, amountMinor: item.amountMinor, recurring: item.recurring })) });
    return { revision: result.updatedAt.toISOString(), copied: items.length, skippedArchived: source.items.filter(i => i.category.archived).length };
  });
}

export async function budgetView(userId: string, month: string): Promise<BudgetView> {
  const { start, end } = monthBounds(month);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    const plan = await tx.monthlyBudget.findUnique({ where: { userId_month: { userId, month: start } }, include: { items: true } });
    const categories = await tx.category.findMany({ where: { userId }, select: { id: true, name: true, icon: true, archived: true }, orderBy: { name: "asc" } });
    const groups = await tx.transaction.groupBy({ by: ["type", "categoryId"], where: { userId, date: { gte: start, lt: end } }, _sum: { amountMinor: true } });
    const sum = (type: string) => groups.filter(g => g.type === type).reduce((s, g) => s + (g._sum.amountMinor ?? 0n), 0n);
    const actual = cashFlowTotals(sum("INCOME"), sum("EXPENSE"), sum("SAVINGS_TRANSFER"));
    const allocated = plan?.items.reduce((s, i) => s + i.amountMinor, 0n) ?? 0n;
    const totals = plan ? budgetTotals(plan.plannedIncomeMinor, plan.plannedSavingsMinor, allocated, actual.expenses) : null;
    const rows = [...categories.map(c => ({ ...c, id: c.id as string | null })), { id: null, name: "Uncategorized", icon: "circle", archived: false }].flatMap(category => {
      const item = plan?.items.find(i => i.categoryId === category.id);
      const spent = groups.find(g => g.type === "EXPENSE" && g.categoryId === category.id)?._sum.amountMinor ?? 0n;
      if (!item && spent === 0n) return [];
      return [{ categoryId: category.id, name: category.name, icon: category.icon, archived: category.archived, allocated: !!item, plannedMinor: (item?.amountMinor ?? 0n).toString(), actualMinor: spent.toString(), remainingMinor: ((item?.amountMinor ?? 0n) - spent).toString(), recurring: item?.recurring ?? false }];
    });
    return {
      month, categories, rows, defaults: { incomeMinor: settings.defaultIncomeMinor.toString(), savingsMinor: settings.defaultBudgetSavingsMinor.toString() },
      plan: plan ? { revision: plan.updatedAt.toISOString(), incomeMinor: plan.plannedIncomeMinor.toString(), savingsMinor: plan.plannedSavingsMinor.toString(), items: plan.items.map(i => ({ categoryId: i.categoryId, amountMinor: i.amountMinor.toString(), recurring: i.recurring })) } : null,
      actual: { incomeMinor: actual.income.toString(), expensesMinor: actual.expenses.toString(), savingsMinor: actual.savings.toString(), remainingMinor: actual.remaining.toString() },
      totals: totals ? { allocatedMinor: allocated.toString(), plannedRemainderMinor: totals.plannedRemainder.toString(), remainingToSpendMinor: totals.remainingToSpend.toString() } : null,
    };
  });
}
