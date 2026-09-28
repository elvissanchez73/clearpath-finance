import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { contentSecurityPolicy, financialTables } from "@/lib/security";
import { proxy } from "@/proxy";
describe("production script security", () => {
  it("requires a nonce and blocks arbitrary inline/eval scripts in production", () => { const policy = contentSecurityPolicy("abcDEF123+/=", false), scripts = policy.split(";").find(d => d.trim().startsWith("script-src"))!; expect(scripts).toContain("'nonce-abcDEF123+/='"); expect(scripts).toContain("'strict-dynamic'"); expect(scripts).not.toContain("unsafe-inline"); expect(scripts).not.toContain("unsafe-eval"); expect(policy).toContain("upgrade-insecure-requests"); });
  it("permits debugging eval only in development and rejects injected nonce syntax", () => { expect(contentSecurityPolicy("abc123", true)).toContain("unsafe-eval"); expect(() => contentSecurityPolicy("abc'; script-src *", false)).toThrow(); });
  it("generates fresh nonces and overrides untrusted incoming security headers", () => { const req = new NextRequest("http://localhost/login", { headers: { "x-nonce": "attacker", "content-security-policy": "script-src *" } }); const a = proxy(req), b = proxy(req); expect(a.headers.get("content-security-policy")).not.toEqual(b.headers.get("content-security-policy")); expect(a.headers.get("content-security-policy")).not.toContain("attacker"); expect(a.headers.get("cache-control")).toBe("private, no-store"); });
  it("enumerates each financial table once for runtime protection checks", () => { expect(financialTables).toHaveLength(14); expect(new Set(financialTables).size).toBe(14); });
});
