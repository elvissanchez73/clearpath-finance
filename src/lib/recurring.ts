import { z } from "zod";
import { dateOnly, transactionInput, decimalInput } from "./ledger-validation";
import { parseMoney } from "./finance";
export const frequencies = ["DAILY", "WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "YEARLY"] as const;
export type ScheduleFrequency = typeof frequencies[number];
export const frequencyLabel: Record<ScheduleFrequency, string> = { DAILY: "Daily", WEEKLY: "Weekly", BIWEEKLY: "Every two weeks", SEMIMONTHLY: "Twice a month", MONTHLY: "Monthly", YEARLY: "Yearly" };
export const recurringInput = transactionInput.omit({ date: true, description: true, note: true }).extend({
  name: z.string().trim().min(1).max(100), frequency: z.enum(frequencies), nextDueDate: dateOnly,
  firstDay: z.coerce.number().int().min(1).max(31), secondDay: z.coerce.number().int().min(2).max(31),
  active: z.boolean(), autoCreate: z.boolean(), subscription: z.boolean(),
}).strict().refine(v => v.frequency !== "SEMIMONTHLY" || (v.firstDay <= 28 && v.firstDay < v.secondDay), { message: "Use a first day from 1–28 and a later second day.", path: ["secondDay"] });
export const recurringUpdate = recurringInput.safeExtend({ expectedRevision: z.iso.datetime() });
export const recurringAction = z.object({ action: z.enum(["post", "skip"]), dueDate: dateOnly }).strict();
const dateAt = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
export function nextOccurrence(date: string, frequency: ScheduleFrequency, anchorDay: number, anchorMonth: number, secondDay: number | null = null): string | null {
  const current = new Date(date + "T00:00:00Z"), y = current.getUTCFullYear(), m = current.getUTCMonth();
  let next: Date;
  if (frequency === "DAILY" || frequency === "WEEKLY" || frequency === "BIWEEKLY") next = new Date(current.valueOf() + ({ DAILY: 1, WEEKLY: 7, BIWEEKLY: 14 }[frequency]) * 86400000);
  else if (frequency === "YEARLY") next = dateAt(y + 1, anchorMonth - 1, anchorDay);
  else if (frequency === "SEMIMONTHLY") {
    const candidates = [dateAt(y, m, anchorDay), dateAt(y, m, secondDay ?? 31), dateAt(y, m + 1, anchorDay)];
    next = candidates.find(d => d > current)!;
  } else next = dateAt(y, m + 1, anchorDay);
  return next.getUTCFullYear() > 9999 ? null : next.toISOString().slice(0, 10);
}
export function subscriptionEquivalent(amount: bigint, frequency: ScheduleFrequency) {
  const yearly = amount * BigInt({ DAILY: 365, WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12, YEARLY: 1 }[frequency]);
  return { annualMinor: yearly, monthlyMinor: (yearly + 6n) / 12n };
}
export function payrollValues(type: string, net: bigint, gross?: string | null, deductions?: string | null) {
  if (gross == null && deductions == null) return { grossIncomeMinor: null, deductionsMinor: null };
  if (type !== "INCOME") throw new Error("Payroll details are only available for income.");
  if (gross == null) throw new Error("Enter gross income when recording deductions.");
  const grossMinor = parseMoney(gross), deductionsMinor = parseMoney(deductions ?? "0");
  if (grossMinor - deductionsMinor !== net) throw new Error("Gross income minus deductions must equal the net amount received.");
  return { grossIncomeMinor: grossMinor, deductionsMinor };
}
export type RecurringView = {
  id: string; revision: string; name: string; amount: string; type: "INCOME" | "EXPENSE" | "TRANSFER" | "SAVINGS_TRANSFER";
  accountId: string; destinationAccountId: string | null; categoryId: string | null; goalId: string | null;
  grossIncome: string | null; deductions: string | null; frequency: ScheduleFrequency; nextDueDate: string;
  firstDay: number; secondDay: number; active: boolean; autoCreate: boolean; subscription: boolean;
  accountName: string; destinationName: string | null; categoryName: string | null; lastError: string | null;
};
export { decimalInput };
