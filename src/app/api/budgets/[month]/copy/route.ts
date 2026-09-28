import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { copyBudget } from "@/server/budgets";
export async function POST(request: NextRequest, context: { params: Promise<{ month: string }> }) {
  return handle(async () => { assertOrigin(request); const user = await currentUser(request), { month } = await context.params; return json(await copyBudget(user.id, month, await body(request)), 201); });
}
