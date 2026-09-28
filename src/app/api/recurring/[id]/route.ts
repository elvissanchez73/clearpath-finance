import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { recurringView, saveRecurring, deleteRecurring, actOnRecurring } from "@/server/recurring";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return handle(async () => { const user = await currentUser(request), { id } = await context.params; const record = (await recurringView(user.id)).records.find(r => r.id === id); return record ? json({ record }) : json({ error: "Record not found." }, 404); }); }
export async function PUT(request: NextRequest, context: Context) { return handle(async () => { assertOrigin(request); const user = await currentUser(request), { id } = await context.params; return json({ record: await saveRecurring(user.id, await body(request), id) }); }); }
export async function POST(request: NextRequest, context: Context) { return handle(async () => { assertOrigin(request); const user = await currentUser(request), { id } = await context.params; return json(await actOnRecurring(user.id, id, await body(request))); }); }
export async function DELETE(request: NextRequest, context: Context) { return handle(async () => { assertOrigin(request); const user = await currentUser(request), { id } = await context.params; return json(await deleteRecurring(user.id, id)); }); }
