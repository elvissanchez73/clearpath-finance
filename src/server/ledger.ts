import "server-only";
import type { Prisma, Transaction } from "@prisma/client";
import { withOwner } from "./db";
import { ApiError } from "./errors";
import { parseMoney, sourceDelta, cashFlowTotals } from "@/lib/finance";
import { accountInput, accountChanges, categoryInput, categoryChanges, transactionCreate, transactionChanges, transactionFilters, decimalInput, todayInZone, monthValue } from "@/lib/ledger-validation";
import type { AccountView, CategoryView, TransactionView } from "@/lib/ledger-types";
import { payrollValues } from "@/lib/recurring";
import { lockOwner } from "./owner-lock";
import { validateGoalLink, refreshGoalStatus } from "./goal-links";

const missing = () => new ApiError(404, "Record not found.");
export async function createAccount(userId: string, input: unknown) {
  const data = accountInput.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (await tx.account.count({ where: { userId, name: { equals: data.name, mode: "insensitive" } } })) throw new ApiError(409, "You already have an account with that name.");
    return tx.account.create({ data: { userId, name: data.name, type: data.type, startingBalanceMinor: parseMoney(data.startingBalance), institution: data.institution || null, description: data.description || null } });
  });
}
export async function updateAccount(userId: string, id: string, input: unknown) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const existing = await tx.account.findFirst({ where: { id, userId } });
    if (!existing) throw missing();
    const data = accountChanges.parse(input);
    if (data.name && await tx.account.count({ where: { userId, id: { not: id }, name: { equals: data.name, mode: "insensitive" } } })) throw new ApiError(409, "You already have an account with that name.");
    if (data.type && !["SAVINGS", "HYSA"].includes(data.type) && await tx.transaction.count({ where: { userId, destinationAccountId: id, type: "SAVINGS_TRANSFER" } })) throw new ApiError(409, "This account receives savings transfers. Keep it as savings or HYSA, or edit those transfers first.");
    if (data.type && !["SAVINGS", "HYSA"].includes(data.type) && await tx.savingsGoal.count({ where: { userId, accountId: id } })) throw new ApiError(409, "This account is associated with a savings goal. Remove that association before changing its type.");
    if (data.type && !["SAVINGS", "HYSA"].includes(data.type) && await tx.recurringTransaction.count({ where: { userId, destinationAccountId: id, type: "SAVINGS_TRANSFER" } })) throw new ApiError(409, "This account receives scheduled savings transfers. Update those schedules first.");
    const { startingBalance, ...fields } = data;
    if (startingBalance !== undefined) await tx.accountBalanceSnapshot.deleteMany({ where: { userId, accountId: id } });
    return tx.account.update({ where: { id_userId: { id, userId } }, data: { ...fields, ...(startingBalance !== undefined ? { startingBalanceMinor: parseMoney(startingBalance) } : {}) } });
  });
}
export async function createCategory(userId: string, input: unknown) {
  const data = categoryInput.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (await tx.category.count({ where: { userId, name: { equals: data.name, mode: "insensitive" } } })) throw new ApiError(409, "You already have a category with that name.");
    return tx.category.create({ data: { ...data, userId } });
  });
}
export async function updateCategory(userId: string, id: string, input: unknown) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (!await tx.category.findFirst({ where: { id, userId } })) throw missing();
    const data = categoryChanges.parse(input);
    if (data.name && await tx.category.count({ where: { userId, id: { not: id }, name: { equals: data.name, mode: "insensitive" } } })) throw new ApiError(409, "You already have a category with that name.");
    return tx.category.update({ where: { id_userId: { id, userId } }, data });
  });
}
export async function transactionData(tx: Prisma.TransactionClient, userId: string, data: { type: Transaction["type"]; accountId: string; destinationAccountId?: string | null; categoryId?: string | null; date: string; description: string; amount: string; note?: string | null; grossIncome?: string | null; deductions?: string | null }, previous?: Transaction) {
  const transfer = data.type === "TRANSFER" || data.type === "SAVINGS_TRANSFER";
  const account = await tx.account.findFirst({ where: { id: data.accountId, userId } });
  if (!account) throw missing();
  if (account.archived && account.id !== previous?.accountId) throw new ApiError(409, "Choose an active account.");
  if (transfer) {
    if (!data.destinationAccountId || data.destinationAccountId === data.accountId) throw new ApiError(400, "Choose a different destination account.");
    const destination = await tx.account.findFirst({ where: { id: data.destinationAccountId, userId } });
    if (!destination) throw missing();
    if (destination.archived && destination.id !== previous?.destinationAccountId) throw new ApiError(409, "Choose an active destination account.");
    if (data.type === "SAVINGS_TRANSFER" && !["SAVINGS", "HYSA"].includes(destination.type)) throw new ApiError(400, "Savings transfers must go to a savings or HYSA account.");
    if (data.categoryId) throw new ApiError(400, "Transfers do not use spending categories.");
  } else if (data.destinationAccountId) throw new ApiError(400, "Only transfers have a destination account.");
  if (data.categoryId) {
    const category = await tx.category.findFirst({ where: { id: data.categoryId, userId } });
    if (!category) throw missing();
    if (category.archived && category.id !== previous?.categoryId) throw new ApiError(409, "Choose an active category.");
  }
  const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
  if (data.date > todayInZone(settings.timezone)) throw new ApiError(400, "Record transactions on or before today. Future bills belong in a recurring plan.");
  let payroll; try { payroll = payrollValues(data.type, parseMoney(data.amount), data.grossIncome, data.deductions); } catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Check payroll amounts."); }
  return { ...payroll, userId, type: data.type, accountId: data.accountId, destinationAccountId: data.destinationAccountId || null, categoryId: data.categoryId || null, date: new Date(data.date + "T00:00:00Z"), description: data.description, amountMinor: parseMoney(data.amount), note: data.note || null };
}
export async function createTransaction(userId: string, input: unknown) {
  const data = transactionCreate.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const existing = await tx.transaction.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: data.requestId } } });
    const values = await transactionData(tx, userId, data, existing ?? undefined);
    const previousLink = existing ? await tx.goalContribution.findUnique({ where: { transactionId: existing.id } }) : null;
    await validateGoalLink(tx, userId, data.goalId ?? null, values, previousLink?.goalId);
    if (existing) {
      const matches = existing.amountMinor === values.amountMinor && existing.date.valueOf() === values.date.valueOf() && existing.type === values.type && existing.description === values.description && existing.accountId === values.accountId && existing.destinationAccountId === values.destinationAccountId && existing.categoryId === values.categoryId && existing.note === values.note && existing.grossIncomeMinor === values.grossIncomeMinor && existing.deductionsMinor === values.deductionsMinor;
      if (!matches || (previousLink?.goalId ?? null) !== (data.goalId ?? null)) throw new ApiError(409, "This entry was already saved with different details. Close this form and open a new one.");
      return existing;
    }
    const result = await tx.transaction.create({ data: { ...values, clientRequestId: data.requestId } });
    if (data.goalId) await tx.goalContribution.create({ data: { userId, goalId: data.goalId, transactionId: result.id } });
    await refreshGoalStatus(tx, userId, data.goalId);
    await tx.accountBalanceSnapshot.deleteMany({ where: { userId, accountId: { in: [values.accountId, values.destinationAccountId].filter((v): v is string => !!v) } } });
    return result;
  });
}
export async function updateTransaction(userId: string, id: string, input: unknown) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const existing = await tx.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw missing();
    const changes = transactionChanges.parse(input);
    const values = await transactionData(tx, userId, { ...existing, grossIncome: existing.grossIncomeMinor === null ? null : decimalInput(existing.grossIncomeMinor), deductions: existing.deductionsMinor === null ? null : decimalInput(existing.deductionsMinor), amount: decimalInput(existing.amountMinor), date: existing.date.toISOString().slice(0, 10), ...changes }, existing);
    const previousLink = await tx.goalContribution.findUnique({ where: { transactionId: id } });
    const goalId = changes.goalId === undefined ? previousLink?.goalId ?? null : changes.goalId;
    if (values.type !== "SAVINGS_TRANSFER" && goalId) throw new ApiError(409, "Remove this transaction's goal assignment before changing its type.");
    await validateGoalLink(tx, userId, goalId, values, previousLink?.goalId);
    if (previousLink && goalId !== previousLink.goalId) await tx.goalContribution.delete({ where: { transactionId: id } });
    // Values are derived from the ledger, so both accounts and any goal update together.
    const result = await tx.transaction.update({ where: { id_userId: { id, userId } }, data: values });
    if (goalId && goalId !== previousLink?.goalId) await tx.goalContribution.create({ data: { userId, goalId, transactionId: id } });
    for (const affected of new Set([previousLink?.goalId, goalId])) await refreshGoalStatus(tx, userId, affected);
    await tx.accountBalanceSnapshot.deleteMany({ where: { userId, accountId: { in: [existing.accountId, existing.destinationAccountId, values.accountId, values.destinationAccountId].filter((v): v is string => !!v) } } });
    return result;
  });
}
export async function deleteLedgerRecord(userId: string, resource: "accounts" | "categories" | "transactions", id: string) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (resource === "transactions") {
      const record = await tx.transaction.findFirst({ where: { id, userId } });
      if (!record) throw missing();
      const link = await tx.goalContribution.findUnique({ where: { transactionId: id } });
      await tx.transaction.delete({ where: { id_userId: { id, userId } } });
      await refreshGoalStatus(tx, userId, link?.goalId);
      await tx.accountBalanceSnapshot.deleteMany({ where: { userId, accountId: { in: [record.accountId, record.destinationAccountId].filter((v): v is string => !!v) } } });
    } else {
      const count = resource === "accounts" ? await tx.account.count({ where: { id, userId } }) : await tx.category.count({ where: { id, userId } });
      if (!count) throw missing();
      const used = resource === "accounts"
        ? await tx.transaction.count({ where: { userId, OR: [{ accountId: id }, { destinationAccountId: id }] } }) || await tx.savingsGoal.count({ where: { userId, accountId: id } }) || await tx.recurringTransaction.count({ where: { userId, OR: [{ accountId: id }, { destinationAccountId: id }] } })
        : await tx.transaction.count({ where: { userId, categoryId: id } }) || await tx.budgetItem.count({ where: { userId, categoryId: id } }) || await tx.recurringTransaction.count({ where: { userId, categoryId: id } });
      if (used) throw new ApiError(409, "This item is used by existing records. Archive it to preserve your history.");
      try {
        if (resource === "accounts") await tx.account.delete({ where: { id_userId: { id, userId } } });
        else await tx.category.delete({ where: { id_userId: { id, userId } } });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") throw new ApiError(409, "This item is used by existing records. Archive it to preserve your history.");
        throw error;
      }
    }
    return { ok: true };
  });
}

