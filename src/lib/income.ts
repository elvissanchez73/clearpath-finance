import { z } from "zod";
import { dateOnly } from "./ledger-validation";
export const salaryFrequencies = ["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY"] as const;
export const salaryPeriods = { WEEKLY: 52n, BIWEEKLY: 26n, SEMIMONTHLY: 24n, MONTHLY: 12n };
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use a nonnegative amount with at most two decimal places.");
export const incomeInput = z.object({ expectedRevision: z.iso.datetime().nullable(), annualSalary: amount, netPaycheck: amount, payFrequency: z.enum(salaryFrequencies) }).strict();
export const retirementInput = z.object({ requestId: z.uuid().optional(), date: dateOnly, employee: amount, employerMatch: amount, employerOther: amount, notes: z.string().trim().max(500) }).strict();
export function incomeProjection(annual: bigint, netPaycheck: bigint, frequency: typeof salaryFrequencies[number]) {
  const count = salaryPeriods[frequency], annualNet = netPaycheck * count;
  return { grossPerPaycheckMinor: ((annual + count / 2n) / count).toString(), annualNetMinor: annualNet.toString(), monthlyNetMinor: ((annualNet + 6n) / 12n).toString() };
}
export type IncomeView = { month: string; settings: { revision: string; annualSalaryMinor: string; netPaycheckMinor: string; payFrequency: typeof salaryFrequencies[number] } | null; projection: ReturnType<typeof incomeProjection> | null; actualNetMinor: string; documentedGrossMinor: string; documentedDeductionsMinor: string; count: number; documentedCount: number };
