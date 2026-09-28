// Optional HTTP smoke test against the running local app. Creates and removes only its own synthetic fixture.
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const origin = process.env.APP_ORIGIN;
if (!origin || !["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) throw new Error("This smoke test is local-only.");
const transport = process.env.LOCAL_SMOKE_BASE_URL || origin;
if (!["127.0.0.1", "localhost"].includes(new URL(transport).hostname)) throw new Error("Smoke transport must be local.");
const fixture = `http-smoke-${randomUUID()}@example.test`, password = randomUUID() + randomUUID();
const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
let userId, cookie;
async function api(path, method = "GET", data, status = 200) {
  const response = await fetch(transport + path, { method, headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), redirect: "manual" });
  assert.equal(response.status, status, `${method} ${path}: ${response.status === status ? "" : await response.text()}`);
  return response;
}
try {
  assert.equal((await fetch(transport + "/accounts", { redirect: "manual" })).status, 307);
  assert.equal((await (await api("/api/health")).json()).status, "ok");
  const login = await api("/login"), policy = login.headers.get("content-security-policy");
  const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "A per-request script nonce is present");
  assert.ok((await login.text()).includes(`nonce="${nonce}"`), "Server-rendered scripts use the CSP nonce");
  const scripts = policy.split(";").find(part => part.trim().startsWith("script-src"));
  assert.ok(!scripts.includes("unsafe-inline"));
  const anotherLogin = await api("/login");
  assert.notEqual(anotherLogin.headers.get("content-security-policy"), policy);
  if (origin.startsWith("https:")) assert.ok(!scripts.includes("unsafe-eval"));
  const signup = await api("/api/auth/register", "POST", { name: "HTTP Test", email: fixture, password, confirmPassword: password }, 201);
  userId = (await signup.json()).user.id; cookie = signup.headers.get("set-cookie").split(";")[0];
  assert.ok(signup.headers.get("set-cookie").includes("HttpOnly"));
  if (origin.startsWith("https:")) { assert.ok(cookie.startsWith("__Host-")); assert.ok(signup.headers.get("set-cookie").includes("Secure")); }
  const create = async (resource, data) => (await (await api(`/api/ledger/${resource}`, "POST", data, 201)).json()).record;
  const checking = await create("accounts", { name: "Smoke checking", type: "CHECKING", startingBalance: "1000" });
  const savings = await create("accounts", { name: "Smoke savings", type: "SAVINGS", startingBalance: "0" });
  const category = await create("categories", { name: "Smoke groceries", icon: "shopping-basket" });
  const base = { date: "2020-09-15", accountId: checking.id };
  const expense = await create("transactions", { ...base, requestId: randomUUID(), type: "EXPENSE", amount: "12.34", description: "Smoke purchase", categoryId: category.id });
  const transfer = await create("transactions", { ...base, requestId: randomUUID(), type: "SAVINGS_TRANSFER", amount: "50", description: "Smoke savings transfer", destinationAccountId: savings.id });
  await api(`/api/ledger/transactions/${transfer.id}`, "PATCH", { amount: "75" });
  const records = (await (await api("/api/ledger/accounts")).json()).records;
  assert.equal(records.find(r => r.id === checking.id).balanceMinor, "91266");
  assert.equal(records.find(r => r.id === savings.id).balanceMinor, "7500");
  const matches = await (await api("/api/ledger/transactions?q=purchase&min=12.34&max=12.34")).json();
  assert.equal(matches.total, 1); assert.equal(matches.records[0].id, expense.id);
  const budget = { expectedRevision: null, income: "1000", savings: "75", items: [{ categoryId: category.id, amount: "20", recurring: true }] };
  await api("/api/budgets/2020-09", "PUT", budget);
  const budgetView = await (await api("/api/budgets/2020-09")).json();
  assert.equal(budgetView.totals.remainingToSpendMinor, "91266");
  assert.equal(budgetView.rows[0].remainingMinor, "766");
  await api("/api/budgets/2020-09", "PUT", budget, 409);
  await api("/api/budgets/2020-10/copy", "POST", { sourceMonth: "2020-09", recurringOnly: true }, 201);
  const copy = await (await api("/api/budgets/2020-10")).json();
  assert.equal(copy.actual.expensesMinor, "0"); assert.equal(copy.plan.items.length, 1);
  const goalInput = { name: "Smoke emergency fund", target: "100", startingAmount: "25", monthlyContribution: "25", targetDate: null, accountId: savings.id, status: "ACTIVE", icon: "shield", notes: "Synthetic test goal" };
  const goal = await (await api("/api/goals", "POST", goalInput, 201)).json();
  await api(`/api/ledger/transactions/${transfer.id}`, "PATCH", { goalId: goal.id });
  const funded = (await (await api(`/api/goals/${goal.id}`)).json()).goal;
  assert.equal(funded.currentMinor, "10000"); assert.equal(funded.status, "COMPLETED");
  await api("/api/goals/roadmap", "PUT", { monthlyContribution: "200" });
  await api("/api/goals/order", "PUT", { ids: [goal.id] });
  assert.equal((await (await api(`/api/ledger/transactions?goal=${goal.id}`)).json()).total, 1);
  const analytics = await (await api("/api/analytics?month=2020-09&range=1")).json();
  assert.equal(analytics.totals.expenses, "1234");
  assert.equal(analytics.totals.savings, "7500");
  assert.equal(analytics.points[0].balance, "98766");
  assert.equal(analytics.goals[0].current, "10000");
  assert.ok((await (await api("/analytics?month=2020-09&range=3")).text()).includes("Account balance history"));
  for (const [path, text] of [["/dashboard?month=2020-09", "Remaining to spend this month"], ["/budget?month=2020-09", "Plan versus actual"], ["/accounts", "Smoke checking"], ["/categories", "Smoke groceries"], ["/transactions", "Smoke purchase"], ["/settings", "Settings"], ["/goals", "Smoke emergency fund"], ["/goals/roadmap", "Savings roadmap"]]) {
    const response = await api(path); assert.ok((await response.text()).includes(text), `${path} server-rendered content`);
  }
  const scheduleInput = { name: "Smoke subscription", type: "EXPENSE", amount: "10", accountId: checking.id, categoryId: category.id, frequency: "MONTHLY", nextDueDate: "2020-01-31", firstDay: 1, secondDay: 15, active: true, autoCreate: false, subscription: true };
  const schedule = (await (await api("/api/recurring", "POST", scheduleInput, 201)).json()).record;
  await api(`/api/recurring/${schedule.id}`, "POST", { action: "post", dueDate: "2020-01-31" });
  await api(`/api/recurring/${schedule.id}`, "POST", { action: "post", dueDate: "2020-01-31" });
  assert.equal((await (await api("/api/ledger/transactions?q=Smoke%20subscription")).json()).total, 1);
  await api(`/api/recurring/${schedule.id}`, "POST", { action: "skip", dueDate: "2020-02-29" });
  await api("/api/income", "PUT", { expectedRevision: null, annualSalary: "52000", netPaycheck: "1600", payFrequency: "BIWEEKLY" });
  assert.equal((await (await api("/api/income?month=2020-09")).json()).settings.netPaycheckMinor, "160000");
  await api("/api/retirement/contributions", "POST", { date: "2020-09-15", employee: "100", employerMatch: "50", employerOther: "0", notes: "Smoke fixture" }, 201);
  assert.equal((await (await api("/api/retirement/contributions?month=2020-09")).json()).monthly.employeeMinor, "10000");
  const review = await (await api("/api/review?month=2020-09")).json();
  assert.equal(review.expenses, "1234"); assert.equal(review.underBudget, "766");
  assert.equal(review.retirement.employee, "10000");
  const calendar = await (await api("/api/calendar?month=2020-02")).json();
  assert.ok(calendar.events.some(e => e.state === "skipped" && e.date === "2020-02-29"));
  const forecast = await (await api("/api/calendar?month=2020-03")).json();
  assert.ok(forecast.events.some(e => e.state === "planned" && e.date === "2020-03-31"));
  assert.ok((await (await api("/calendar?month=2020-02")).text()).includes("Financial calendar"));
  assert.ok((await (await api("/review?month=2020-09")).text()).includes("Goal progress through month-end"));
  for (const step of [0, 1, 2, 3, 4]) {
    await api("/api/onboarding", "PUT", { step, complete: false });
    assert.ok((await (await api("/onboarding")).text()).includes("Skip setup"));
  }
  await api("/api/onboarding", "PUT", { step: 4, complete: true });
  const preferences = (await (await api("/api/workspace/settings")).json()).records[0];
  await api("/api/preferences", "PUT", { expectedRevision: preferences.updatedAt, defaultIncome: "3000", defaultSavings: "200", notificationsEnabled: true });
  assert.equal((await (await api("/api/budgets/2020-11")).json()).defaults.savingsMinor, "20000");
  await api("/api/retirement", "PUT", { expectedRevision: null, annualSalary: "58000", employeePercent: "6", matchPercent: "0", otherPercent: "0", currentBalance: "5000" });
  assert.equal((await (await api("/api/retirement?month=2020-09")).json()).estimate.employee.monthly, "29000");
  assert.ok((await (await api("/retirement?month=2020-09")).text()).includes("Actual contributions"));
  const contributionInput = { requestId: randomUUID(), date: "2020-09-15", employee: "10", employerMatch: "0", employerOther: "0", notes: "Retry fixture" };
  const contribution = (await (await api("/api/retirement/contributions", "POST", contributionInput, 201)).json()).record;
  assert.equal((await (await api("/api/retirement/contributions", "POST", contributionInput, 201)).json()).record.id, contribution.id);
  await api(`/api/retirement/contributions/${contribution.id}`, "PUT", { date: "2020-09-15", employee: "5", employerMatch: "0", employerOther: "0", notes: "Edited", expectedRevision: contribution.updatedAt });
  const edited = (await (await api("/api/retirement?month=2020-09")).json()).records.find(r => r.id === contribution.id);
  await api(`/api/retirement/contributions/${contribution.id}`, "DELETE", { expectedRevision: edited.revision });
  const csv = await api("/api/export?format=csv&from=2020-09-01&to=2020-09-30");
  assert.ok(csv.headers.get("content-disposition").includes("attachment"));
  assert.ok((await csv.text()).includes("Smoke purchase"));
  const backup = await (await api("/api/export?format=json")).json();
  assert.equal(backup.schemaVersion, 1); assert.equal(backup.data.accounts.length, 2);
  assert.equal(backup.data.settings.onboardingComplete, true);
  assert.ok(!JSON.stringify(backup).includes("passwordHash"));
  for (const path of ["/recurring", "/subscriptions", "/income"]) assert.ok((await (await api(path)).text()).includes("Smoke"), `${path} content`);
  // Verify the actual background timer, without invoking the manual run endpoint.
  await api("/api/recurring", "POST", { ...scheduleInput, name: "Smoke worker", frequency: "YEARLY", nextDueDate: new Date().toISOString().slice(0, 10), autoCreate: true }, 201);
  const deadline = Date.now() + 75000;
  let posted = false;
  while (Date.now() < deadline) {
    posted = (await (await api("/api/ledger/transactions?q=Smoke%20worker")).json()).total === 1;
    if (posted) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.ok(posted, "Background worker posts a due entry without a manual trigger");
  await api(`/api/ledger/transactions/${transfer.id}`, "DELETE");
  assert.equal((await (await api(`/api/goals/${goal.id}`)).json()).goal.status, "ACTIVE");
  await api(`/api/goals/${goal.id}`, "DELETE");
  await api(`/api/ledger/transactions/${expense.id}`, "DELETE");
  await api("/api/auth/logout", "POST");
  await api("/api/ledger/accounts", "GET", undefined, 401);
  console.log("Live HTTP smoke passed: prior workflows, all five onboarding steps, financial preferences, retirement estimates and contribution CRUD/retries, CSV/JSON downloads, background worker, sixteen protected server-rendered pages, logout.");
} finally {
  // Never delete by broad email pattern. Use only the exact ID/email of the fixture created by this run.
  const user = userId ? { id: userId, email: fixture } : { email: fixture };
  const row = await owner.user.findFirst({ where: user, select: { id: true } });
  if (row) {
    await owner.transaction.deleteMany({ where: { userId: row.id } });
    await owner.recurringTransaction.deleteMany({ where: { userId: row.id } });
    await owner.monthlyBudget.deleteMany({ where: { userId: row.id } });
    await owner.savingsGoal.deleteMany({ where: { userId: row.id } });
    await owner.account.deleteMany({ where: { userId: row.id } });
    await owner.user.delete({ where: { id: row.id } });
  }
  await owner.$disconnect();
}
