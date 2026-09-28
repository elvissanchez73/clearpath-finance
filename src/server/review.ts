import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { monthBounds, neighboringMonth } from "@/lib/budget";
import { todayInZone } from "@/lib/ledger-validation";
import { cashFlowTotals } from "@/lib/finance";
export async function reviewView(userId: string, month: string) {
  const { start, end } = monthBounds(month), previous = neighboringMonth(month, -1);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    const groups = await tx.transaction.groupBy({ by: ["type"], where: { userId, date: { gte: start, lt: end } }, _sum: { amountMinor: true } });
    const sum = (type: string) => groups.find(g => g.type === type)?._sum.amountMinor ?? 0n;
    const totals = cashFlowTotals(sum("INCOME"), sum("EXPENSE"), sum("SAVINGS_TRANSFER"));
    const budget = await tx.monthlyBudget.findUnique({ where: { userId_month: { userId, month: start } }, include: { items: true } });
    const planned = budget ? budget.items.reduce((s, i) => s + i.amountMinor, 0n) : null;
    const actual = await tx.transaction.groupBy({ by: ["categoryId"], where: { userId, type: "EXPENSE", date: { gte: start, lt: end } }, _sum: { amountMinor: true } });
    const prior = previous ? await tx.transaction.groupBy({ by: ["categoryId"], where: { userId, type: "EXPENSE", date: { gte: monthBounds(previous).start, lt: start } }, _sum: { amountMinor: true } }) : [];
    const names = await tx.category.findMany({ where: { userId } });
    const ids = new Set([...actual.map(r => r.categoryId ?? "uncategorized"), ...prior.map(r => r.categoryId ?? "uncategorized"), ...(budget?.items.map(i => i.categoryId) ?? [])]);
    const categories = [...ids].map(id => {
      const spent = actual.find(r => (r.categoryId ?? "uncategorized") === id)?._sum.amountMinor ?? 0n;
      const before = prior.find(r => (r.categoryId ?? "uncategorized") === id)?._sum.amountMinor ?? 0n;
      const allocation = budget?.items.find(i => i.categoryId === id)?.amountMinor ?? null;
      return { id, name: names.find(c => c.id === id)?.name ?? "Uncategorized", actual: spent.toString(), previous: previous ? before.toString() : null, change: previous ? (spent - before).toString() : null, planned: allocation?.toString() ?? null, remaining: allocation === null ? null : (allocation - spent).toString() };
    }).sort((a, b) => BigInt(a.actual) === BigInt(b.actual) ? a.name.localeCompare(b.name) : BigInt(a.actual) > BigInt(b.actual) ? -1 : 1);
    const retirement = await tx.retirementContribution.aggregate({ where: { userId, date: { gte: start, lt: end } }, _sum: { employeeMinor: true, employerMatchMinor: true, employerOtherMinor: true } });
    const goals = await tx.savingsGoal.findMany({ where: { userId }, orderBy: [{ priority: "asc" }, { id: "asc" }], include: { contributions: { where: { transaction: { date: { lt: end } } }, include: { transaction: { select: { amountMinor: true } } } } } });
    const today = todayInZone(settings.timezone);
    return { month, previous, status: month < today.slice(0, 7) ? "complete" : month === today.slice(0, 7) ? "in-progress" : "future", income: totals.income.toString(), expenses: totals.expenses.toString(), savings: totals.savings.toString(), remaining: totals.remaining.toString(), rate: totals.savingsRateBasisPoints?.toString() ?? null, planned: planned?.toString() ?? null, underBudget: planned === null ? null : (planned - totals.expenses).toString(), categories, retirement: { employee: (retirement._sum.employeeMinor ?? 0n).toString(), match: (retirement._sum.employerMatchMinor ?? 0n).toString(), other: (retirement._sum.employerOtherMinor ?? 0n).toString() }, goals: goals.map(g => ({ id: g.id, name: g.name, target: g.targetMinor?.toString() ?? null, current: (g.startingAmountMinor + g.contributions.reduce((sum, c) => sum + c.transaction.amountMinor, 0n)).toString() })) };
  });
}
