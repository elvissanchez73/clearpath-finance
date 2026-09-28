import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { db, withOwner } from "@/server/db";
import { register, cookieName } from "@/server/auth";
import { createAccount, updateAccount, createCategory, updateCategory, createTransaction, updateTransaction, deleteLedgerRecord, ledgerOptions, ledgerOverview, searchTransactions } from "@/server/ledger";
import { GET, PATCH, DELETE } from "@/app/api/ledger/[resource]/[id]/route";
import { POST } from "@/app/api/ledger/[resource]/route";

const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DIRECT_URL });
let a: Awaited<ReturnType<typeof register>>, b: Awaited<ReturnType<typeof register>>;
let checking: string, savings: string, category: string;
let foreign: { accounts: string; categories: string; transactions: string };
const date = "2020-09-15";
const entry = (extra: Record<string, unknown> = {}) => ({ requestId: crypto.randomUUID(), type: "EXPENSE", amount: "12.34", date, description: "Groceries", accountId: checking, categoryId: category, ...extra });
const transfer = (extra: Record<string, unknown> = {}) => entry({ type: "SAVINGS_TRANSFER", destinationAccountId: savings, categoryId: null, amount: "50.00", ...extra });
const request = (method: string, input?: unknown) => new NextRequest(`${process.env.APP_ORIGIN}/api/ledger`, { method, headers: { origin: process.env.APP_ORIGIN!, "content-type": "application/json", cookie: `${cookieName()}=${a.token}` }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
const context = (resource: string, id: string) => ({ params: Promise.resolve({ resource, id }) });
async function balances() { return Object.fromEntries((await ledgerOptions(a.user.id)).accounts.map(r => [r.id, BigInt(r.balanceMinor)])); }

beforeAll(async () => {
  const suffix = crypto.randomUUID(), password = "private ledger test passphrase";
  a = await register({ name: "Ledger A", email: `ledger-a-${suffix}@example.test`, password, confirmPassword: password });
  b = await register({ name: "Ledger B", email: `ledger-b-${suffix}@example.test`, password, confirmPassword: password });
  checking = (await createAccount(a.user.id, { name: "Checking", type: "CHECKING", startingBalance: "1000.00" })).id;
  savings = (await createAccount(a.user.id, { name: "Savings", type: "SAVINGS", startingBalance: "0" })).id;
  category = (await createCategory(a.user.id, { name: "Food", icon: "shopping-basket" })).id;
  const account = await createAccount(b.user.id, { name: "Private", type: "SAVINGS", startingBalance: "10" });
  const cat = await createCategory(b.user.id, { name: "Private" });
  const transaction = await createTransaction(b.user.id, entry({ accountId: account.id, categoryId: cat.id }));
  foreign = { accounts: account.id, categories: cat.id, transactions: transaction.id };
});
beforeEach(async () => {
  await withOwner(a.user.id, async tx => {
    await tx.goalContribution.deleteMany(); await tx.transaction.deleteMany(); await tx.savingsGoal.deleteMany(); await tx.accountBalanceSnapshot.deleteMany();
    await tx.account.updateMany({ data: { archived: false } }); await tx.category.updateMany({ data: { archived: false } });
    await tx.account.update({ where: { id: checking }, data: { startingBalanceMinor: 100000n } });
  });
});
afterAll(async () => {
  if (a && b) {
    const userId = { in: [a.user.id, b.user.id] };
    await owner.goalContribution.deleteMany({ where: { userId } }); await owner.transaction.deleteMany({ where: { userId } });
    await owner.savingsGoal.deleteMany({ where: { userId } }); await owner.account.deleteMany({ where: { userId } });
    await owner.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect(); await owner.$disconnect();
});

describe("persisted financial ledger", () => {
  it("calculates account balances and monthly totals without counting transfers as spending", async () => {
    await createTransaction(a.user.id, entry({ type: "INCOME", amount: "100" }));
    await createTransaction(a.user.id, entry());
    await createTransaction(a.user.id, transfer({ type: "TRANSFER", amount: "200" }));
    await createTransaction(a.user.id, transfer());
    expect(await balances()).toMatchObject({ [checking]: 83766n, [savings]: 25000n });
    expect(await ledgerOverview(a.user.id, "2020-09")).toMatchObject({ income: 10000n, expenses: 1234n, savings: 5000n, remaining: 3766n, rate: 5000n });
    expect(await ledgerOverview(a.user.id, "2020-08")).toMatchObject({ income: 0n, expenses: 0n, savings: 0n, rate: null });
  });
  it("edits and deletes both sides of transfers atomically", async () => {
    const row = await createTransaction(a.user.id, transfer());
    await updateTransaction(a.user.id, row.id, { amount: "75.25" });
    expect(await balances()).toMatchObject({ [checking]: 92475n, [savings]: 7525n });
    await deleteLedgerRecord(a.user.id, "transactions", row.id);
    expect(await balances()).toMatchObject({ [checking]: 100000n, [savings]: 0n });
  });
  it("moves an expense to a different account without retaining its old effect", async () => {
    const row = await createTransaction(a.user.id, entry());
    await updateTransaction(a.user.id, row.id, { accountId: savings });
    expect(await balances()).toMatchObject({ [checking]: 100000n, [savings]: -1234n });
  });
  it("deduplicates simultaneous save retries and rejects changed retry payloads", async () => {
    const input = entry();
    const rows = await Promise.all([createTransaction(a.user.id, input), createTransaction(a.user.id, input)]);
    expect(rows[0].id).toBe(rows[1].id);
    expect((await searchTransactions(a.user.id, {})).total).toBe(1);
    await expect(createTransaction(a.user.id, { ...input, amount: "15" })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects foreign references, future transactions, and invalid transfers", async () => {
    for (const input of [entry({ accountId: foreign.accounts }), entry({ categoryId: foreign.categories }), transfer({ destinationAccountId: foreign.accounts })]) await expect(createTransaction(a.user.id, input)).rejects.toMatchObject({ status: 404 });
    for (const input of [entry({ date: "9999-01-01" }), transfer({ destinationAccountId: checking }), transfer({ categoryId: category }), entry({ destinationAccountId: savings })]) await expect(createTransaction(a.user.id, input)).rejects.toMatchObject({ status: 400 });
    expect((await searchTransactions(a.user.id, {})).total).toBe(0);
  });
  it("archives historical references but prevents new assignments and destructive deletion", async () => {
    const row = await createTransaction(a.user.id, entry());
    await updateAccount(a.user.id, checking, { archived: true }); await updateCategory(a.user.id, category, { archived: true });
    await expect(createTransaction(a.user.id, entry())).rejects.toMatchObject({ status: 409 });
    await updateTransaction(a.user.id, row.id, { amount: "20" });
    expect((await balances())[checking]).toBe(98000n);
    await expect(deleteLedgerRecord(a.user.id, "accounts", checking)).rejects.toMatchObject({ status: 409 });
    await expect(deleteLedgerRecord(a.user.id, "categories", category)).rejects.toMatchObject({ status: 409 });
    const unused = await createCategory(a.user.id, { name: "Unused" });
    await expect(deleteLedgerRecord(a.user.id, "categories", unused.id)).resolves.toEqual({ ok: true });
  });
  it("keeps linked goal contributions aligned with edits and cascades deletion", async () => {
    const row = await createTransaction(a.user.id, transfer());
    await withOwner(a.user.id, async tx => {
      const goal = await tx.savingsGoal.create({ data: { userId: a.user.id, name: "Reserve", targetMinor: 100000n } });
      await tx.goalContribution.create({ data: { userId: a.user.id, goalId: goal.id, transactionId: row.id } });
    });
    await updateTransaction(a.user.id, row.id, { amount: "80" });
    const linked = await withOwner(a.user.id, tx => tx.goalContribution.findFirstOrThrow({ include: { transaction: true } }));
    expect(linked.transaction.amountMinor).toBe(8000n);
    await expect(updateTransaction(a.user.id, row.id, { type: "TRANSFER" })).rejects.toMatchObject({ status: 409 });
    await deleteLedgerRecord(a.user.id, "transactions", row.id);
    expect(await withOwner(a.user.id, tx => tx.goalContribution.count())).toBe(0);
  });
  it("filters descriptions, accounts on either side, dates, types, categories, and amounts", async () => {
    const food = await createTransaction(a.user.id, entry());
    const saving = await createTransaction(a.user.id, transfer({ description: "Reserve" }));
    expect((await searchTransactions(a.user.id, { q: "gRoCe", category, account: checking, type: "EXPENSE", from: date, to: date, min: "12.34", max: "12.34" })).records.map(r => r.id)).toEqual([food.id]);
    expect((await searchTransactions(a.user.id, { account: savings })).records.map(r => r.id)).toEqual([saving.id]);
    expect((await searchTransactions(a.user.id, { sort: "highest" })).records[0].id).toBe(saving.id);
    await expect(searchTransactions(a.user.id, { category: foreign.categories })).rejects.toMatchObject({ status: 404 });
  });
  it("remembers only this user's recent active expense category", async () => {
    expect((await ledgerOptions(a.user.id)).recentExpenseCategoryId).toBeNull();
    await createTransaction(a.user.id, entry());
    expect((await ledgerOptions(a.user.id)).recentExpenseCategoryId).toBe(category);
    await updateCategory(a.user.id, category, { archived: true });
    expect((await ledgerOptions(a.user.id)).recentExpenseCategoryId).toBeNull();
  });
  it("paginates stable results and clamps pages after deletions", async () => {
    await withOwner(a.user.id, tx => tx.transaction.createMany({ data: Array.from({ length: 27 }, (_, i) => ({ userId: a.user.id, accountId: checking, type: "EXPENSE", amountMinor: BigInt(i + 1), date: new Date(date), description: `Row ${i}` })) }));
    const first = await searchTransactions(a.user.id, { page: 1 }), last = await searchTransactions(a.user.id, { page: 100 });
    expect(first.records).toHaveLength(25); expect(last.records).toHaveLength(2); expect(last.page).toBe(2);
    expect(new Set([...first.records, ...last.records].map(r => r.id)).size).toBe(27);
  });
  it("invalidates balance snapshots on creation, edits, deletes, and opening-balance changes", async () => {
    const snapshot = () => withOwner(a.user.id, tx => tx.accountBalanceSnapshot.create({ data: { userId: a.user.id, accountId: checking, date: new Date(date), balanceMinor: 100000n } }));
    const count = () => withOwner(a.user.id, tx => tx.accountBalanceSnapshot.count());
    await snapshot(); const row = await createTransaction(a.user.id, entry()); expect(await count()).toBe(0);
    await snapshot(); await updateTransaction(a.user.id, row.id, { amount: "2" }); expect(await count()).toBe(0);
    await snapshot(); await deleteLedgerRecord(a.user.id, "transactions", row.id); expect(await count()).toBe(0);
    await snapshot(); await updateAccount(a.user.id, checking, { startingBalance: "2" }); expect(await count()).toBe(0);
  });
  it("keeps large amounts exact through API serialization", async () => {
    const response = await POST(request("POST", entry({ type: "INCOME", amount: "999999999999.99" })), { params: Promise.resolve({ resource: "transactions" }) });
    expect(response.status).toBe(201);
    expect(JSON.stringify(await response.json())).toContain('"99999999999999"');
    expect((await balances())[checking]).toBe(100000000099999n);
  });
});

describe.each(["accounts", "categories", "transactions"] as const)("ledger API owner isolation: %s", resource => {
  it("gives identical missing responses for foreign IDs on reads, changes, and deletes", async () => {
    for (const [method, handler, input] of [["GET", GET, undefined], ["PATCH", PATCH, { name: "Intrusion" }], ["DELETE", DELETE, undefined]] as const) {
      const denied = await handler(request(method, input), context(resource, foreign[resource]));
      const absent = await handler(request(method, input), context(resource, "missing"));
      expect(denied.status).toBe(404); expect(await denied.json()).toEqual(await absent.json());
    }
  });
});
