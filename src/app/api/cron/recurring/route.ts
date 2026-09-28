import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { db, ensureRuntimeRole } from "@/server/db";
import { handle, json } from "@/server/http";
import { runAutomaticForOwner } from "@/server/recurring";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json({ error: "Unauthorized" }, 401);
  return handle(async () => {
    await ensureRuntimeRole();
    const deadline = Date.now() + 40000;
    // Daily rotation avoids always giving the same owners the first time slots.
    const owners = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" ORDER BY md5(id || CURRENT_DATE::text) LIMIT 101`;
    let processed = 0, posted = 0, failed = 0, incomplete = owners.length > 100;
    for (const owner of owners.slice(0, 100)) {
      if (Date.now() >= deadline) { incomplete = true; break; }
      try {
        const result = await runAutomaticForOwner(owner.id, new Date(), Math.min(deadline, Date.now() + 15000));
        posted += result.posted; incomplete ||= result.batchLimitReached;
      } catch { failed++; }
      processed++;
    }
    return json({ processed, posted, failed, incomplete }, failed ? 503 : 200);
  });
}
