import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { goalsView, saveGoal } from "@/server/goals";
export async function GET(request: NextRequest) { return handle(async () => json(await goalsView((await currentUser(request)).id))); }
export async function POST(request: NextRequest) { return handle(async () => { assertOrigin(request); const user = await currentUser(request); return json(await saveGoal(user.id, await body(request)), 201); }); }
