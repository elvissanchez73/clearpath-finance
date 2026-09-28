import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { ApiError } from "./errors";
import { analyticsInput, firstMonth, buildTrend, type MonthlyAggregate, type AnalyticsView } from "@/lib/analytics";
import { monthBounds } from "@/lib/budget";
import { cashFlowTotals } from "@/lib/finance";

export async function analyticsView(userId: string, input: unknown): Promise<AnalyticsView> {
  const filter = analyticsInput.parse(input), { end } = monthBounds(filter.month);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const accounts = await tx.account.findMany({ where: { userId }, orderBy: { name: "asc" } });
    if (filter.account && !accounts.some(a => a.id === filter.account)) throw new ApiError(404, "Account not found.");
    // Aggregate in PostgreSQL; only monthly totals cross the database boundary.
    const rows = await tx.$queryRaw<MonthlyAggregate[]>`
      SELECT to_char(date, 'YYYY-MM') AS month,
        COALESCE(SUM("amountMinor") FILTER (WHERE type = 'INCOME'), 0)::bigint AS income,
        COALESCE(SUM("amountMinor") FILTER (WHERE type = 'EXPENSE'), 0)::bigint AS expenses,
        COALESCE(SUM("amountMinor") FILTER (WHERE type = 'SAVINGS_TRANSFER'), 0)::bigint AS savings,
        COALESCE(SUM(CASE WHEN ${filter.account} = '' THEN
          CASE WHEN type = 'INCOME' THEN "amountMinor" WHEN type = 'EXPENSE' THEN -"amountMinor" ELSE 0 END
          ELSE (CASE WHEN "accountId" = ${filter.account} THEN CASE WHEN type = 'INCOME' THEN "amountMinor" ELSE -"amountMinor" END ELSE 0 END)
             + (CASE WHEN "destinationAccountId" = ${filter.account} THEN "amountMinor" ELSE 0 END) END), 0)::bigint AS delta
      FROM "Transaction" WHERE "userId" = ${userId} AND date < ${end}
      GROUP BY to_char(date, 'YYYY-MM') ORDER BY month`;
    const firstBudget = await tx.monthlyBudget.findFirst({ where: { userId, month: { lt: end } }, orderBy: { month: "asc" }, select: { month: true } });
    const earliest = [rows[0]?.month, firstBudget?.month.toISOString().slice(0, 7)].filter((m): m is string => !!m).sort()[0];
    const start = firstMonth(filter.month, filter.range, earliest), from = monthBounds(start).start;
    const rangeRows = rows.filter(r => r.month >= start);
    const totals = cashFlowTotals(...(["income", "expenses", "savings"] as const).map(k => rangeRows.reduce((s, r) => s + r[k], 0n)) as [bigint, bigint, bigint]);
    const opening = accounts.filter(a => !filter.account || a.id === filter.account).reduce((sum, a) => sum + a.startingBalanceMinor, 0n);
    const trend = buildTrend(rows, start, filter.month, opening);
    const spent = await tx.transaction.groupBy({ by: ["categoryId"], where: { userId, type: "EXPENSE", date: { gte: from, lt: end } }, _sum: { amountMinor: true } });
    const budgets = await tx.monthlyBudget.findMany({ where: { userId, month: { gte: from, lt: end } }, include: { items: true } });
    const categories = await tx.category.findMany({ where: { userId } });
    const ids = new Set([...spent.map(r => r.categoryId ?? "uncategorized"), ...budgets.flatMap(b => b.items.map(i => i.categoryId))]);
    const categoryRows = [...ids].map(id => {
      const items = budgets.flatMap(b => b.items).filter(i => i.categoryId === id);
      return { id, name: categories.find(c => c.id === id)?.name ?? "Uncategorized", amount: (spent.find(s => (s.categoryId ?? "uncategorized") === id)?._sum.amountMinor ?? 0n).toString(), planned: items.length ? items.reduce((s, i) => s + i.amountMinor, 0n).toString() : null };
    }).sort((a, b) => BigInt(a.amount) === BigInt(b.amount) ? a.name.localeCompare(b.name) : BigInt(a.amount) > BigInt(b.amount) ? -1 : 1);
    const goals = await tx.savingsGoal.findMany({ where: { userId }, orderBy: [{ priority: "asc" }, { id: "asc" }], include: { contributions: { include: { transaction: { select: { amountMinor: true } } } } } });
    return { filter, start, end: filter.month, ...trend, totals: { income: totals.income.toString(), expenses: totals.expenses.toString(), savings: totals.savings.toString(), remaining: totals.remaining.toString(), rate: totals.savingsRateBasisPoints?.toString() ?? null }, categories: categoryRows, plannedMonths: budgets.length, accounts: accounts.map(a => ({ id: a.id, name: a.name, archived: a.archived })), goals: goals.map(g => ({ id: g.id, name: g.name, current: (g.startingAmountMinor + g.contributions.reduce((sum, c) => sum + c.transaction.amountMinor, 0n)).toString(), target: g.targetMinor?.toString() ?? null, status: g.status })) };
  });
}
