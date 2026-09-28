import { NextRequest } from "next/server";
import { currentUser, handle, json } from "@/server/http";
import { analyticsView } from "@/server/analytics";
import { withOwner } from "@/server/db";
import { todayInZone } from "@/lib/ledger-validation";
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await currentUser(request);
    const settings = await withOwner(user.id, tx => tx.userSettings.findUniqueOrThrow({ where: { userId: user.id } }));
    return json(await analyticsView(user.id, { month: todayInZone(settings.timezone).slice(0, 7), ...Object.fromEntries(request.nextUrl.searchParams) }));
  });
}
