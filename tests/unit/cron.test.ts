import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ owners: vi.fn(), ensure: vi.fn(), run: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { $queryRaw: mocks.owners }, ensureRuntimeRole: mocks.ensure }));
vi.mock("@/server/recurring", () => ({ runAutomaticForOwner: mocks.run }));
vi.mock("@/server/http", () => ({ json: (data: unknown, status = 200) => Response.json(data, { status }), handle: (fn: () => unknown) => fn() }));
import { GET } from "@/app/api/cron/recurring/route";
const secret = "a".repeat(64);
const request = (token?: string) => new NextRequest("https://example.test/api/cron/recurring", { headers: token ? { authorization: `Bearer ${token}` } : {} });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", secret); mocks.owners.mockResolvedValue([{ id: "one" }, { id: "two" }]); mocks.run.mockResolvedValue({ posted: 1, batchLimitReached: false }); });
afterEach(() => vi.unstubAllEnvs());
it("rejects missing, incorrect and unconfigured secrets before database access", async () => {
  for (const token of [undefined, "wrong", "b".repeat(64)]) expect((await GET(request(token))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(request(secret))).status).toBe(401);
  expect(mocks.owners).not.toHaveBeenCalled();
});
it("runs owners with bounded deadlines and aggregates progress", async () => {
  const before = Date.now();
  expect(await (await GET(request(secret))).json()).toEqual({ processed: 2, posted: 2, failed: 0, incomplete: false });
  expect(mocks.ensure).toHaveBeenCalledOnce();
  for (const call of mocks.run.mock.calls) { expect(call[2]).toBeGreaterThanOrEqual(before); expect(call[2]).toBeLessThanOrEqual(Date.now() + 15000); }
});
it("continues after one owner fails and reports a retryable failure", async () => {
  mocks.run.mockRejectedValueOnce(new Error("private database details"));
  const response = await GET(request(secret));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ processed: 2, posted: 1, failed: 1, incomplete: false });
});
