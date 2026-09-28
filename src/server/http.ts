import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { authenticate, cookieName, SESSION_SECONDS } from "./auth";
import { ApiError } from "./errors";
import { config } from "./config";

export function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data, (_, value) => typeof value === "bigint" ? value.toString() : value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}
export function setSession(response: NextResponse, token: string) {
  response.cookies.set(cookieName(), token, { httpOnly: true, secure: config().secure, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
export function clearSession(response: NextResponse) {
  response.cookies.set(cookieName(), "", { httpOnly: true, secure: config().secure, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
export function assertOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== config().origin || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "This request could not be verified. Reload the page and try again.");
}
export async function body(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415, "Send JSON data.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request data is required.");
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 16384) { await reader.cancel(); throw new ApiError(413, "Request is too large."); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try { return JSON.parse(text) as unknown; } catch { throw new ApiError(400, "Invalid request data."); }
}
export async function currentUser(request?: NextRequest) {
  if (request) return authenticate(request.cookies.get(cookieName())?.value);
  const jar = await cookies();
  return authenticate(jar.get(cookieName())?.value);
}
export async function handle(operation: () => Promise<NextResponse>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof ApiError) { const response = json({ error: error.message }, error.status); if (error.status === 429) response.headers.set("Retry-After", "900"); return response; }
    if (error instanceof ZodError) return json({ error: error.issues[0]?.message || "Check your entries." }, 400);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") return json({ error: "This record is still used by other records and cannot be removed." }, 409);
    // Do not log request bodies, session tokens, passwords, or raw database exceptions.
    return json({ error: "We couldn't complete that request. Please try again." }, 500);
  }
}
