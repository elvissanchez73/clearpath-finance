import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { db, withOwner } from "@/server/db";
import { register, cookieName } from "@/server/auth";
import { createAccount, createCategory, createTransaction, updateTransaction, deleteLedgerRecord, updateAccount, updateCategory, ledgerOverview } from "@/server/ledger";
import { saveBudget } from "@/server/budgets";
import { saveGoal } from "@/server/goals";
import { analyticsView } from "@/server/analytics";
import { GET } from "@/app/api/analytics/route";
const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DIRECT_URL });
let a: Awaited<ReturnType<typeof register>>, b: Awaited<ReturnType<typeof register>>;
let checking: string, savings: string, category: string, foreign: string;
const add = (extra: Record<string, unknown> = {}) => createTransaction(a.user.id, { requestId: crypto.randomUUID(), date: "2020-02-15", type: "EXPENSE", amount: "10.01", description: "Analytics fixture", accountId: checking, categoryId: category, ...extra });
beforeAll(async () => {
  const suffix = crypto.randomUUID(), password = "analytics private fixture password";
  a = await register({ name: "Analytics A", email: `analytics-a-${suffix}@example.test`, password, confirmPassword: password });
  b = await register({ name: "Analytics B", email: `analytics-b-${suffix}@example.test`, password, confirmPassword: password });
  checking = (await createAccount(a.user.id, { name: "Checking", type: "CHECKING", startingBalance: "1000" })).id;
  savings = (await createAccount(a.user.id, { name: "Savings", type: "SAVINGS", startingBalance: "100" })).id;
  category = (await createCategory(a.user.id, { name: "Food", icon: "circle" })).id;
  foreign = (await createAccount(b.user.id, { name: "Other user's account", type: "CHECKING", startingBalance: "9000" })).id;
  await createTransaction(b.user.id, { requestId: crypto.randomUUID(), date: "2020-02-01", type: "INCOME", amount: "7000", description: "Private income", accountId: foreign });
});
beforeEach(async () => {
  await withOwner(a.user.id, async tx => { await tx.transaction.deleteMany(); await tx.savingsGoal.deleteMany(); await tx.monthlyBudget.deleteMany(); await tx.account.updateMany({ data: { archived: false } }); await tx.category.updateMany({ data: { archived: false } }); });
});
afterAll(async () => {
  if (a && b) { const userId = { in: [a.user.id, b.user.id] }; await owner.transaction.deleteMany({ where: { userId } }); await owner.savingsGoal.deleteMany({ where: { userId } }); await owner.monthlyBudget.deleteMany({ where: { userId } }); await owner.account.deleteMany({ where: { userId } }); await owner.user.deleteMany({ where: { id: userId } }); }
  await db.$disconnect(); await owner.$disconnect();
});
describe("private ledger analytics", () => {
  it("returns a private zero state with starting balances", async () => {
    const v = await analyticsView(a.user.id, { month: "2020-02", range: "3" });
    expect(v.points).toHaveLength(3); expect(v.totals).toMatchObject({ income: "0", expenses: "0", rate: null });
    expect(v.points.map(p => p.balance)).toEqual(["110000", "110000", "110000"]);
    expect(v.categories).toEqual([]); expect(v.accounts).toHaveLength(2);
  });
  it("agrees with dashboard totals and excludes transfers from spending", async () => {
    await add({ type: "INCOME", amount: "100.01" }); await add();
    await add({ type: "SAVINGS_TRANSFER", amount: "20", categoryId: null, destinationAccountId: savings });
    await add({ type: "TRANSFER", amount: "5", categoryId: null, destinationAccountId: savings });
    const v = await analyticsView(a.user.id, { month: "2020-02", range: "1" }), overview = await ledgerOverview(a.user.id, "2020-02");
    expect(v.totals).toMatchObject({ income: overview.income.toString(), expenses: overview.expenses.toString(), savings: overview.savings.toString(), remaining: "7000" });
    expect(v.points[0].balance).toBe("119000"); expect(v.categories[0].amount).toBe("1001");
  });
  it("respects leap-month boundaries and carries earlier account movement", async () => {
    await add({ date: "2020-01-31", amount: "10" }); await add({ date: "2020-02-29", amount: "20" }); await add({ date: "2020-03-01", amount: "30" });
    const v = await analyticsView(a.user.id, { month: "2020-02", range: "1", account: checking });
    expect(v.totals.expenses).toBe("2000"); expect(v.points[0].balance).toBe("97000");
  });
  it("reconstructs both transfer sides without filtering the overall analytics", async () => {
    await add({ type: "SAVINGS_TRANSFER", amount: "25", categoryId: null, destinationAccountId: savings });
    const c = await analyticsView(a.user.id, { month: "2020-02", range: "1", account: checking });
    const s = await analyticsView(a.user.id, { month: "2020-02", range: "1", account: savings });
    expect(c.points[0].balance).toBe("97500"); expect(s.points[0].balance).toBe("12500"); expect(c.totals).toEqual(s.totals);
  });
  it("recalculates edits, date changes and deletions without stale snapshots", async () => {
    const t = await add(); await updateTransaction(a.user.id, t.id, { amount: "30", date: "2020-01-01" });
    expect((await analyticsView(a.user.id, { month: "2020-02", range: "1" })).totals.expenses).toBe("0");
    expect((await analyticsView(a.user.id, { month: "2020-02", range: "1" })).points[0].balance).toBe("107000");
    await deleteLedgerRecord(a.user.id, "transactions", t.id);
    expect((await analyticsView(a.user.id, { month: "2020-02", range: "1" })).points[0].balance).toBe("110000");
  });
  it("includes archived and uncategorized spending and distinguishes missing from zero budgets", async () => {
    await add(); await add({ categoryId: null, amount: "2" });
    await saveBudget(a.user.id, "2020-02", { expectedRevision: null, income: "100", savings: "0", items: [{ categoryId: category, amount: "0", recurring: false }] });
    await updateCategory(a.user.id, category, { archived: true }); await updateAccount(a.user.id, checking, { archived: true });
    const v = await analyticsView(a.user.id, { month: "2020-02", range: "3" });
    expect(v.categories.find(c => c.id === category)).toMatchObject({ amount: "1001", planned: "0" });
    expect(v.categories.find(c => c.id === "uncategorized")).toMatchObject({ amount: "200", planned: null });
    expect(v.plannedMonths).toBe(1); expect(v.accounts.find(a => a.id === checking)?.archived).toBe(true);
  });
  it("starts all-time at the earliest saved budget or transaction", async () => {
    await saveBudget(a.user.id, "2018-12", { expectedRevision: null, income: "100", savings: "0", items: [] });
    await add(); const v = await analyticsView(a.user.id, { month: "2020-02", range: "all" });
    expect(v.start).toBe("2018-12"); expect(v.points).toHaveLength(15);
  });
  it("reports current authoritative goal progress regardless of historical range", async () => {
    const goal = await saveGoal(a.user.id, { name: "Reserve", target: "100", startingAmount: "10", monthlyContribution: "10", targetDate: null, accountId: savings, status: "ACTIVE", icon: "shield", notes: "" });
    await add({ type: "SAVINGS_TRANSFER", categoryId: null, destinationAccountId: savings, goalId: goal.id, amount: "25" });
    expect((await analyticsView(a.user.id, { month: "2019-01" })).goals[0]).toMatchObject({ current: "3500", target: "10000" });
  });
  it("rejects foreign and missing accounts identically", async () => {
    await expect(analyticsView(a.user.id, { month: "2020-02", account: foreign })).rejects.toMatchObject({ status: 404, message: "Account not found." });
    await expect(analyticsView(a.user.id, { month: "2020-02", account: "cmissingaccount000000000000" })).rejects.toMatchObject({ status: 404, message: "Account not found." });
  });
  it("protects the HTTP boundary and marks results private and uncached", async () => {
    const request = (query: string, token = a.token) => new NextRequest(`${process.env.APP_ORIGIN}/api/analytics?${query}`, { headers: token ? { cookie: `${cookieName()}=${token}` } : {} });
    expect((await GET(request("month=2020-02", ""))).status).toBe(401);
    expect((await GET(request("month=2020-02&userId=foreign"))).status).toBe(400);
    expect((await GET(request("month=2020-02&range=99"))).status).toBe(400);
    expect((await GET(request(`month=2020-02&account=${foreign}`))).status).toBe(404);
    const response = await GET(request("month=2020-02&range=1")); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect((await response.json()).totals.income).toBe("0");
  });
});
