import { NextRequest, NextResponse } from "next/server";
import { currentUser, handle } from "@/server/http";
import { exportWorkspace } from "@/server/export";
import { limitAuth } from "@/server/auth";
export async function GET(request: NextRequest) { return handle(async () => {
  const user = await currentUser(request);
  await limitAuth("export", user.id, 10);
  const file = await exportWorkspace(user.id, Object.fromEntries(request.nextUrl.searchParams));
  return new NextResponse(file.content, { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}); }
