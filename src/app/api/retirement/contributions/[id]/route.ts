import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { changeContribution } from "@/server/retirement";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: NextRequest, context: Context) { return handle(async () => { assertOrigin(request); return json(await changeContribution((await currentUser(request)).id, (await context.params).id, await body(request))); }); }
export async function DELETE(request: NextRequest, context: Context) { return handle(async () => { assertOrigin(request); return json(await changeContribution((await currentUser(request)).id, (await context.params).id, await body(request), true)); }); }
