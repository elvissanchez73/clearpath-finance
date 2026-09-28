import { z } from "zod";
import { dateOnly } from "./ledger-validation";
import { recordId } from "./validation";
import { completionMonths, requiredMonthly } from "./finance";

export const goalIcons = ["target", "shield", "home", "car", "plane", "graduation-cap", "heart", "gift"] as const;
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use a nonnegative amount with up to two decimal places.");
export const goalInput = z.object({
  name: z.string().trim().min(1, "Name your goal.").max(80),
  target: amount.nullable(), startingAmount: amount, monthlyContribution: amount,
  targetDate: dateOnly.nullable(), accountId: recordId.nullable(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]), icon: z.enum(goalIcons), notes: z.string().trim().max(500),
}).strict().refine(v => v.target === null ? v.status === "PAUSED" : /[1-9]/.test(v.target), { message: "Set a positive target, or pause the goal without a target.", path: ["target"] });
export const goalUpdate = goalInput.safeExtend({ expectedRevision: z.iso.datetime() });
export const goalOrder = z.object({ ids: z.array(recordId).max(200) }).strict().refine(v => new Set(v.ids).size === v.ids.length, "Each goal must appear once.");
export const roadmapInput = z.object({ monthlyContribution: amount }).strict();

/** Monthly contributions are assumed on today's anniversary, clamped at month end. */
export function projectedDate(today: string, months: bigint | null): string | null {
  if (months === null || months < 0n || months > 120000n) return null;
  const [year, month, day] = today.split("-").map(Number);
  const total = year * 12 + month - 1 + Number(months), y = Math.floor(total / 12), m = total % 12;
  if (y > 9999 || y < 1900) return null;
  return new Date(Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
}
export function goalProjection(current: bigint, target: bigint | null, monthly: bigint, today: string, targetDate: string | null) {
  const remaining = target === null ? null : target > current ? target - current : 0n;
  const months = remaining === null ? null : completionMonths(remaining, monthly);
  let slots = 0;
  if (targetDate && targetDate > today) {
    const from = new Date(today), to = new Date(targetDate);
    slots = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
    if ((projectedDate(today, BigInt(slots)) || "9999-12-31") > targetDate) slots--;
  }
  const required = targetDate && remaining !== null ? requiredMonthly(remaining, slots) : null;
  return { remainingMinor: remaining?.toString() ?? null, months: months?.toString() ?? null, estimatedDate: projectedDate(today, months), requiredMonthlyMinor: required?.toString() ?? null, sufficient: required === null ? null : monthly >= required };
}
export type GoalView = {
  id: string; revision: string; name: string; targetMinor: string | null; startingAmountMinor: string;
  monthlyContributionMinor: string; currentMinor: string; monthContributionMinor: string; contributionCount: number;
  targetDate: string | null; accountId: string | null; accountName: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED"; icon: string; notes: string; priority: number;
  projection: ReturnType<typeof goalProjection>;
};
export type GoalsView = { goals: GoalView[]; accounts: { id: string; name: string; archived: boolean }[]; today: string; roadmapMonthlyMinor: string };
export function roadmap(goals: GoalView[], monthly: bigint, today: string) {
  let cumulative = 0n;
  return goals.map(goal => {
    if (goal.status !== "ACTIVE") return { id: goal.id, months: null, estimatedDate: null };
    cumulative += BigInt(goal.projection.remainingMinor || "0");
    const months = completionMonths(cumulative, monthly);
    return { id: goal.id, months: months?.toString() ?? null, estimatedDate: projectedDate(today, months) };
  });
}
