import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { goalsView, saveGoal, deleteGoal } from "@/server/goals";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  return handle(async () => { const user = await currentUser(request), { id } = await context.params; const goal = (await goalsView(user.id)).goals.find(g => g.id === id); return goal ? json({ goal }) : json({ error: "Record not found." }, 404); });
}
export async function PUT(request: NextRequest, context: Context) { return handle(async () => { assertOrigin(request); const user = await currentUser(request), { id } = await context.params; return json(await saveGoal(user.id, await body(request), id)); }); }
export async function DELETE(request: NextRequest, context: Context) { return handle(async () => { assertOrigin(request); const user = await currentUser(request), { id } = await context.params; return json(await deleteGoal(user.id, id)); }); }
