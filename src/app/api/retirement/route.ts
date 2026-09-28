import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { retirementView, saveRetirementSettings } from "@/server/retirement";
import { withOwner } from "@/server/db";
import { todayInZone, monthValue } from "@/lib/ledger-validation";
import { z } from "zod";
export async function GET(request: NextRequest) { return handle(async () => { const user = await currentUser(request); const settings = await withOwner(user.id, tx => tx.userSettings.findUniqueOrThrow({ where: { userId: user.id } })); const input = z.object({ month: monthValue }).strict().parse({ month: todayInZone(settings.timezone).slice(0, 7), ...Object.fromEntries(request.nextUrl.searchParams) }); return json(await retirementView(user.id, input.month)); }); }
export async function PUT(request: NextRequest) { return handle(async () => { assertOrigin(request); return json(await saveRetirementSettings((await currentUser(request)).id, await body(request))); }); }
