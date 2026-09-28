import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { db, withOwner } from "@/server/db";
import { register, cookieName } from "@/server/auth";
import { saveGoal, deleteGoal, reorderGoals, saveRoadmap, goalsView } from "@/server/goals";
import { createAccount, createTransaction, updateTransaction, deleteLedgerRecord, ledgerOptions, updateAccount, searchTransactions } from "@/server/ledger";
import { GET, PUT, DELETE } from "@/app/api/goals/[id]/route";
import { GET as LIST, POST } from "@/app/api/goals/route";
import { PUT as ORDER } from "@/app/api/goals/order/route";
import { PUT as ROADMAP } from "@/app/api/goals/roadmap/route";

const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DIRECT_URL });
let a: Awaited<ReturnType<typeof register>>, b: Awaited<ReturnType<typeof register>>;
let checking: string, savings: string, otherSavings: string, foreignAccount: string, foreignGoal: string, goalId: string;
const draft = (extra: Record<string, unknown> = {}) => ({ name: "Emergency fund", target: "1000", startingAmount: "100", monthlyContribution: "150", targetDate: "2028-01-01", accountId: savings, status: "ACTIVE", icon: "shield", notes: "Private reserve", ...extra });
const transfer = (extra: Record<string, unknown> = {}) => ({ requestId: crypto.randomUUID(), type: "SAVINGS_TRANSFER", amount: "50", date: "2020-09-15", description: "Goal savings", accountId: checking, destinationAccountId: savings, goalId, ...extra });
const current = async (id = goalId) => (await goalsView(a.user.id)).goals.find(g => g.id === id)!;
const edit = async (extra: Record<string, unknown> = {}) => saveGoal(a.user.id, draft({ expectedRevision: (await current()).revision, ...extra }), goalId);
const context = (id: string) => ({ params: Promise.resolve({ id }) });
function request(method: string, input?: unknown, token = a.token, origin = process.env.APP_ORIGIN!) {
  return new NextRequest(`${process.env.APP_ORIGIN}/api/goals`, { method, headers: { origin, "content-type": "application/json", ...(token ? { cookie: `${cookieName()}=${token}` } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
}
beforeAll(async () => {
  const suffix = crypto.randomUUID(), password = "private savings goal test passphrase";
  a = await register({ name: "Goals A", email: `goals-a-${suffix}@example.test`, password, confirmPassword: password });
  b = await register({ name: "Goals B", email: `goals-b-${suffix}@example.test`, password, confirmPassword: password });
  checking = (await createAccount(a.user.id, { name: "Checking", type: "CHECKING", startingBalance: "2000" })).id;
  savings = (await createAccount(a.user.id, { name: "Savings", type: "SAVINGS", startingBalance: "100" })).id;
  otherSavings = (await createAccount(a.user.id, { name: "Other savings", type: "HYSA", startingBalance: "0" })).id;
  foreignAccount = (await createAccount(b.user.id, { name: "Private savings", type: "SAVINGS", startingBalance: "0" })).id;
  foreignGoal = (await saveGoal(b.user.id, draft({ accountId: foreignAccount, name: "Private goal" }))).id;
});
beforeEach(async () => {
  await withOwner(a.user.id, async tx => { await tx.transaction.deleteMany(); await tx.savingsGoal.deleteMany(); await tx.account.updateMany({ data: { archived: false } }); });
  goalId = (await saveGoal(a.user.id, draft())).id;
});
afterAll(async () => {
  if (a && b) {
    const userId = { in: [a.user.id, b.user.id] };
    await owner.transaction.deleteMany({ where: { userId } }); await owner.savingsGoal.deleteMany({ where: { userId } }); await owner.account.deleteMany({ where: { userId } }); await owner.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect(); await owner.$disconnect();
});
describe("authoritative goal contributions", () => {
  it("records a transfer and its goal contribution atomically without double counting", async () => {
    await createTransaction(a.user.id, transfer());
    expect(await current()).toMatchObject({ currentMinor: "15000", contributionCount: 1, startingAmountMinor: "10000" });
    const accounts = (await ledgerOptions(a.user.id)).accounts;
    expect(accounts.find(v => v.id === checking)?.balanceMinor).toBe("195000");
    expect(accounts.find(v => v.id === savings)?.balanceMinor).toBe("15000");
    expect((await searchTransactions(a.user.id, { goal: goalId })).records[0].goalName).toBe("Emergency fund");
  });
  it("deduplicates retries including their goal assignment", async () => {
    const input = transfer();
    const saved = await Promise.all([createTransaction(a.user.id, input), createTransaction(a.user.id, input)]);
    expect(saved[0].id).toBe(saved[1].id); expect((await current()).contributionCount).toBe(1);
    await expect(createTransaction(a.user.id, { ...input, goalId: null })).rejects.toMatchObject({ status: 409 });
  });
  it("completes at target and reopens after amount corrections or deletion", async () => {
    const row = await createTransaction(a.user.id, transfer({ amount: "900" }));
    expect((await current()).status).toBe("COMPLETED");
    await updateTransaction(a.user.id, row.id, { amount: "800" });
    expect(await current()).toMatchObject({ status: "ACTIVE", currentMinor: "90000" });
    await updateTransaction(a.user.id, row.id, { amount: "900" });
    await deleteLedgerRecord(a.user.id, "transactions", row.id);
    expect(await current()).toMatchObject({ status: "ACTIVE", currentMinor: "10000", contributionCount: 0 });
  });
  it("reassigns an existing transfer between goals without moving money again", async () => {
    const second = (await saveGoal(a.user.id, draft({ name: "Home", startingAmount: "0" }))).id;
    const row = await createTransaction(a.user.id, transfer());
    const before = (await ledgerOptions(a.user.id)).accounts;
    await updateTransaction(a.user.id, row.id, { goalId: second });
    expect((await current()).currentMinor).toBe("10000"); expect((await current(second)).currentMinor).toBe("5000");
    expect((await ledgerOptions(a.user.id)).accounts).toEqual(before);
    await updateTransaction(a.user.id, row.id, { goalId: null });
    expect((await current(second)).currentMinor).toBe("0");
  });
  it("supports assigning an unassigned historical savings transfer", async () => {
    const row = await createTransaction(a.user.id, transfer({ goalId: null }));
    await updateTransaction(a.user.id, row.id, { goalId });
    expect((await current()).currentMinor).toBe("15000");
  });
  it("rejects foreign goals, source accounts, and destination-account mismatch with no partial writes", async () => {
    for (const extra of [{ goalId: foreignGoal }, { accountId: foreignAccount }]) await expect(createTransaction(a.user.id, transfer(extra))).rejects.toMatchObject({ status: 404 });
    await expect(createTransaction(a.user.id, transfer({ destinationAccountId: otherSavings }))).rejects.toMatchObject({ status: 400 });
    expect((await searchTransactions(a.user.id, {})).total).toBe(0);
    await expect(searchTransactions(a.user.id, { goal: foreignGoal })).rejects.toMatchObject({ status: 404 });
  });
  it("prevents non-savings assignments and supports explicit unlink before type changes", async () => {
    await expect(createTransaction(a.user.id, transfer({ type: "TRANSFER" }))).rejects.toMatchObject({ status: 400 });
    const row = await createTransaction(a.user.id, transfer());
    await expect(updateTransaction(a.user.id, row.id, { type: "TRANSFER" })).rejects.toMatchObject({ status: 409 });
    await updateTransaction(a.user.id, row.id, { type: "TRANSFER", goalId: null });
    expect((await current()).contributionCount).toBe(0);
  });
  it("preserves paused history and prevents new paused/completed assignments", async () => {
    const row = await createTransaction(a.user.id, transfer()); await edit({ status: "PAUSED" });
    await expect(createTransaction(a.user.id, transfer())).rejects.toMatchObject({ status: 409 });
    await updateTransaction(a.user.id, row.id, { amount: "1000" });
    expect((await current()).status).toBe("PAUSED");
    await edit({ status: "ACTIVE" }); expect((await current()).status).toBe("COMPLETED");
    await expect(createTransaction(a.user.id, transfer())).rejects.toMatchObject({ status: 409 });
  });
  it("requires valid savings associations and protects them on account/type edits", async () => {
    await expect(edit({ accountId: foreignAccount })).rejects.toMatchObject({ status: 404 });
    await expect(edit({ accountId: checking })).rejects.toMatchObject({ status: 400 });
    await expect(updateAccount(a.user.id, savings, { type: "CASH" })).rejects.toMatchObject({ status: 409 });
    const row = await createTransaction(a.user.id, transfer());
    await expect(edit({ accountId: otherSavings })).rejects.toMatchObject({ status: 409 });
    await expect(updateTransaction(a.user.id, row.id, { destinationAccountId: otherSavings })).rejects.toMatchObject({ status: 400 });
    expect((await current()).currentMinor).toBe("15000");
  });
  it("keeps opening allocations independent of account balances and disallows premature completion", async () => {
    const before = (await ledgerOptions(a.user.id)).accounts;
    await edit({ startingAmount: "200" });
    expect((await current()).currentMinor).toBe("20000"); expect((await ledgerOptions(a.user.id)).accounts).toEqual(before);
    await expect(edit({ status: "COMPLETED" })).rejects.toMatchObject({ status: 400 });
  });
  it("rejects stale goal edits after contributions or another edit", async () => {
    const revision = (await current()).revision;
    await createTransaction(a.user.id, transfer());
    await expect(saveGoal(a.user.id, draft({ expectedRevision: revision }), goalId)).rejects.toMatchObject({ status: 409 });
    const fresh = (await current()).revision;
    const results = await Promise.allSettled([saveGoal(a.user.id, draft({ expectedRevision: fresh, monthlyContribution: "200" }), goalId), saveGoal(a.user.id, draft({ expectedRevision: fresh, monthlyContribution: "300" }), goalId)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("only deletes unused goals, preserving linked transaction history", async () => {
    const row = await createTransaction(a.user.id, transfer());
    await expect(deleteGoal(a.user.id, goalId)).rejects.toMatchObject({ status: 409 });
    await updateTransaction(a.user.id, row.id, { goalId: null });
    await deleteGoal(a.user.id, goalId);
    expect((await goalsView(a.user.id)).goals).toHaveLength(0);
    expect((await searchTransactions(a.user.id, {})).total).toBe(1);
  });
  it("saves scoped roadmap assumptions and complete ordering without changing balances", async () => {
    const second = (await saveGoal(a.user.id, draft({ name: "House", status: "PAUSED", target: null }))).id;
    await saveRoadmap(a.user.id, { monthlyContribution: "1500.01" });
    await reorderGoals(a.user.id, { ids: [second, goalId] });
    const view = await goalsView(a.user.id);
    expect(view.roadmapMonthlyMinor).toBe("150001"); expect(view.goals.map(g => g.id)).toEqual([second, goalId]);
    expect((await goalsView(b.user.id)).roadmapMonthlyMinor).toBe("0");
    await expect(reorderGoals(a.user.id, { ids: [foreignGoal, goalId] })).rejects.toMatchObject({ status: 409 });
    await expect(reorderGoals(a.user.id, { ids: [goalId] })).rejects.toMatchObject({ status: 409 });
    expect((await searchTransactions(a.user.id, {})).total).toBe(0);
  });
  it("counts only the selected user's current calendar-month contributions", async () => {
    const today = (await goalsView(a.user.id)).today;
    await createTransaction(a.user.id, transfer({ date: today, amount: "15.01" }));
    await createTransaction(a.user.id, transfer({ amount: "5" }));
    expect((await current()).monthContributionMinor).toBe("1501");
  });
});
describe("goal route security", () => {
  it("matches foreign and missing record responses for read, update and delete", async () => {
    for (const [method, handler, payload] of [["GET", GET, undefined], ["PUT", PUT, draft()], ["DELETE", DELETE, undefined]] as const) {
      const foreign = await handler(request(method, payload), context(foreignGoal));
      const missing = await handler(request(method, payload), context("missing"));
      expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual(await missing.json());
    }
    expect((await (await LIST(request("GET"))).json()).goals.every((g: { id: string }) => g.id !== foreignGoal)).toBe(true);
  });
  it("requires session/origin and rejects injected owner IDs", async () => {
    expect((await LIST(request("GET", undefined, ""))).status).toBe(401);
    expect((await POST(request("POST", draft(), a.token, "https://evil.test"))).status).toBe(403);
    expect((await POST(request("POST", draft({ userId: b.user.id })))).status).toBe(400);
    expect((await ORDER(request("PUT", { ids: [foreignGoal] }))).status).toBe(409);
    expect((await ROADMAP(request("PUT", { monthlyContribution: "5", userId: b.user.id }))).status).toBe(400);
  });
});
