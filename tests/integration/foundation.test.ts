import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { db, withOwner } from "@/server/db";
import { authenticate, cookieName, register, signIn, signOut, tokenHash, updatePassword, requestPasswordReset, resetPassword, limitAuth } from "@/server/auth";
import { GET, PATCH, DELETE } from "@/app/api/workspace/[resource]/[id]/route";
import { GET as LIST } from "@/app/api/workspace/[resource]/route";
import { GET as PROFILE, PATCH as UPDATE_PROFILE } from "@/app/api/profile/route";
import { POST as AUTH } from "@/app/api/auth/[action]/route";
import { hashPassword, verifyPassword } from "@/server/password";
import type { Resource } from "@/server/workspace";

const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DIRECT_URL });
const suffix = crypto.randomUUID();
const password = "a private long test passphrase";
let a: Awaited<ReturnType<typeof register>>, b: Awaited<ReturnType<typeof register>>;
let foreign: Record<Resource, string>;
const origin = process.env.APP_ORIGIN!;
function request(method: string, token: string | undefined, input?: unknown, overrideOrigin = origin) {
  return new NextRequest(`${origin}/api/test`, { method, headers: { origin: overrideOrigin, "content-type": "application/json", ...(token ? { cookie: `${cookieName()}=${token}` } : {}) }, ...(input !== undefined ? { body: JSON.stringify(input) } : {}) });
}
const context = (resource: string, id: string) => ({ params: Promise.resolve({ resource, id }) });

