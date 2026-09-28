import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { ApiError } from "./errors";
import { goalInput, goalUpdate, goalOrder, roadmapInput, goalProjection, type GoalsView } from "@/lib/goals";
import { parseMoney } from "@/lib/finance";
import { todayInZone } from "@/lib/ledger-validation";
import { monthBounds } from "@/lib/budget";
import { refreshGoalStatus } from "./goal-links";

export async function saveGoal(userId: string, input: unknown, id?: string) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const previous = id ? await tx.savingsGoal.findFirst({ where: { id, userId } }) : null;
    if (id && !previous) throw new ApiError(404, "Record not found.");
    const data = id ? goalUpdate.parse(input) : goalInput.parse(input);
    if (previous && "expectedRevision" in data && data.expectedRevision !== previous.updatedAt.toISOString()) throw new ApiError(409, "This goal changed. Close the editor and reload before saving.");
    if (!id && await tx.savingsGoal.count({ where: { userId } }) >= 200) throw new ApiError(409, "You can keep up to 200 goals.");
    if (await tx.savingsGoal.count({ where: { userId, ...(id ? { id: { not: id } } : {}), name: { equals: data.name, mode: "insensitive" } } })) throw new ApiError(409, "You already have a goal with that name.");
    if (data.accountId) {
      const account = await tx.account.findFirst({ where: { id: data.accountId, userId } });
      if (!account) throw new ApiError(404, "Record not found.");
      if (!["SAVINGS", "HYSA"].includes(account.type)) throw new ApiError(400, "Associate a savings or HYSA account.");
      if (account.archived && previous?.accountId !== account.id) throw new ApiError(409, "Choose an active savings account.");
      if (id && await tx.transaction.count({ where: { userId, contribution: { goalId: id }, destinationAccountId: { not: data.accountId } } })) throw new ApiError(409, "Existing contributions go to another account. Leave the account unassigned or update those transfers first.");
    }
    const currentContributions = id ? (await tx.transaction.aggregate({ where: { userId, contribution: { goalId: id } }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n : 0n;
    const target = data.target === null ? null : parseMoney(data.target), opening = parseMoney(data.startingAmount);
    if (data.status === "COMPLETED" && (target === null || opening + currentContributions < target)) throw new ApiError(400, "This goal has not reached its target yet. Keep it active or pause it.");
    const fields = { name: data.name, targetMinor: target, startingAmountMinor: opening, plannedContributionMinor: parseMoney(data.monthlyContribution), targetDate: data.targetDate ? new Date(data.targetDate) : null, accountId: data.accountId, status: data.status, icon: data.icon, notes: data.notes || null, updatedAt: new Date(Math.max(Date.now(), (previous?.updatedAt.valueOf() ?? 0) + 1)) };
    const result = id ? await tx.savingsGoal.update({ where: { id_userId: { id, userId } }, data: fields }) : await tx.savingsGoal.create({ data: { ...fields, userId, priority: ((await tx.savingsGoal.aggregate({ where: { userId }, _max: { priority: true } }))._max.priority ?? 0) + 1 } });
    await refreshGoalStatus(tx, userId, result.id);
    return { id: result.id };
  });
}
export async function deleteGoal(userId: string, id: string) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (!await tx.savingsGoal.count({ where: { id, userId } })) throw new ApiError(404, "Record not found.");
    if (await tx.goalContribution.count({ where: { userId, goalId: id } })) throw new ApiError(409, "This goal has contributions. Pause it to retain history, or unassign its transactions before deleting it.");
    if (await tx.recurringTransaction.count({ where: { userId, goalId: id } })) throw new ApiError(409, "This goal is used by a recurring schedule. Remove its schedule assignment first.");
    await tx.savingsGoal.delete({ where: { id_userId: { id, userId } } });
    return { ok: true };
  });
}
export async function reorderGoals(userId: string, input: unknown) {
  const { ids } = goalOrder.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const goals = await tx.savingsGoal.findMany({ where: { userId } });
    if (ids.length !== goals.length || ids.some(id => !goals.some(g => g.id === id))) throw new ApiError(409, "Your goal list changed. Reload before reordering.");
    for (let index = 0; index < ids.length; index++) await tx.savingsGoal.update({ where: { id_userId: { id: ids[index], userId } }, data: { priority: index + 1, updatedAt: new Date(Math.max(Date.now(), goals.find(g => g.id === ids[index])!.updatedAt.valueOf() + 1)) } });
    return { ok: true };
  });
}
export async function saveRoadmap(userId: string, input: unknown) {
  const data = roadmapInput.parse(input);
  return withOwner(userId, async tx => { await lockOwner(tx, userId); await tx.userSettings.update({ where: { userId }, data: { defaultSavingsMinor: parseMoney(data.monthlyContribution) } }); return { ok: true }; });
}
export async function goalsView(userId: string): Promise<GoalsView> {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    const today = todayInZone(settings.timezone), bounds = monthBounds(today.slice(0, 7));
    const goals = await tx.savingsGoal.findMany({ where: { userId }, include: { account: { select: { name: true } }, contributions: { include: { transaction: { select: { amountMinor: true, date: true } } } } }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    const accounts = await tx.account.findMany({ where: { userId, type: { in: ["SAVINGS", "HYSA"] } }, select: { id: true, name: true, archived: true }, orderBy: { name: "asc" } });
    return { today, accounts, roadmapMonthlyMinor: settings.defaultSavingsMinor.toString(), goals: goals.map(goal => {
      const current = goal.startingAmountMinor + goal.contributions.reduce((s, c) => s + c.transaction.amountMinor, 0n);
      const month = goal.contributions.filter(c => c.transaction.date >= bounds.start && c.transaction.date < bounds.end).reduce((s, c) => s + c.transaction.amountMinor, 0n);
      return { id: goal.id, revision: goal.updatedAt.toISOString(), name: goal.name, targetMinor: goal.targetMinor?.toString() ?? null, startingAmountMinor: goal.startingAmountMinor.toString(), monthlyContributionMinor: goal.plannedContributionMinor.toString(), currentMinor: current.toString(), monthContributionMinor: month.toString(), contributionCount: goal.contributions.length, targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? null, accountId: goal.accountId, accountName: goal.account?.name ?? null, status: goal.status, icon: goal.icon, notes: goal.notes ?? "", priority: goal.priority, projection: goalProjection(current, goal.targetMinor, goal.plannedContributionMinor, today, goal.targetDate?.toISOString().slice(0, 10) ?? null) };
    }) };
  });
}
