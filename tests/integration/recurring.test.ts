import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { db, withOwner } from "@/server/db";
import { register, cookieName } from "@/server/auth";
import { saveRecurring, recurringView, actOnRecurring, deleteRecurring, runAutomaticForOwner } from "@/server/recurring";
import { createAccount, createCategory, createTransaction, updateTransaction, deleteLedgerRecord, updateAccount, ledgerOptions, searchTransactions, ledgerOverview } from "@/server/ledger";
import { saveGoal, goalsView } from "@/server/goals";
import { incomeView, saveIncomeSettings, createRetirementContribution, retirementSummary } from "@/server/income";
import { GET, PUT, POST, DELETE } from "@/app/api/recurring/[id]/route";
import { GET as LIST, POST as CREATE } from "@/app/api/recurring/route";
import { GET as INCOME, PUT as SAVE_INCOME } from "@/app/api/income/route";

const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DIRECT_URL });
let a: Awaited<ReturnType<typeof register>>, b: Awaited<ReturnType<typeof register>>;
let checking: string, savings: string, category: string, foreignAccount: string, foreignCategory: string, foreignSchedule: string;
const input = (extra: Record<string, unknown> = {}) => ({ name: "Internet", amount: "64.99", type: "EXPENSE", accountId: checking, destinationAccountId: null, categoryId: category, goalId: null, grossIncome: null, deductions: null, frequency: "MONTHLY", nextDueDate: "2020-01-31", firstDay: 15, secondDay: 31, active: true, autoCreate: false, subscription: true, ...extra });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (method: string, data?: unknown, token = a.token, origin = process.env.APP_ORIGIN!) => new NextRequest(`${process.env.APP_ORIGIN}/api/recurring`, { method, headers: { origin, "content-type": "application/json", ...(token ? { cookie: `${cookieName()}=${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
beforeAll(async () => {
  const suffix = crypto.randomUUID(), password = "private recurring test passphrase";
  a = await register({ name: "Recurring A", email: `recurring-a-${suffix}@example.test`, password, confirmPassword: password });
  b = await register({ name: "Recurring B", email: `recurring-b-${suffix}@example.test`, password, confirmPassword: password });
  checking = (await createAccount(a.user.id, { name: "Checking", type: "CHECKING", startingBalance: "1000" })).id;
  savings = (await createAccount(a.user.id, { name: "Savings", type: "SAVINGS", startingBalance: "0" })).id;
  category = (await createCategory(a.user.id, { name: "Bills" })).id;
  foreignAccount = (await createAccount(b.user.id, { name: "Private", type: "SAVINGS", startingBalance: "0" })).id;
  foreignCategory = (await createCategory(b.user.id, { name: "Private" })).id;
  foreignSchedule = (await saveRecurring(b.user.id, input({ accountId: foreignAccount, categoryId: foreignCategory, nextDueDate: "2099-01-01" }))).id;
});
beforeEach(async () => {
  await withOwner(a.user.id, async tx => {
    await tx.transaction.deleteMany(); await tx.recurringTransaction.deleteMany(); await tx.savingsGoal.deleteMany(); await tx.incomeSettings.deleteMany(); await tx.retirementContribution.deleteMany(); await tx.account.updateMany({ data: { archived: false } });
  });
});
afterAll(async () => {
  if (a && b) {
    const userId = { in: [a.user.id, b.user.id] };
    await owner.transaction.deleteMany({ where: { userId } }); await owner.recurringTransaction.deleteMany({ where: { userId } }); await owner.savingsGoal.deleteMany({ where: { userId } }); await owner.account.deleteMany({ where: { userId } }); await owner.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect(); await owner.$disconnect();
});
describe("recurring posting", () => {
  it("keeps remind-only schedules out of automatic processing", async () => {
    await saveRecurring(a.user.id, input());
    expect((await runAutomaticForOwner(a.user.id, new Date("2020-03-01"))).posted).toBe(0);
    expect((await searchTransactions(a.user.id, {})).total).toBe(0);
  });
  it("posts the same due date exactly once under concurrent requests", async () => {
    const schedule = await saveRecurring(a.user.id, input());
    await Promise.all([actOnRecurring(a.user.id, schedule.id, { action: "post", dueDate: "2020-01-31" }), actOnRecurring(a.user.id, schedule.id, { action: "post", dueDate: "2020-01-31" })]);
    expect((await searchTransactions(a.user.id, {})).total).toBe(1);
    expect((await recurringView(a.user.id)).records[0].nextDueDate).toBe("2020-02-29");
    expect((await ledgerOptions(a.user.id)).accounts.find(v => v.id === checking)?.balanceMinor).toBe("93501");
  });
  it("never recreates a generated entry after it is deleted, even if a schedule is rewound", async () => {
    const schedule = await saveRecurring(a.user.id, input({ autoCreate: true }));
    await actOnRecurring(a.user.id, schedule.id, { action: "post", dueDate: "2020-01-31" });
    const row = (await searchTransactions(a.user.id, {})).records[0];
    await deleteLedgerRecord(a.user.id, "transactions", row.id);
    const plan = (await recurringView(a.user.id)).records[0];
    await saveRecurring(a.user.id, input({ autoCreate: true, expectedRevision: plan.revision }), schedule.id);
    await runAutomaticForOwner(a.user.id, new Date("2020-02-01"));
    expect((await searchTransactions(a.user.id, {})).total).toBe(0);
    expect((await recurringView(a.user.id)).records[0].nextDueDate).toBe("2020-02-29");
  });
  it("catches up bounded due occurrences and keeps month-end anchors through edits", async () => {
    const row = await saveRecurring(a.user.id, input({ autoCreate: true }));
    await actOnRecurring(a.user.id, row.id, { action: "post", dueDate: "2020-01-31" });
    const view = (await recurringView(a.user.id)).records[0];
    await saveRecurring(a.user.id, input({ autoCreate: true, nextDueDate: view.nextDueDate, expectedRevision: view.revision, amount: "70" }), row.id);
    expect((await runAutomaticForOwner(a.user.id, new Date("2020-04-01"))).posted).toBe(2);
    expect((await recurringView(a.user.id)).records[0].nextDueDate).toBe("2020-04-30");
    expect((await searchTransactions(a.user.id, {})).records.map(r => r.amountMinor).sort()).toEqual(["6499", "7000", "7000"]);
  });
  it("skips one date permanently without creating a transaction", async () => {
    const r = await saveRecurring(a.user.id, input());
    await actOnRecurring(a.user.id, r.id, { action: "skip", dueDate: "2020-01-31" });
    await actOnRecurring(a.user.id, r.id, { action: "post", dueDate: "2020-01-31" });
    expect((await searchTransactions(a.user.id, {})).total).toBe(0);
    expect((await recurringView(a.user.id)).records[0].nextDueDate).toBe("2020-02-29");
  });
  it("does not post future/inactive occurrences or accept stale edits", async () => {
    const r = await saveRecurring(a.user.id, input({ nextDueDate: "2099-01-01" }));
    await expect(actOnRecurring(a.user.id, r.id, { action: "post", dueDate: "2099-01-01" })).rejects.toMatchObject({ status: 400 });
    const revision = r.updatedAt.toISOString();
    await saveRecurring(a.user.id, input({ nextDueDate: "2099-01-01", active: false, expectedRevision: revision }), r.id);
    await expect(saveRecurring(a.user.id, input({ expectedRevision: revision }), r.id)).rejects.toMatchObject({ status: 409 });
    await expect(actOnRecurring(a.user.id, r.id, { action: "skip", dueDate: "2099-01-01" })).rejects.toMatchObject({ status: 409 });
  });
  it("blocks archived references while letting another schedule proceed", async () => {
    await saveRecurring(a.user.id, input({ autoCreate: true }));
    await saveRecurring(a.user.id, input({ name: "Other", accountId: savings, autoCreate: true }));
    await updateAccount(a.user.id, checking, { archived: true });
    const result = await runAutomaticForOwner(a.user.id, new Date("2020-02-01"));
    expect(result).toMatchObject({ posted: 1, blocked: 1 });
    expect((await recurringView(a.user.id)).records.find(r => r.accountId === checking)?.lastError).toContain("active account");
  });
  it("posts savings and goal contributions atomically and pauses on completed goals", async () => {
    const goal = await saveGoal(a.user.id, { name: "Reserve", target: "50", startingAmount: "0", monthlyContribution: "50", targetDate: null, accountId: savings, status: "ACTIVE", icon: "target", notes: "" });
    await saveRecurring(a.user.id, input({ type: "SAVINGS_TRANSFER", destinationAccountId: savings, goalId: goal.id, categoryId: null, amount: "50", autoCreate: true, subscription: false }));
    const result = await runAutomaticForOwner(a.user.id, new Date("2020-03-01"));
    expect(result).toMatchObject({ posted: 1, blocked: 1 });
    expect((await goalsView(a.user.id)).goals[0]).toMatchObject({ currentMinor: "5000", status: "COMPLETED" });
    expect((await ledgerOverview(a.user.id, "2020-01")).expenses).toBe(0n);
  });
  it("rejects foreign references and deletes only unused schedules", async () => {
    for (const extra of [{ accountId: foreignAccount }, { categoryId: foreignCategory }, { type: "TRANSFER", destinationAccountId: foreignAccount, categoryId: null, subscription: false }]) await expect(saveRecurring(a.user.id, input(extra))).rejects.toMatchObject({ status: 404 });
    const r = await saveRecurring(a.user.id, input()); await actOnRecurring(a.user.id, r.id, { action: "skip", dueDate: "2020-01-31" });
    await expect(deleteRecurring(a.user.id, r.id)).rejects.toMatchObject({ status: 409 });
    const unused = await saveRecurring(a.user.id, input({ name: "Unused" })); await deleteRecurring(a.user.id, unused.id);
  });
  it("calculates active-only subscription equivalents and validates semi-monthly dates", async () => {
    await saveRecurring(a.user.id, input({ amount: "5.99" }));
    await saveRecurring(a.user.id, input({ amount: "100", active: false }));
    const view = await recurringView(a.user.id); expect(view.subscriptionMonthlyMinor).toBe("599"); expect(view.subscriptionAnnualMinor).toBe("7188");
    await expect(saveRecurring(a.user.id, input({ frequency: "SEMIMONTHLY", nextDueDate: "2020-01-12" }))).rejects.toMatchObject({ status: 400 });
    const r = await saveRecurring(a.user.id, input({ frequency: "SEMIMONTHLY", nextDueDate: "2020-01-15" }));
    await actOnRecurring(a.user.id, r.id, { action: "skip", dueDate: "2020-01-15" });
    expect((await recurringView(a.user.id)).records.find(v => v.id === r.id)?.nextDueDate).toBe("2020-01-31");
  });
});
describe("income and retirement separation", () => {
  it("posts net income with consistent optional gross/deductions", async () => {
    const r = await saveRecurring(a.user.id, input({ type: "INCOME", amount: "1500", grossIncome: "2000", deductions: "500", subscription: false }));
    await actOnRecurring(a.user.id, r.id, { action: "post", dueDate: "2020-01-31" });
    const view = await incomeView(a.user.id, "2020-01"); expect(view).toMatchObject({ actualNetMinor: "150000", documentedGrossMinor: "200000", documentedDeductionsMinor: "50000", documentedCount: 1 });
    expect((await ledgerOptions(a.user.id)).accounts.find(v => v.id === checking)?.balanceMinor).toBe("250000");
    await expect(saveRecurring(a.user.id, input({ type: "INCOME", amount: "1500", grossIncome: "2000", deductions: "400", subscription: false }))).rejects.toMatchObject({ status: 400 });
  });
  it("supports irregular income and updates optional payroll details exactly", async () => {
    const row = await createTransaction(a.user.id, { requestId: crypto.randomUUID(), type: "INCOME", amount: "1.23", date: "2020-01-02", description: "Freelance", accountId: checking, grossIncome: "2.00", deductions: "0.77" });
    await expect(updateTransaction(a.user.id, row.id, { amount: "1.24" })).rejects.toMatchObject({ status: 400 });
    await updateTransaction(a.user.id, row.id, { amount: "1.24", deductions: "0.76" });
    expect((await incomeView(a.user.id, "2020-01")).actualNetMinor).toBe("124");
  });
  it("stores private salary assumptions without creating income or changing budgets", async () => {
    await saveIncomeSettings(a.user.id, { expectedRevision: null, annualSalary: "58000", netPaycheck: "1875", payFrequency: "SEMIMONTHLY" });
    expect((await incomeView(a.user.id, "2020-01")).projection?.monthlyNetMinor).toBe("375000");
    expect((await incomeView(b.user.id, "2020-01")).settings).toBeNull();
    expect((await searchTransactions(a.user.id, {})).total).toBe(0);
    await expect(saveIncomeSettings(a.user.id, { expectedRevision: null, annualSalary: "1", netPaycheck: "1", payFrequency: "MONTHLY" })).rejects.toMatchObject({ status: 409 });
  });
  it("keeps actual retirement contributions outside cash income, savings and accounts", async () => {
    await createRetirementContribution(a.user.id, { date: "2020-01-15", employee: "290", employerMatch: "0", employerOther: "0", notes: "Actual payroll" });
    await createRetirementContribution(a.user.id, { date: "2020-02-15", employee: "290", employerMatch: "20", employerOther: "0", notes: "Actual match" });
    const summary = await retirementSummary(a.user.id, "2020-02");
    expect(summary.monthly.employeeMinor).toBe(29000n); expect(summary.yearToSelectedMonth.employeeMinor).toBe(58000n); expect(summary.yearToSelectedMonth.employerMatchMinor).toBe(2000n);
    expect((await ledgerOverview(a.user.id, "2020-02"))).toMatchObject({ income: 0n, savings: 0n });
    expect((await ledgerOptions(a.user.id)).accounts.find(v => v.id === checking)?.balanceMinor).toBe("100000");
    expect((await retirementSummary(b.user.id, "2020-02")).yearToSelectedMonth.employeeMinor).toBe(0n);
  });
  it("enforces RLS on new tables, including unfiltered/no-context reads", async () => {
    await saveIncomeSettings(b.user.id, { expectedRevision: null, annualSalary: "1", netPaycheck: "1", payFrequency: "MONTHLY" });
    expect(await db.incomeSettings.findMany()).toEqual([]); expect(await db.recurringOccurrence.findMany()).toEqual([]); expect(await db.retirementContribution.findMany()).toEqual([]);
    expect(await withOwner(a.user.id, tx => tx.incomeSettings.findMany())).toEqual([]);
    await expect(withOwner(a.user.id, tx => tx.retirementContribution.create({ data: { userId: b.user.id, date: new Date("2020-01-01"), employeeMinor: 1n } }))).rejects.toThrow();
  });
});
describe("recurring HTTP ownership", () => {
  it("gives identical foreign/missing responses across read/edit/process/delete", async () => {
    for (const [method, handler, data] of [["GET", GET, undefined], ["PUT", PUT, input()], ["POST", POST, { action: "skip", dueDate: "2099-01-01" }], ["DELETE", DELETE, undefined]] as const) {
      const denied = await handler(request(method, data), context(foreignSchedule)), missing = await handler(request(method, data), context("missing"));
      expect(denied.status).toBe(404); expect(await denied.json()).toEqual(await missing.json());
    }
  });
  it("requires sessions/origin and rejects owner injection", async () => {
    expect((await LIST(request("GET", undefined, ""))).status).toBe(401);
    expect((await CREATE(request("POST", input(), a.token, "https://evil.test"))).status).toBe(403);
    expect((await CREATE(request("POST", input({ userId: b.user.id })))).status).toBe(400);
    expect((await INCOME(request("GET", undefined, ""))).status).toBe(401);
    expect((await SAVE_INCOME(request("PUT", { expectedRevision: null, annualSalary: "1", netPaycheck: "1", payFrequency: "MONTHLY", userId: b.user.id }))).status).toBe(400);
  });
});
