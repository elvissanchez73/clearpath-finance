import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { saveFinancialPreferences } from "@/server/preferences";
export async function PUT(request: NextRequest) { return handle(async () => { assertOrigin(request); return json(await saveFinancialPreferences((await currentUser(request)).id, await body(request))); }); }