beforeAll(async () => {
  // Clear rate-limit state only in the dedicated test database.
  await owner.authRateLimit.deleteMany();
  a = await register({ name: "User A", email: `a-${suffix}@example.test`, password, confirmPassword: password });
  b = await register({ name: "User B", email: `b-${suffix}@example.test`, password, confirmPassword: password });
  foreign = await withOwner(b.user.id, async tx => {
    const account = await tx.account.create({ data: { userId: b.user.id, name: "B checking", type: "CHECKING", startingBalanceMinor: 10000n } });
    const transaction = await tx.transaction.create({ data: { userId: b.user.id, accountId: account.id, date: new Date("2026-09-01"), description: "B private purchase", amountMinor: 100n, type: "EXPENSE" } });
    const budget = await tx.monthlyBudget.create({ data: { userId: b.user.id, month: new Date("2026-09-01") } });
    const goal = await tx.savingsGoal.create({ data: { userId: b.user.id, name: "B private goal", targetMinor: 1000000n } });
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId: b.user.id } });
    return { accounts: account.id, transactions: transaction.id, budgets: budget.id, goals: goal.id, settings: settings.id };
  });
});
afterAll(async () => {
  if (a && b) {
    const userId = { in: [a.user.id, b.user.id] };
    await owner.goalContribution.deleteMany({ where: { userId } });
    await owner.transaction.deleteMany({ where: { userId } });
    await owner.savingsGoal.deleteMany({ where: { userId } });
    await owner.account.deleteMany({ where: { userId } });
    await owner.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect(); await owner.$disconnect();
});

describe("real PostgreSQL authentication", () => {
  it("uses a runtime database role without superuser or RLS bypass", async () => {
    const [role] = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });
  it("creates empty private workspaces and returns no password hashes", async () => {
    expect(a.user).not.toHaveProperty("passwordHash");
    expect(await withOwner(a.user.id, tx => tx.account.count())).toBe(0);
    expect(await withOwner(a.user.id, tx => tx.userSettings.count())).toBe(1);
  });
  it("salts password hashes and checks passwords", async () => {
    const first = await hashPassword(password), second = await hashPassword(password);
    expect(first).not.toEqual(second); expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword("wrong", first)).toBe(false);
  });
  it("stores only session token digests", async () => {
    const row = await owner.session.findFirstOrThrow({ where: { userId: a.user.id } });
    expect(row.tokenHash).toBe(tokenHash(a.token)); expect(row.tokenHash).not.toBe(a.token);
  });
  it("does not identify whether failed login email exists", async () => {
    await expect(signIn({ email: a.user.email, password: "wrong" })).rejects.toMatchObject({ status: 401, message: "Email or password is incorrect." });
    await expect(signIn({ email: "absent@example.test", password: "wrong" })).rejects.toMatchObject({ status: 401, message: "Email or password is incorrect." });
  });
  it("invalidates sessions on logout and expiry", async () => {
    const session = await signIn({ email: a.user.email, password });
    await signOut(session.token); await expect(authenticate(session.token)).rejects.toMatchObject({ status: 401 });
    const expiring = await signIn({ email: a.user.email, password });
    await owner.session.update({ where: { tokenHash: tokenHash(expiring.token) }, data: { expiresAt: new Date(0) } });
    await expect(authenticate(expiring.token)).rejects.toMatchObject({ status: 401 });
  });
  it("atomically rate-limits repeated attempts", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => limitAuth("test", suffix, 3)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
  });
  it("rejects cross-origin mutations and missing sessions", async () => {
    expect((await UPDATE_PROFILE(request("PATCH", a.token, { name: "Evil" }, "https://evil.test"))).status).toBe(403);
    expect((await PROFILE(request("GET", undefined))).status).toBe(401);
    expect((await AUTH(request("POST", undefined, { email: a.user.email, password }, "https://evil.test"), { params: Promise.resolve({ action: "login" }) })).status).toBe(403);
  });
  it("does not accept injected profile user IDs", async () => {
    expect((await UPDATE_PROFILE(request("PATCH", a.token, { name: "Evil", userId: b.user.id }))).status).toBe(400);
    expect((await owner.user.findUniqueOrThrow({ where: { id: b.user.id } })).name).toBe("User B");
  });
  it("sets HttpOnly SameSite cookies and private cache headers", async () => {
    const response = await AUTH(request("POST", undefined, { email: a.user.email, password }), { params: Promise.resolve({ action: "login" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("allows legitimate owner updates and rejects oversized bodies", async () => {
    const response = await UPDATE_PROFILE(request("PATCH", a.token, { name: "Updated A" }));
    expect(response.status).toBe(200);
    expect((await response.json()).user.name).toBe("Updated A");
    expect((await UPDATE_PROFILE(request("PATCH", a.token, { name: "x".repeat(20000) }))).status).toBe(413);
    const update = await PATCH(request("PATCH", b.token, { name: "B renamed account" }), context("accounts", foreign.accounts));
    expect(update.status).toBe(200);
    const ownAccount = await withOwner(a.user.id, tx => tx.account.create({ data: { name: "Disposable", userId: a.user.id, type: "CASH" } }));
    expect((await DELETE(request("DELETE", a.token), context("accounts", ownAccount.id))).status).toBe(200);
  });
});

describe.each(["accounts", "transactions", "budgets", "goals", "settings"] as Resource[])("API ownership: %s", resource => {
  it("cannot retrieve or infer a foreign ID", async () => {
    const denied = await GET(request("GET", a.token), context(resource, foreign[resource]));
    const missing = await GET(request("GET", a.token), context(resource, "missing"));
    expect(denied.status).toBe(404); expect(await denied.json()).toEqual(await missing.json());
  });
  it("cannot modify a foreign ID", async () => {
    const denied = await PATCH(request("PATCH", a.token, { name: "Compromised" }), context(resource, foreign[resource]));
    expect(denied.status).toBe(404);
  });
  it("cannot delete a foreign ID", async () => {
    expect((await DELETE(request("DELETE", a.token), context(resource, foreign[resource]))).status).toBe(404);
    expect((await GET(request("GET", b.token), context(resource, foreign[resource]))).status).toBe(200);
  });
  it("does not list a different user's records", async () => {
    const response = await LIST(request("GET", a.token), { params: Promise.resolve({ resource }) });
    const { records } = await response.json();
    expect(records.every((record: { userId: string }) => record.userId === a.user.id)).toBe(true);
  });
});

describe("defense in depth", () => {
  it("enables and forces RLS on all fourteen financial tables", async () => {
    const rows = await owner.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('UserSettings', 'Account', 'Category', 'Transaction', 'MonthlyBudget', 'BudgetItem', 'SavingsGoal', 'GoalContribution', 'RecurringTransaction', 'RetirementSettings', 'AccountBalanceSnapshot', 'RecurringOccurrence', 'IncomeSettings', 'RetirementContribution')`;
    expect(rows).toHaveLength(14);
    expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
  it("enforces positive amounts and distinct transfer destinations in PostgreSQL", async () => {
    const base = { userId: b.user.id, accountId: foreign.accounts, date: new Date(), description: "Invalid" };
    await expect(withOwner(b.user.id, tx => tx.transaction.create({ data: { ...base, amountMinor: -1n, type: "EXPENSE" } }))).rejects.toThrow();
    await expect(withOwner(b.user.id, tx => tx.transaction.create({ data: { ...base, amountMinor: 1n, type: "TRANSFER", destinationAccountId: foreign.accounts } }))).rejects.toThrow();
  });
  it("RLS hides every financial table without owner context", async () => {
    expect(await db.account.findMany()).toEqual([]); expect(await db.transaction.findMany()).toEqual([]);
    expect(await db.monthlyBudget.findMany()).toEqual([]); expect(await db.savingsGoal.findMany()).toEqual([]); expect(await db.userSettings.findMany()).toEqual([]);
  });
  it("RLS still isolates an accidentally unfiltered query", async () => {
    const rows = await withOwner(a.user.id, tx => tx.account.findMany());
    expect(rows).toEqual([]);
    expect(await withOwner(a.user.id, tx => tx.account.updateMany({ where: { id: foreign.accounts }, data: { name: "Injected" } }))).toEqual({ count: 0 });
    expect(await withOwner(a.user.id, tx => tx.account.deleteMany({ where: { id: foreign.accounts } }))).toEqual({ count: 0 });
  });
  it("RLS rejects inserts owned by another user", async () => {
    await expect(withOwner(a.user.id, tx => tx.account.create({ data: { userId: b.user.id, name: "Injected", type: "CASH" } }))).rejects.toThrow();
  });
  it("composite foreign keys reject links to another user's account", async () => {
    await expect(withOwner(a.user.id, tx => tx.transaction.create({ data: { userId: a.user.id, accountId: foreign.accounts, date: new Date(), description: "Bad link", amountMinor: 1n, type: "EXPENSE" } }))).rejects.toThrow();
  });
  it("transaction-local owner state does not leak through pooled connections", async () => {
    await withOwner(b.user.id, tx => tx.account.findMany());
    expect(await db.account.findMany()).toEqual([]);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => withOwner(i % 2 ? a.user.id : b.user.id, tx => tx.account.findMany())));
    results.forEach((rows, i) => expect(rows.every(row => row.userId === (i % 2 ? a.user.id : b.user.id))).toBe(true));
  });
  it("password changes revoke all prior sessions and retain only the fresh session", async () => {
    const fresh = await updatePassword(a.user.id, { currentPassword: password, password: password + " new", confirmPassword: password + " new" });
    await expect(authenticate(a.token)).rejects.toMatchObject({ status: 401 });
    expect((await authenticate(fresh)).id).toBe(a.user.id);
    a.token = fresh;
  });
  it("reset tokens expire, are single-use, and revoke sessions", async () => {
    let resetUrl = "";
    await requestPasswordReset(b.user.email, async (_email, url) => { resetUrl = url; });
    const token = new URL(resetUrl).searchParams.get("token")!;
    await owner.passwordResetToken.update({ where: { tokenHash: tokenHash(token) }, data: { expiresAt: new Date(0) } });
    await expect(resetPassword(token, password + " reset")).rejects.toMatchObject({ status: 400 });
    await requestPasswordReset(b.user.email, async (_email, url) => { resetUrl = url; });
    const valid = new URL(resetUrl).searchParams.get("token")!;
    const attempts = await Promise.allSettled([resetPassword(valid, password + " reset"), resetPassword(valid, password + " reset")]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(authenticate(b.token)).rejects.toMatchObject({ status: 401 });
  });
});
