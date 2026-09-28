import { z } from "zod";
import { parseMoney } from "./finance";
import { recordId } from "./validation";

export const accountTypes = ["CHECKING", "SAVINGS", "HYSA", "CASH", "CREDIT_CARD", "INVESTMENT", "OTHER"] as const;
export const transactionTypes = ["EXPENSE", "INCOME", "TRANSFER", "SAVINGS_TRANSFER"] as const;
export const categoryIcons = ["home", "shopping-basket", "car", "utensils", "heart", "zap", "music", "briefcase", "gift", "circle"] as const;
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount with up to two decimal places.");
const signedAmount = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Enter a balance with up to two decimal places.");
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => {
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= "9999-12-31";
}, "Choose a valid calendar date.");
export const monthValue = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a valid month.").refine(value => value >= "1900-01" && value <= "9999-12", "Choose a valid month.");
export const accountInput = z.object({
  name: z.string().trim().min(1, "Give this account a name.").max(80),
  type: z.enum(accountTypes), startingBalance: signedAmount,
  institution: z.string().trim().max(100).default(""), description: z.string().trim().max(500).default(""),
}).strict();
export const accountChanges = accountInput.omit({ institution: true, description: true }).partial().extend({ institution: z.string().trim().max(100).optional(), description: z.string().trim().max(500).optional(), archived: z.boolean().optional() }).strict();
export const categoryInput = z.object({ name: z.string().trim().min(1, "Give this category a name.").max(60), icon: z.enum(categoryIcons).default("circle") }).strict();
export const categoryChanges = categoryInput.omit({ icon: true }).partial().extend({ icon: z.enum(categoryIcons).optional(), archived: z.boolean().optional() }).strict();
const optionalId = recordId.nullable().optional();
export const transactionInput = z.object({
  type: z.enum(transactionTypes), amount: amount.pipe(z.string().refine(value => parseMoney(value) > 0n, "Amount must be greater than zero.")),
  date: dateOnly, description: z.string().trim().min(1, "Add a description.").max(160),
  accountId: recordId, destinationAccountId: optionalId, categoryId: optionalId, goalId: optionalId,
  note: z.string().trim().max(500).nullable().optional(),
  grossIncome: amount.nullable().optional(), deductions: amount.nullable().optional(),
}).strict();
export const transactionCreate = transactionInput.extend({ requestId: z.uuid() }).strict();
export const transactionChanges = transactionInput.partial().strict();
export const transactionFilters = z.object({
  q: z.string().trim().max(100).default(""), type: z.enum([...transactionTypes, ""]).default(""),
  account: recordId.or(z.literal("")).default(""), category: recordId.or(z.literal("")).default(""),
  goal: recordId.or(z.literal("")).default(""),
  from: dateOnly.or(z.literal("")).default(""), to: dateOnly.or(z.literal("")).default(""),
  min: amount.or(z.literal("")).default(""), max: amount.or(z.literal("")).default(""),
  sort: z.enum(["newest", "oldest", "highest", "lowest", "category"]).default("newest"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict().refine(v => !v.from || !v.to || v.from <= v.to, { message: "Start date must be before end date.", path: ["to"] }).refine(v => !v.min || !v.max || !amount.safeParse(v.min).success || !amount.safeParse(v.max).success || parseMoney(v.min) <= parseMoney(v.max), { message: "Minimum amount must not exceed maximum.", path: ["max"] });

export function decimalInput(minor: bigint | string) {
  const value = BigInt(minor), positive = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${positive / 100n}.${(positive % 100n).toString().padStart(2, "0")}`;
}
export function todayInZone(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
