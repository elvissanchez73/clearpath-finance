import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser, handle, json } from "@/server/http";
import { reviewView } from "@/server/review";
import { monthValue, todayInZone } from "@/lib/ledger-validation";
import { withOwner } from "@/server/db";
export async function GET(request: NextRequest) { return handle(async () => {
  const user = await currentUser(request);
  const settings = await withOwner(user.id, tx => tx.userSettings.findUniqueOrThrow({ where: { userId: user.id } }));
  const input = z.object({ month: monthValue }).strict().parse({ month: todayInZone(settings.timezone).slice(0, 7), ...Object.fromEntries(request.nextUrl.searchParams) });
  return json(await reviewView(user.id, input.month));
}); }
