import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { db, withOwner } from "@/server/db";
import { register, cookieName } from "@/server/auth";
import { saveBudget, copyBudget, budgetView } from "@/server/budgets";
import { createAccount, createCategory, createTransaction, updateTransaction, deleteLedgerRecord, updateCategory, searchTransactions } from "@/server/ledger";
import { updateRecord } from "@/server/workspace";
import { GET, PUT } from "@/app/api/budgets/[month]/route";
import { POST } from "@/app/api/budgets/[month]/copy/route";

const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DIRECT_URL });
let a: Awaited<ReturnType<typeof register>>, b: Awaited<ReturnType<typeof register>>;
let checking: string, savings: string, food: string, rent: string, foreignCategory: string;
const month = "2020-09";
const draft = (extra: Record<string, unknown> = {}) => ({ expectedRevision: null, income: "1000", savings: "200", items: [{ categoryId: food, amount: "150", recurring: false }, { categoryId: rent, amount: "400", recurring: true }], ...extra });
const entry = (extra: Record<string, unknown> = {}) => ({ requestId: crypto.randomUUID(), type: "EXPENSE", amount: "12.34", date: "2020-09-15", description: "Budget fixture", accountId: checking, categoryId: food, ...extra });
const context = (selected = month) => ({ params: Promise.resolve({ month: selected }) });
function request(method: string, input?: unknown, token: string | undefined = a.token, origin = process.env.APP_ORIGIN!) {
  return new NextRequest(`${process.env.APP_ORIGIN}/api/budgets/${month}`, { method, headers: { origin, "content-type": "application/json", ...(token ? { cookie: `${cookieName()}=${token}` } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
}
beforeAll(async () => {
  const suffix = crypto.randomUUID(), password = "private budget test passphrase";
  a = await register({ name: "Budget A", email: `budget-a-${suffix}@example.test`, password, confirmPassword: password });
  b = await register({ name: "Budget B", email: `budget-b-${suffix}@example.test`, password, confirmPassword: password });
  checking = (await createAccount(a.user.id, { name: "Checking", type: "CHECKING", startingBalance: "0" })).id;
  savings = (await createAccount(a.user.id, { name: "Savings", type: "SAVINGS", startingBalance: "0" })).id;
  food = (await createCategory(a.user.id, { name: "Food" })).id;
  rent = (await createCategory(a.user.id, { name: "Rent" })).id;
  foreignCategory = (await createCategory(b.user.id, { name: "Private category" })).id;
  await saveBudget(b.user.id, month, draft({ income: "9999", items: [{ categoryId: foreignCategory, amount: "999", recurring: true }] }));
});
beforeEach(async () => {
  await withOwner(a.user.id, async tx => {
    await tx.monthlyBudget.deleteMany(); await tx.transaction.deleteMany(); await tx.category.updateMany({ data: { archived: false } });
  });
});
afterAll(async () => {
  if (a && b) {
    const userId = { in: [a.user.id, b.user.id] };
    await owner.transaction.deleteMany({ where: { userId } }); await owner.monthlyBudget.deleteMany({ where: { userId } });
    await owner.account.deleteMany({ where: { userId } }); await owner.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect(); await owner.$disconnect();
});

describe("monthly budgets on real PostgreSQL", () => {
  it("starts empty and never reveals another owner's plan or categories", async () => {
    const view = await budgetView(a.user.id, month);
    expect(view.plan).toBeNull(); expect(view.totals).toBeNull(); expect(view.rows).toEqual([]);
    expect(view.categories.some(c => c.id === foreignCategory)).toBe(false);
    await expect(copyBudget(a.user.id, "2020-10", { sourceMonth: month, recurringOnly: false })).rejects.toMatchObject({ status: 404 });
  });
  it("saves exact money, recurring flags, and explicit zero limits", async () => {
    await saveBudget(a.user.id, month, draft({ income: "999999999999.99", items: [{ categoryId: food, amount: "0", recurring: true }] }));
    const view = await budgetView(a.user.id, month);
    expect(view.plan?.incomeMinor).toBe("99999999999999"); expect(view.plan?.items[0]).toMatchObject({ amountMinor: "0", recurring: true });
    expect(view.rows[0]).toMatchObject({ allocated: true, plannedMinor: "0", remainingMinor: "0" });
  });
  it("includes all expense categories while excluding income and both transfer types from spending", async () => {
    await saveBudget(a.user.id, month, draft());
    await createTransaction(a.user.id, entry({ type: "INCOME", amount: "900" }));
    await createTransaction(a.user.id, entry({ amount: "170" }));
    await createTransaction(a.user.id, entry({ categoryId: null, amount: "10" }));
    await createTransaction(a.user.id, entry({ type: "SAVINGS_TRANSFER", destinationAccountId: savings, categoryId: null, amount: "200" }));
    await createTransaction(a.user.id, entry({ type: "TRANSFER", destinationAccountId: savings, categoryId: null, amount: "300" }));
    const view = await budgetView(a.user.id, month);
    expect(view.actual).toEqual({ incomeMinor: "90000", expensesMinor: "18000", savingsMinor: "20000", remainingMinor: "52000" });
    expect(view.totals).toEqual({ allocatedMinor: "55000", plannedRemainderMinor: "25000", remainingToSpendMinor: "62000" });
    expect(view.rows.find(r => r.categoryId === food)?.remainingMinor).toBe("-2000");
    expect(view.rows.find(r => r.categoryId === null)).toMatchObject({ actualMinor: "1000", allocated: false });
    expect((await searchTransactions(a.user.id, { type: "EXPENSE", category: "uncategorized" })).total).toBe(1);
  });
  it("uses inclusive start and exclusive next-month date boundaries", async () => {
    for (const date of ["2020-08-31", "2020-09-01", "2020-09-30", "2020-10-01"]) await createTransaction(a.user.id, entry({ date, amount: "1" }));
    expect((await budgetView(a.user.id, month)).actual.expensesMinor).toBe("200");
  });
  it("rejects foreign references without modifying an existing plan", async () => {
    const saved = await saveBudget(a.user.id, month, draft());
    await expect(saveBudget(a.user.id, month, draft({ expectedRevision: saved.revision, items: [{ categoryId: foreignCategory, amount: "1", recurring: false }] }))).rejects.toMatchObject({ status: 404 });
    expect((await budgetView(a.user.id, month)).plan?.revision).toBe(saved.revision);
    expect((await budgetView(a.user.id, month)).plan?.items).toHaveLength(2);
  });
  it("prevents stale and simultaneous editors from overwriting each other", async () => {
    const saved = await saveBudget(a.user.id, month, draft());
    const results = await Promise.allSettled([saveBudget(a.user.id, month, draft({ expectedRevision: saved.revision, income: "1100" })), saveBudget(a.user.id, month, draft({ expectedRevision: saved.revision, income: "1200" }))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.status).toBe(409);
    await expect(saveBudget(a.user.id, month, draft())).rejects.toMatchObject({ status: 409 });
  });
  it("copies a plan once without overwriting its source or copying transactions", async () => {
    const nonRepeating = draft({ items: [{ categoryId: food, amount: "150", recurring: false }, { categoryId: rent, amount: "400", recurring: false }] });
    await saveBudget(a.user.id, month, nonRepeating); await createTransaction(a.user.id, entry());
    const outcomes = await Promise.allSettled([copyBudget(a.user.id, "2020-10", { sourceMonth: month, recurringOnly: false }), copyBudget(a.user.id, "2020-10", { sourceMonth: month, recurringOnly: false })]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const copied = await budgetView(a.user.id, "2020-10");
    expect(copied.plan?.items).toHaveLength(2); expect(copied.actual.expensesMinor).toBe("0");
    await saveBudget(a.user.id, "2020-10", draft({ expectedRevision: copied.plan!.revision, income: "1200", items: [] }));
    expect((await budgetView(a.user.id, month)).plan?.incomeMinor).toBe("100000");
    expect((await budgetView(a.user.id, month)).plan?.items).toHaveLength(2);
  });
  it("seeds next month with repeating allocations while preserving planned income and savings", async () => {
    await saveBudget(a.user.id, month, draft());
    const copied = (await budgetView(a.user.id, "2020-10")).plan!;
    expect(copied.items).toEqual([{ categoryId: rent, amountMinor: "40000", recurring: true }]);
    expect(copied.incomeMinor).toBe("100000"); expect(copied.savingsMinor).toBe("20000");
    await copyBudget(a.user.id, "2020-11", { sourceMonth: month, recurringOnly: true });
    expect((await budgetView(a.user.id, "2020-11")).plan?.items).toEqual([{ categoryId: rent, amountMinor: "40000", recurring: true }]);
  });
  it("preserves archived history and skips archived categories in new plans", async () => {
    const nonRepeating = draft({ items: [{ categoryId: food, amount: "150", recurring: false }, { categoryId: rent, amount: "400", recurring: false }] });
    const saved = await saveBudget(a.user.id, month, nonRepeating);
    await updateCategory(a.user.id, food, { archived: true });
    await saveBudget(a.user.id, month, { ...nonRepeating, expectedRevision: saved.revision });
    await expect(saveBudget(a.user.id, "2020-10", nonRepeating)).rejects.toMatchObject({ status: 409 });
    expect((await copyBudget(a.user.id, "2020-10", { sourceMonth: month, recurringOnly: false })).skippedArchived).toBe(1);
    expect((await budgetView(a.user.id, "2020-10")).plan?.items).toHaveLength(1);
    await expect(deleteLedgerRecord(a.user.id, "categories", food)).rejects.toMatchObject({ status: 409 });
  });
  it("recalculates actuals after ledger edits and deletions without changing the plan", async () => {
    const plan = await saveBudget(a.user.id, month, draft());
    const row = await createTransaction(a.user.id, entry());
    await updateTransaction(a.user.id, row.id, { amount: "20" });
    expect((await budgetView(a.user.id, month)).actual.expensesMinor).toBe("2000");
    await deleteLedgerRecord(a.user.id, "transactions", row.id);
    const view = await budgetView(a.user.id, month);
    expect(view.actual.expensesMinor).toBe("0"); expect(view.plan?.revision).toBe(plan.revision);
  });
  it("removes allocations without deleting recorded expenses", async () => {
    const plan = await saveBudget(a.user.id, month, draft()); await createTransaction(a.user.id, entry());
    await saveBudget(a.user.id, month, draft({ expectedRevision: plan.revision, items: [] }));
    const view = await budgetView(a.user.id, month);
    expect(view.plan?.items).toEqual([]); expect(view.rows[0]).toMatchObject({ allocated: false, actualMinor: "1234" });
  });
  it("invalidates an editor revision when the legacy budget API changes the plan", async () => {
    const plan = await saveBudget(a.user.id, month, draft());
    const record = await withOwner(a.user.id, tx => tx.monthlyBudget.findFirstOrThrow());
    await updateRecord(a.user.id, "budgets", record.id, { plannedIncomeMinor: "200000", plannedSavingsMinor: "10000" });
    await expect(saveBudget(a.user.id, month, draft({ expectedRevision: plan.revision }))).rejects.toMatchObject({ status: 409 });
  });
  it("validates copy sources and allows future planning without future transactions", async () => {
    await expect(copyBudget(a.user.id, month, { sourceMonth: month, recurringOnly: false })).rejects.toMatchObject({ status: 400 });
    await saveBudget(a.user.id, "2099-01", draft());
    expect((await budgetView(a.user.id, "2099-01")).actual.expensesMinor).toBe("0");
  });
});
describe("budget HTTP authorization boundary", () => {
  it("requires authentication, origin validation, and strict ownership-free payloads", async () => {
    expect((await GET(request("GET", undefined, ""), context())).status).toBe(401);
    expect((await PUT(request("PUT", draft(), a.token, "https://evil.test"), context())).status).toBe(403);
    expect((await PUT(request("PUT", draft({ userId: b.user.id })), context())).status).toBe(400);
    expect((await PUT(request("PUT", draft({ items: [{ categoryId: foreignCategory, amount: "1", recurring: false }] })), context())).status).toBe(404);
    expect((await GET(request("GET"), context("invalid"))).status).toBe(400);
  });
  it("returns only the caller's budget and copies via the actual route handlers", async () => {
    const nonRepeating = draft({ items: [{ categoryId: food, amount: "150", recurring: false }, { categoryId: rent, amount: "400", recurring: false }] });
    expect((await PUT(request("PUT", nonRepeating), context())).status).toBe(200);
    const response = await GET(request("GET"), context());
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).plan.incomeMinor).toBe("100000");
    expect((await POST(request("POST", { sourceMonth: month, recurringOnly: false }), context("2020-10"))).status).toBe(201);
  });
});
