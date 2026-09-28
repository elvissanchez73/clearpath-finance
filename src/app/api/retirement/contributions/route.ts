import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { createRetirementContribution, retirementSummary } from "@/server/income";
import { ledgerOptions } from "@/server/ledger";
export async function GET(request: NextRequest) { return handle(async () => { const user = await currentUser(request); return json(await retirementSummary(user.id, request.nextUrl.searchParams.get("month") || (await ledgerOptions(user.id)).today.slice(0, 7))); }); }
export async function POST(request: NextRequest) { return handle(async () => { assertOrigin(request); const user = await currentUser(request); return json({ record: await createRetirementContribution(user.id, await body(request)) }, 201); }); }
