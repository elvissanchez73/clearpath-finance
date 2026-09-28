import { NextRequest } from "next/server";
import { register, signIn, signOut, updatePassword, cookieName } from "@/server/auth";
import { assertOrigin, body, clearSession, currentUser, handle, json, setSession } from "@/server/http";

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  return handle(async () => {
    assertOrigin(request);
    const { action } = await context.params;
    if (action === "register") {
      const { token, user } = await register(await body(request));
      return setSession(json({ user }, 201), token);
    }
    if (action === "login") {
      const { token, user } = await signIn(await body(request));
      return setSession(json({ user }), token);
    }
    if (action === "logout") {
      await signOut(request.cookies.get(cookieName())?.value);
      return clearSession(json({ ok: true }));
    }
    if (action === "change-password") {
      const user = await currentUser(request);
      return setSession(json({ ok: true }), await updatePassword(user.id, await body(request)));
    }
    return json({ error: "Not found." }, 404);
  });
}
