import { z } from "zod";
import { moneyInput } from "./preferences";
import { parseMoney } from "./finance";
import { retirementInput } from "./income";
const percentage = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, "Use a percentage with up to two decimal places.").refine(v => parseMoney(v) <= 10000n, "Percentage cannot exceed 100.");
export const retirementSettingsInput = z.object({ expectedRevision: z.iso.datetime().nullable(), annualSalary: moneyInput, employeePercent: percentage, matchPercent: percentage, otherPercent: percentage, currentBalance: moneyInput }).strict();
export const contributionUpdate = retirementInput.omit({ requestId: true }).extend({ expectedRevision: z.iso.datetime() });
export const contributionDelete = z.object({ expectedRevision: z.iso.datetime() }).strict();
export function retirementEstimate(salary: bigint, employee: number, match: number, other: number) {
  const estimate = (bp: number) => { const annual = (salary * BigInt(bp) + 5000n) / 10000n; return { annual: annual.toString(), monthly: ((annual + 6n) / 12n).toString() }; };
  return { employee: estimate(employee), match: estimate(match), other: estimate(other) };
}
export type RetirementSettingsView = { revision: string; annualSalary: string; employeePercent: string; matchPercent: string; otherPercent: string; currentBalance: string };
export type ContributionView = { id: string; revision: string; date: string; employee: string; employerMatch: string; employerOther: string; notes: string };
