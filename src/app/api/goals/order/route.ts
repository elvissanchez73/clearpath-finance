import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { reorderGoals } from "@/server/goals";
export async function PUT(request: NextRequest) { return handle(async () => { assertOrigin(request); const user = await currentUser(request); return json(await reorderGoals(user.id, await body(request))); }); }
