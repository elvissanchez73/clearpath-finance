import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { incomeView, saveIncomeSettings } from "@/server/income";
import { ledgerOptions } from "@/server/ledger";
export async function GET(request: NextRequest) { return handle(async () => { const user = await currentUser(request); const month = request.nextUrl.searchParams.get("month") || (await ledgerOptions(user.id)).today.slice(0, 7); return json(await incomeView(user.id, month)); }); }
export async function PUT(request: NextRequest) { return handle(async () => { assertOrigin(request); const user = await currentUser(request); return json(await saveIncomeSettings(user.id, await body(request))); }); }
