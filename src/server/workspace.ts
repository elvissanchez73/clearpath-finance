import "server-only";
import { z } from "zod";
import { withOwner } from "./db";
import { ApiError } from "./errors";
import { minorUnits, preferences, recordId } from "@/lib/validation";
import type { Account, Transaction, MonthlyBudget, SavingsGoal, UserSettings } from "@prisma/client";
import { updateAccount, updateTransaction, deleteLedgerRecord } from "./ledger";
import { lockOwner } from "./owner-lock";
import { deleteGoal } from "./goals";
type OwnedRecord = Account | Transaction | MonthlyBudget | SavingsGoal | UserSettings;

export const resourceSchema = z.enum(["accounts", "transactions", "budgets", "goals", "settings"]);
export type Resource = z.infer<typeof resourceSchema>;
const budgetPatch = z.object({ plannedIncomeMinor: minorUnits, plannedSavingsMinor: minorUnits }).strict();
const goalPatch = z.object({ name: z.string().trim().min(1).max(80) }).strict();

/** Session identity enters once; explicit filters and PostgreSQL RLS both enforce ownership. */
export async function listRecords(userId: string, resource: Resource) {
  return withOwner<OwnedRecord[]>(userId, tx => {
    switch (resource) {
      case "accounts": return tx.account.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
      case "transactions": return tx.transaction.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 100 });
      case "budgets": return tx.monthlyBudget.findMany({ where: { userId }, orderBy: { month: "desc" }, take: 100 });
      case "goals": return tx.savingsGoal.findMany({ where: { userId }, orderBy: { priority: "asc" }, take: 100 });
      case "settings": return tx.userSettings.findMany({ where: { userId } });
    }
  });
}
export async function getRecord(userId: string, resource: Resource, id: string) {
  recordId.parse(id);
  const record = await withOwner<OwnedRecord | null>(userId, tx => {
    const where = { id, userId };
    switch (resource) {
      case "accounts": return tx.account.findFirst({ where });
      case "transactions": return tx.transaction.findFirst({ where });
      case "budgets": return tx.monthlyBudget.findFirst({ where });
      case "goals": return tx.savingsGoal.findFirst({ where });
      case "settings": return tx.userSettings.findFirst({ where });
    }
  });
  if (!record) throw new ApiError(404, "Record not found.");
  return record;
}
export async function updateRecord(userId: string, resource: Resource, id: string, input: unknown) {
  recordId.parse(id);
  if (resource === "accounts") return updateAccount(userId, id, input);
  if (resource === "transactions") return updateTransaction(userId, id, input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const where = { id, userId };
    const exists = await ({ accounts: tx.account, transactions: tx.transaction, budgets: tx.monthlyBudget, goals: tx.savingsGoal, settings: tx.userSettings }[resource] as unknown as { count(args: { where: { id: string; userId: string } }): Promise<number> }).count({ where });
    if (!exists) throw new ApiError(404, "Record not found.");
    let result: { count: number };
    switch (resource) {
      case "budgets": {
        const previous = await tx.monthlyBudget.findFirstOrThrow({ where });
        result = await tx.monthlyBudget.updateMany({ where, data: { ...budgetPatch.parse(input), updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.valueOf() + 1)) } });
        break;
      }
      case "goals": {
        const data = goalPatch.parse(input), previous = await tx.savingsGoal.findFirstOrThrow({ where });
        if (await tx.savingsGoal.count({ where: { userId, id: { not: id }, name: { equals: data.name, mode: "insensitive" } } })) throw new ApiError(409, "You already have a goal with that name.");
        result = await tx.savingsGoal.updateMany({ where, data: { ...data, updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.valueOf() + 1)) } }); break;
      }
      case "settings": result = await tx.userSettings.updateMany({ where, data: preferences.parse(input) }); break;
    }
    if (!result.count) throw new ApiError(404, "Record not found.");
    return { ok: true };
  });
}
export async function deleteRecord(userId: string, resource: Resource, id: string) {
  recordId.parse(id);
  if (resource === "accounts" || resource === "transactions") return deleteLedgerRecord(userId, resource, id);
  if (resource === "goals") return deleteGoal(userId, id);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const where = { id, userId };
    let result: { count: number };
    switch (resource) {
      case "budgets": result = await tx.monthlyBudget.deleteMany({ where }); break;
      case "settings": {
        const exists = await tx.userSettings.count({ where });
        if (!exists) throw new ApiError(404, "Record not found.");
        throw new ApiError(409, "Workspace preferences cannot be deleted.");
      }
    }
    if (!result.count) throw new ApiError(404, "Record not found.");
    return { ok: true };
  });
}
