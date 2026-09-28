import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { budgetView, saveBudget } from "@/server/budgets";
type Context = { params: Promise<{ month: string }> };
export async function GET(request: NextRequest, context: Context) {
  return handle(async () => { const user = await currentUser(request), { month } = await context.params; return json(await budgetView(user.id, month)); });
}
export async function PUT(request: NextRequest, context: Context) {
  return handle(async () => { assertOrigin(request); const user = await currentUser(request), { month } = await context.params; return json(await saveBudget(user.id, month, await body(request))); });
}
