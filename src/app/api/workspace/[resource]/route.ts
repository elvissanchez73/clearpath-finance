import { NextRequest } from "next/server";
import { currentUser, handle, json } from "@/server/http";
import { listRecords, resourceSchema } from "@/server/workspace";
export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  return handle(async () => {
    const user = await currentUser(request);
    const { resource } = await context.params;
    const parsed = resourceSchema.safeParse(resource);
    if (!parsed.success) return json({ error: "Not found." }, 404);
    return json({ records: await listRecords(user.id, parsed.data) });
  });
}
