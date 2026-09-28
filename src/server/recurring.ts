import "server-only";
import type { Prisma, RecurringTransaction } from "@prisma/client";
import { db, withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { ApiError } from "./errors";
import { recurringInput, recurringUpdate, recurringAction, nextOccurrence, payrollValues, decimalInput, subscriptionEquivalent, type RecurringView, type ScheduleFrequency } from "@/lib/recurring";
import { parseMoney } from "@/lib/finance";
import { todayInZone } from "@/lib/ledger-validation";
import { transactionData } from "./ledger";
import { validateGoalLink, refreshGoalStatus } from "./goal-links";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const effectiveFrequency = (r: RecurringTransaction): ScheduleFrequency => r.secondDay === null ? r.frequency : "SEMIMONTHLY";
const revision = (previous?: Date) => new Date(Math.max(Date.now(), (previous?.valueOf() ?? 0) + 1));
export async function saveRecurring(userId: string, input: unknown, id?: string) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const previous = id ? await tx.recurringTransaction.findFirst({ where: { id, userId } }) : null;
    if (id && !previous) throw new ApiError(404, "Record not found.");
    const data = id ? recurringUpdate.parse(input) : recurringInput.parse(input);
    if (previous && "expectedRevision" in data && data.expectedRevision !== previous.updatedAt.toISOString()) throw new ApiError(409, "This schedule changed or ran. Close the editor and reload before saving.");
    if (!id && await tx.recurringTransaction.count({ where: { userId } }) >= 200) throw new ApiError(409, "You can keep up to 200 schedules.");
    const transfer = ["TRANSFER", "SAVINGS_TRANSFER"].includes(data.type);
    if (transfer ? !data.destinationAccountId || data.destinationAccountId === data.accountId || !!data.categoryId : !!data.destinationAccountId) throw new ApiError(400, "Transfers need two different accounts and no category. Other entries must not have a destination.");
    if (data.subscription && data.type !== "EXPENSE") throw new ApiError(400, "Subscriptions must be expenses.");
    for (const [accountId, previousId] of [[data.accountId, previous?.accountId], [data.destinationAccountId, previous?.destinationAccountId]]) {
      if (!accountId) continue;
      const account = await tx.account.findFirst({ where: { id: accountId, userId } });
      if (!account) throw new ApiError(404, "Record not found.");
      if (account.archived && (data.active || account.id !== previousId)) throw new ApiError(409, "Restore the archived account or keep this schedule inactive.");
      if (accountId === data.destinationAccountId && data.type === "SAVINGS_TRANSFER" && !["SAVINGS", "HYSA"].includes(account.type)) throw new ApiError(400, "Savings transfers must go to a savings or HYSA account.");
    }
    if (data.categoryId) {
      const category = await tx.category.findFirst({ where: { id: data.categoryId, userId } });
      if (!category) throw new ApiError(404, "Record not found.");
      if (category.archived && (data.active || category.id !== previous?.categoryId)) throw new ApiError(409, "Restore the category or keep this schedule inactive.");
    }
    await validateGoalLink(tx, userId, data.goalId ?? null, { type: data.type, destinationAccountId: data.destinationAccountId ?? null }, data.active ? undefined : previous?.goalId);
    let payroll; try { payroll = payrollValues(data.type, parseMoney(data.amount), data.grossIncome, data.deductions); } catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Check payroll amounts."); }
    const due = new Date(data.nextDueDate), keepAnchor = previous && iso(previous.nextDueDate) === data.nextDueDate && effectiveFrequency(previous) === data.frequency;
    const anchorDay = data.frequency === "SEMIMONTHLY" ? data.firstDay : keepAnchor ? previous.anchorDay : due.getUTCDate();
    if (data.frequency === "SEMIMONTHLY") {
      const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
      if (![anchorDay, Math.min(data.secondDay, lastDay)].includes(due.getUTCDate())) throw new ApiError(400, "Next due date must fall on one of the selected monthly days.");
    }
    const fields = { name: data.name, amountMinor: parseMoney(data.amount), type: data.type, accountId: data.accountId, destinationAccountId: data.destinationAccountId ?? null, categoryId: data.categoryId ?? null, goalId: data.goalId ?? null, ...payroll, frequency: data.frequency === "SEMIMONTHLY" ? "MONTHLY" as const : data.frequency, anchorDay, anchorMonth: keepAnchor ? previous.anchorMonth : due.getUTCMonth() + 1, secondDay: data.frequency === "SEMIMONTHLY" ? data.secondDay : null, nextDueDate: due, active: data.active, autoCreate: data.autoCreate, subscription: data.subscription, lastError: null, updatedAt: revision(previous?.updatedAt) };
    return id ? tx.recurringTransaction.update({ where: { id_userId: { id, userId } }, data: fields }) : tx.recurringTransaction.create({ data: { userId, ...fields } });
  });
}
export async function deleteRecurring(userId: string, id: string) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (!await tx.recurringTransaction.count({ where: { id, userId } })) throw new ApiError(404, "Record not found.");
    if (await tx.recurringOccurrence.count({ where: { userId, recurringId: id } }) || await tx.transaction.count({ where: { userId, recurringId: id } })) throw new ApiError(409, "This schedule has history. Set it inactive to preserve past entries.");
    await tx.recurringTransaction.delete({ where: { id_userId: { id, userId } } }); return { ok: true };
  });
}
async function processOccurrence(tx: Prisma.TransactionClient, userId: string, schedule: RecurringTransaction, today: string, skip: boolean) {
  const dueDate = iso(schedule.nextDueDate);
  const handled = await tx.recurringOccurrence.findUnique({ where: { recurringId_date: { recurringId: schedule.id, date: schedule.nextDueDate } } });
  if (!handled) {
    if (!skip) {
      if (dueDate > today) throw new ApiError(400, "This occurrence is not due yet.");
      const values = await transactionData(tx, userId, { type: schedule.type, accountId: schedule.accountId, destinationAccountId: schedule.destinationAccountId, categoryId: schedule.categoryId, amount: decimalInput(schedule.amountMinor), date: dueDate, description: schedule.name, grossIncome: schedule.grossIncomeMinor === null ? null : decimalInput(schedule.grossIncomeMinor), deductions: schedule.deductionsMinor === null ? null : decimalInput(schedule.deductionsMinor) });
      await validateGoalLink(tx, userId, schedule.goalId, values);
      const posted = await tx.transaction.create({ data: { ...values, recurringId: schedule.id, occurrenceDate: schedule.nextDueDate } });
      if (schedule.goalId) await tx.goalContribution.create({ data: { userId, goalId: schedule.goalId, transactionId: posted.id } });
      await refreshGoalStatus(tx, userId, schedule.goalId);
      await tx.accountBalanceSnapshot.deleteMany({ where: { userId, accountId: { in: [schedule.accountId, schedule.destinationAccountId].filter((v): v is string => !!v) } } });
    }
    await tx.recurringOccurrence.create({ data: { userId, recurringId: schedule.id, date: schedule.nextDueDate, skipped: skip } });
  }
  const next = nextOccurrence(dueDate, effectiveFrequency(schedule), schedule.anchorDay, schedule.anchorMonth, schedule.secondDay);
  await tx.recurringTransaction.update({ where: { id_userId: { id: schedule.id, userId } }, data: { nextDueDate: next ? new Date(next) : schedule.nextDueDate, active: next ? schedule.active : false, lastError: next ? null : "Schedule reached the supported date limit.", updatedAt: revision(schedule.updatedAt) } });
  return { posted: !handled && !skip, skipped: !handled && skip, alreadyProcessed: !!handled };
}
export async function actOnRecurring(userId: string, id: string, input: unknown) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const schedule = await tx.recurringTransaction.findFirst({ where: { id, userId } });
    if (!schedule) throw new ApiError(404, "Record not found.");
    const data = recurringAction.parse(input);
    if (await tx.recurringOccurrence.count({ where: { userId, recurringId: id, date: new Date(data.dueDate) } })) return { alreadyProcessed: true };
    if (!schedule.active) throw new ApiError(409, "Activate this schedule before posting or skipping.");
    if (iso(schedule.nextDueDate) !== data.dueDate) throw new ApiError(409, "The due date changed. Reload before processing this entry.");
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    return processOccurrence(tx, userId, schedule, todayInZone(settings.timezone), data.action === "skip");
  });
}
export async function runAutomaticForOwner(userId: string, now = new Date()) {
  let posted = 0, examined = 0;
  const blocked: string[] = [];
  // One occurrence per transaction keeps locks short and commits progress even if a later item is blocked.
  while (examined < 100) {
    const result = await withOwner(userId, async tx => {
      await lockOwner(tx, userId);
      const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } }), today = todayInZone(settings.timezone, now);
      const schedule = await tx.recurringTransaction.findFirst({ where: { userId, active: true, autoCreate: true, nextDueDate: { lte: new Date(today) }, id: { notIn: blocked } }, orderBy: [{ nextDueDate: "asc" }, { id: "asc" }] });
      if (!schedule) return null;
      try { return { id: schedule.id, ...await processOccurrence(tx, userId, schedule, today, false), blocked: false }; }
      catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (schedule.lastError !== error.message) await tx.recurringTransaction.update({ where: { id_userId: { id: schedule.id, userId } }, data: { lastError: error.message, updatedAt: revision(schedule.updatedAt) } });
        return { id: schedule.id, posted: false, blocked: true };
      }
    });
    if (!result) break;
    examined++; if (result.posted) posted++; if (result.blocked) blocked.push(result.id);
  }
  return { posted, blocked: blocked.length, batchLimitReached: examined === 100 };
}
export async function runAutomaticBatch() {
  let cursor: string | undefined;
  do {
    const owners = await db.user.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    for (const owner of owners) { try { await runAutomaticForOwner(owner.id); } catch { console.error("Recurring processing failed for an owner; will retry on the next pass."); } }
    cursor = owners.length === 100 ? owners[owners.length - 1].id : undefined;
  } while (cursor);
}
export async function recurringView(userId: string) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    const rows = await tx.recurringTransaction.findMany({ where: { userId }, include: { account: { select: { name: true } }, destinationAccount: { select: { name: true } }, category: { select: { name: true } } }, orderBy: [{ active: "desc" }, { nextDueDate: "asc" }, { id: "asc" }] });
    const records: RecurringView[] = rows.map(r => ({ id: r.id, revision: r.updatedAt.toISOString(), name: r.name, amount: decimalInput(r.amountMinor), type: r.type, accountId: r.accountId, destinationAccountId: r.destinationAccountId, categoryId: r.categoryId, goalId: r.goalId, grossIncome: r.grossIncomeMinor === null ? null : decimalInput(r.grossIncomeMinor), deductions: r.deductionsMinor === null ? null : decimalInput(r.deductionsMinor), frequency: effectiveFrequency(r), nextDueDate: iso(r.nextDueDate), firstDay: r.anchorDay, secondDay: r.secondDay ?? 31, active: r.active, autoCreate: r.autoCreate, subscription: r.subscription, accountName: r.account.name, destinationName: r.destinationAccount?.name ?? null, categoryName: r.category?.name ?? null, lastError: r.lastError }));
    const annual = rows.filter(r => r.active && r.subscription).reduce((sum, r) => sum + subscriptionEquivalent(r.amountMinor, effectiveFrequency(r)).annualMinor, 0n);
    return { records, today: todayInZone(settings.timezone), subscriptionAnnualMinor: annual.toString(), subscriptionMonthlyMinor: ((annual + 6n) / 12n).toString() };
  });
}
