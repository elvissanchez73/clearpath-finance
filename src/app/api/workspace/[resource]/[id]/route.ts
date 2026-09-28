import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { getRecord, updateRecord, deleteRecord, resourceSchema } from "@/server/workspace";
type Context = { params: Promise<{ resource: string; id: string }> };
async function respond(request: NextRequest, context: Context, method: "GET" | "PATCH" | "DELETE") {
  return handle(async () => {
    if (method !== "GET") assertOrigin(request);
    const user = await currentUser(request);
    const { resource, id } = await context.params;
    const parsed = resourceSchema.safeParse(resource);
    if (!parsed.success) return json({ error: "Not found." }, 404);
    if (method === "GET") return json({ record: await getRecord(user.id, parsed.data, id) });
    if (method === "PATCH") return json(await updateRecord(user.id, parsed.data, id, await body(request)));
    return json(await deleteRecord(user.id, parsed.data, id));
  });
}
export const GET = (request: NextRequest, context: Context) => respond(request, context, "GET");
export const PATCH = (request: NextRequest, context: Context) => respond(request, context, "PATCH");
export const DELETE = (request: NextRequest, context: Context) => respond(request, context, "DELETE");
