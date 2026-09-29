import { z } from "zod";
import { monthValue } from "./ledger-validation";
import { recordId } from "./validation";
import { remainingBudget } from "./finance";

const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use a nonnegative amount with up to two decimal places.");
export const budgetInput = z.object({
  expectedRevision: z.iso.datetime().nullable(),
  income: amount,
  savings: amount,
  savingsRecurring: z.boolean(),
  items: z.array(z.object({ categoryId: recordId, amount, recurring: z.boolean() }).strict()).max(200),
}).strict().refine(v => new Set(v.items.map(i => i.categoryId)).size === v.items.length, { message: "Each category can appear only once.", path: ["items"] });
export const copyBudgetInput = z.object({ sourceMonth: monthValue, recurringOnly: z.boolean() }).strict();

export function monthBounds(month: string) {
  monthValue.parse(month);
  const start = new Date(`${month}-01T00:00:00Z`), end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}
export function neighboringMonth(month: string, delta: number) {
  const { start } = monthBounds(month);
  start.setUTCMonth(start.getUTCMonth() + delta);
  const value = start.toISOString().slice(0, 7);
  return monthValue.safeParse(value).success ? value : null;
}
export const monthLabel = (month: string) => monthBounds(month).start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
export function budgetTotals(income: bigint, savings: bigint, allocated: bigint, expenses: bigint) {
  return { plannedRemainder: income - allocated - savings, remainingToSpend: remainingBudget(income, expenses, savings), categoryRemainder: allocated - expenses };
}
export type BudgetCategory = { id: string; name: string; icon: string; archived: boolean };
export type BudgetRow = { categoryId: string | null; name: string; icon: string; archived: boolean; allocated: boolean; plannedMinor: string; actualMinor: string; remainingMinor: string; recurring: boolean };
export type BudgetView = {
  month: string;
  defaults?: { incomeMinor: string; savingsMinor: string };
  plan: { revision: string; incomeMinor: string; savingsMinor: string; savingsRecurring: boolean; items: { categoryId: string; amountMinor: string; recurring: boolean }[] } | null;
  categories: BudgetCategory[];
  rows: BudgetRow[];
  actual: { incomeMinor: string; expensesMinor: string; savingsMinor: string; remainingMinor: string };
  totals: { allocatedMinor: string; plannedRemainderMinor: string; remainingToSpendMinor: string } | null;
};
