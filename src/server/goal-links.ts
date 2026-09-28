import "server-only";
import type { Prisma, Transaction } from "@prisma/client";
import { ApiError } from "./errors";

export async function validateGoalLink(tx: Prisma.TransactionClient, userId: string, goalId: string | null, transaction: Pick<Transaction, "type" | "destinationAccountId">, previousGoalId?: string | null) {
  if (!goalId) return;
  const goal = await tx.savingsGoal.findFirst({ where: { id: goalId, userId } });
  if (!goal) throw new ApiError(404, "Record not found.");
  if (transaction.type !== "SAVINGS_TRANSFER") throw new ApiError(400, "Only savings transfers can contribute to a goal.");
  if (goal.status !== "ACTIVE" && goalId !== previousGoalId) throw new ApiError(409, "Choose an active goal, or resume this goal first.");
  if (goal.accountId && goal.accountId !== transaction.destinationAccountId) throw new ApiError(400, "The transfer must go to this goal's associated savings account.");
}
export async function refreshGoalStatus(tx: Prisma.TransactionClient, userId: string, goalId: string | null | undefined) {
  if (!goalId) return;
  const goal = await tx.savingsGoal.findFirst({ where: { id: goalId, userId } });
  if (!goal) return;
  const amounts = await tx.transaction.aggregate({ where: { userId, contribution: { goalId } }, _sum: { amountMinor: true } });
  const current = goal.startingAmountMinor + (amounts._sum.amountMinor ?? 0n);
  const status = goal.status === "PAUSED" ? "PAUSED" : goal.targetMinor !== null && current >= goal.targetMinor ? "COMPLETED" : "ACTIVE";
  // A contribution change invalidates any open goal editor, even when status stays the same.
  await tx.savingsGoal.update({ where: { id_userId: { id: goalId, userId } }, data: { status, updatedAt: new Date(Math.max(Date.now(), goal.updatedAt.valueOf() + 1)) } });
}
