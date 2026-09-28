import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { ApiError } from "./errors";
import { financialPreferences, onboardingInput } from "@/lib/preferences";
import { parseMoney } from "@/lib/finance";
export async function saveFinancialPreferences(userId: string, input: unknown) {
  const data = financialPreferences.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    if (settings.updatedAt.toISOString() !== data.expectedRevision) throw new ApiError(409, "Preferences changed. Reload before saving.");
    await tx.userSettings.update({ where: { userId }, data: { defaultIncomeMinor: parseMoney(data.defaultIncome), defaultBudgetSavingsMinor: parseMoney(data.defaultSavings), notificationsEnabled: data.notificationsEnabled, updatedAt: new Date(Math.max(Date.now(), settings.updatedAt.valueOf() + 1)) } });
    return { ok: true };
  });
}
export async function saveOnboarding(userId: string, input: unknown) {
  const data = onboardingInput.parse(input);
  return withOwner(userId, async tx => { await lockOwner(tx, userId); await tx.userSettings.update({ where: { userId }, data: { onboardingStep: data.step, onboardingComplete: data.complete } }); return { ok: true }; });
}