const transactionInclude = { account: { select: { name: true } }, destinationAccount: { select: { name: true } }, category: { select: { name: true, icon: true } }, contribution: { select: { goalId: true, goal: { select: { name: true } } } } } satisfies Prisma.TransactionInclude;
function transactionView(row: Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>): TransactionView {
  return { grossIncomeMinor: row.grossIncomeMinor?.toString() ?? null, deductionsMinor: row.deductionsMinor?.toString() ?? null, id: row.id, type: row.type, amountMinor: row.amountMinor.toString(), date: row.date.toISOString().slice(0, 10), description: row.description, note: row.note, accountId: row.accountId, destinationAccountId: row.destinationAccountId, categoryId: row.categoryId, account: row.account, destinationAccount: row.destinationAccount, category: row.category, goalId: row.contribution?.goalId ?? null, goalName: row.contribution?.goal.name ?? null };
}
export async function ledgerOptions(userId: string) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const accounts = await tx.account.findMany({ where: { userId }, orderBy: [{ archived: "asc" }, { name: "asc" }] });
    const categories: CategoryView[] = await tx.category.findMany({ where: { userId }, select: { id: true, name: true, icon: true, archived: true }, orderBy: [{ archived: "asc" }, { name: "asc" }] });
    const out = await tx.transaction.groupBy({ by: ["accountId", "type"], where: { userId }, _sum: { amountMinor: true } });
    const incoming = await tx.transaction.groupBy({ by: ["destinationAccountId"], where: { userId, type: { in: ["TRANSFER", "SAVINGS_TRANSFER"] } }, _sum: { amountMinor: true } });
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    const views: AccountView[] = accounts.map(account => {
      const balance = out.filter(row => row.accountId === account.id).reduce((sum, row) => sum + sourceDelta(row.type, row._sum.amountMinor ?? 0n), account.startingBalanceMinor) + (incoming.find(row => row.destinationAccountId === account.id)?._sum.amountMinor ?? 0n);
      return { id: account.id, name: account.name, type: account.type, institution: account.institution, description: account.description, archived: account.archived, startingBalanceMinor: account.startingBalanceMinor.toString(), balanceMinor: balance.toString() };
    });
    const recentExpense = await tx.transaction.findFirst({ where: { userId, type: "EXPENSE", category: { archived: false } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { categoryId: true } });
    const goals = await tx.savingsGoal.findMany({ where: { userId }, select: { id: true, name: true, status: true, accountId: true }, orderBy: [{ priority: "asc" }, { id: "asc" }] });
    return { accounts: views, categories, goals, recentExpenseCategoryId: recentExpense?.categoryId ?? null, today: todayInZone(settings.timezone) };
  });
}
export async function searchTransactions(userId: string, input: unknown) {
  const filter = transactionFilters.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (filter.account && !await tx.account.count({ where: { id: filter.account, userId } })) throw missing();
    if (filter.category && filter.category !== "uncategorized" && !await tx.category.count({ where: { id: filter.category, userId } })) throw missing();
    if (filter.goal && !await tx.savingsGoal.count({ where: { id: filter.goal, userId } })) throw missing();
    const where: Prisma.TransactionWhereInput = {
      userId, ...(filter.q ? { description: { contains: filter.q, mode: "insensitive" } } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.account ? { OR: [{ accountId: filter.account }, { destinationAccountId: filter.account }] } : {}),
      ...(filter.category ? { categoryId: filter.category === "uncategorized" ? null : filter.category } : {}),
      ...(filter.goal ? { contribution: { goalId: filter.goal } } : {}),
      ...(filter.from || filter.to ? { date: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } } : {}),
      ...(filter.min || filter.max ? { amountMinor: { ...(filter.min ? { gte: parseMoney(filter.min) } : {}), ...(filter.max ? { lte: parseMoney(filter.max) } : {}) } } : {}),
    };
    const orders: Record<typeof filter.sort, Prisma.TransactionOrderByWithRelationInput> = { newest: { date: "desc" }, oldest: { date: "asc" }, highest: { amountMinor: "desc" }, lowest: { amountMinor: "asc" }, category: { category: { name: "asc" } } };
    const total = await tx.transaction.count({ where });
    const pages = Math.max(1, Math.ceil(total / 25)), page = Math.min(filter.page, pages);
    const rows = await tx.transaction.findMany({ where, include: transactionInclude, orderBy: [orders[filter.sort], { id: "desc" }], skip: (page - 1) * 25, take: 25 });
    return { records: rows.map(transactionView), total, page, pages };
  });
}
export async function ledgerOverview(userId: string, month: string) {
  monthValue.parse(month);
  const start = new Date(month + "-01T00:00:00Z"), end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const groups = await tx.transaction.groupBy({ by: ["type"], where: { userId, date: { gte: start, lt: end } }, _sum: { amountMinor: true } });
    const sum = (type: Transaction["type"]) => groups.find(row => row.type === type)?._sum.amountMinor ?? 0n;
    const income = sum("INCOME"), expenses = sum("EXPENSE"), savings = sum("SAVINGS_TRANSFER");
    const recent = await tx.transaction.findMany({ where: { userId, date: { gte: start, lt: end } }, include: transactionInclude, orderBy: [{ date: "desc" }, { id: "desc" }], take: 5 });
    const totals = cashFlowTotals(income, expenses, savings);
    return { ...totals, rate: totals.savingsRateBasisPoints, recent: recent.map(transactionView) };
  });
}
