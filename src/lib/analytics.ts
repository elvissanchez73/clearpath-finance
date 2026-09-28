import { z } from "zod";
import { monthValue } from "./ledger-validation";
import { recordId } from "./validation";
import { cashFlowTotals } from "./finance";
export const analyticsInput = z.object({ month: monthValue, range: z.enum(["1", "3", "6", "12", "all"]).default("6"), account: recordId.or(z.literal("")).default("") }).strict();
export type AnalyticsFilter = z.infer<typeof analyticsInput>;
export type MonthlyAggregate = { month: string; income: bigint; expenses: bigint; savings: bigint; delta: bigint };
export type TrendPoint = { period: string; income: string; expenses: string; savings: string; remaining: string; rate: string | null; balance: string };
export function firstMonth(month: string, range: AnalyticsFilter["range"], earliest?: string) {
  if (range === "all") return earliest && earliest < month ? earliest : month;
  const date = new Date(month + "-01T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() - Number(range) + 1);
  return date.getUTCFullYear() < 1900 ? "1900-01" : date.toISOString().slice(0, 7);
}
export function buildTrend(rows: MonthlyAggregate[], start: string, end: string, opening: bigint) {
  const count = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5)) - Number(start.slice(5)) + 1;
  const yearly = count > 120, byMonth = new Map(rows.map(r => [r.month, r]));
  let balance = opening + rows.filter(r => r.month < start).reduce((sum, r) => sum + r.delta, 0n);
  const buckets = new Map<string, { income: bigint; expenses: bigint; savings: bigint; balance: bigint }>();
  const date = new Date(start + "-01T00:00:00Z");
  for (let i = 0; i < count; i++) {
    const month = date.toISOString().slice(0, 7), row = byMonth.get(month), key = yearly ? month.slice(0, 4) : month;
    balance += row?.delta ?? 0n;
    const b = buckets.get(key) ?? { income: 0n, expenses: 0n, savings: 0n, balance };
    b.income += row?.income ?? 0n; b.expenses += row?.expenses ?? 0n; b.savings += row?.savings ?? 0n; b.balance = balance;
    buckets.set(key, b); date.setUTCMonth(date.getUTCMonth() + 1);
  }
  const points: TrendPoint[] = [...buckets].map(([period, b]) => {
    const totals = cashFlowTotals(b.income, b.expenses, b.savings);
    return { period, income: b.income.toString(), expenses: b.expenses.toString(), savings: b.savings.toString(), remaining: totals.remaining.toString(), rate: totals.savingsRateBasisPoints?.toString() ?? null, balance: b.balance.toString() };
  });
  return { points, yearly };
}
export type AnalyticsView = {
  filter: AnalyticsFilter; start: string; end: string; yearly: boolean; points: TrendPoint[];
  totals: { income: string; expenses: string; savings: string; remaining: string; rate: string | null };
  categories: { id: string; name: string; amount: string; planned: string | null }[];
  plannedMonths: number; accounts: { id: string; name: string; archived: boolean }[];
  goals: { id: string; name: string; current: string; target: string | null; status: string }[];
};
