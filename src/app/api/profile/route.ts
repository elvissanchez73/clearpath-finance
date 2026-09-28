import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { publicUser } from "@/server/auth";
import { profile } from "@/lib/validation";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
export async function GET(request: NextRequest) { return handle(async () => json({ user: await currentUser(request) })); }
export async function PATCH(request: NextRequest) {
  return handle(async () => {
    assertOrigin(request);
    const user = await currentUser(request);
    const data = profile.parse(await body(request));
    return json({ user: await db.user.update({ where: { id: user.id }, data, select: publicUser }) });
  });
}
