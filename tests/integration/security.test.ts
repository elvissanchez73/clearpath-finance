import { afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { db, verifyDatabaseProtection } from "@/server/db";
import { GET } from "@/app/api/health/route";
import { register, signIn, tokenHash } from "@/server/auth";
import { cookieName } from "@/server/auth";
import { GET as EXPORT } from "@/app/api/export/route";
import { NextRequest } from "next/server";
const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DIRECT_URL });
afterAll(async () => { await db.$disconnect(); await owner.$disconnect(); });
describe("runtime security gates", () => {
  it("limits downloads per authenticated user and returns retry guidance", async () => {
    const users: Awaited<ReturnType<typeof register>>[] = [];
    try {
      for (let i = 0; i < 2; i++) { const password = "download security test passphrase"; users.push(await register({ name: "Export limit", email: `export-limit-${crypto.randomUUID()}@example.test`, password, confirmPassword: password })); }
      const request = (index: number) => new NextRequest(`${process.env.APP_ORIGIN}/api/export?format=csv`, { headers: { cookie: `${cookieName()}=${users[index].token}` } });
      for (let i = 0; i < 10; i++) expect((await EXPORT(request(0))).status).toBe(200);
      const blocked = await EXPORT(request(0)); expect(blocked.status).toBe(429); expect(blocked.headers.get("retry-after")).toBe("900");
      expect((await EXPORT(request(1))).status).toBe(200);
    } finally { for (const user of users) { await owner.user.delete({ where: { id: user.user.id } }); await owner.authRateLimit.deleteMany({ where: { key: tokenHash(`export:${user.user.id}`) } }); } }
  });
  it("accepts the protected application role and rejects privileged migration credentials", async () => { await expect(verifyDatabaseProtection(db)).resolves.toBeUndefined(); await expect(verifyDatabaseProtection(owner)).rejects.toThrow("Runtime database role"); });
  it("returns a minimal uncached readiness response", async () => { const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual({ status: "ok" }); });
  it("blocks global authentication floods before creating per-email rows", async () => {
    for (const action of ["login", "register"]) {
      const globalKey = tokenHash(`${action}-global:all`), email = `limited-${crypto.randomUUID()}@example.test`, personal = tokenHash(`${action}:${email}`);
      const previous = await owner.authRateLimit.findUnique({ where: { key: globalKey } });
      try {
        await owner.authRateLimit.upsert({ where: { key: globalKey }, create: { key: globalKey, attempts: 1000, windowStart: new Date() }, update: { attempts: 1000, windowStart: new Date() } });
        const input = { email, password: "long synthetic security password" };
        await expect(action === "login" ? signIn(input) : register({ ...input, name: "Rate test", confirmPassword: input.password })).rejects.toMatchObject({ status: 429 });
        expect(await owner.authRateLimit.findUnique({ where: { key: personal } })).toBeNull();
      } finally {
        if (previous) await owner.authRateLimit.update({ where: { key: globalKey }, data: { attempts: previous.attempts, windowStart: previous.windowStart } });
        else await owner.authRateLimit.deleteMany({ where: { key: globalKey } });
        await owner.authRateLimit.deleteMany({ where: { key: personal } });
      }
    }
  });
});
