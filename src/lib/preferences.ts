import { z } from "zod";
export const moneyInput = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use a nonnegative amount with up to two decimal places.");
export const financialPreferences = z.object({ expectedRevision: z.iso.datetime(), defaultIncome: moneyInput, defaultSavings: moneyInput, notificationsEnabled: z.boolean() }).strict();
export const onboardingInput = z.object({ step: z.number().int().min(0).max(4), complete: z.boolean() }).strict();
