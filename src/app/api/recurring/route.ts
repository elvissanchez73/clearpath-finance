import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { recurringView, saveRecurring, runAutomaticForOwner } from "@/server/recurring";
import { limitAuth } from "@/server/auth";
export const maxDuration = 60;
export async function GET(request: NextRequest) { return handle(async () => json(await recurringView((await currentUser(request)).id))); }
export async function POST(request: NextRequest) { return handle(async () => { assertOrigin(request); const user = await currentUser(request); return json({ record: await saveRecurring(user.id, await body(request)) }, 201); }); }
export async function PATCH(request: NextRequest) { return handle(async () => { assertOrigin(request); const user = await currentUser(request); await limitAuth("recurring-run", user.id, 30); return json(await runAutomaticForOwner(user.id, new Date(), Date.now() + 40000)); }); }
