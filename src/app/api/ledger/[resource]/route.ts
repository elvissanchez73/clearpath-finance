import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { createAccount, createCategory, createTransaction, ledgerOptions, searchTransactions } from "@/server/ledger";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: NextRequest, context: Context) {
  return handle(async () => {
    const user = await currentUser(request), { resource } = await context.params;
    if (resource === "transactions") return json(await searchTransactions(user.id, Object.fromEntries(request.nextUrl.searchParams)));
    if (resource === "accounts" || resource === "categories") return json({ records: (await ledgerOptions(user.id))[resource] });
    return json({ error: "Not found." }, 404);
  });
}
export async function POST(request: NextRequest, context: Context) {
  return handle(async () => {
    assertOrigin(request);
    const user = await currentUser(request), { resource } = await context.params;
    const input = await body(request);
    if (resource === "accounts") return json({ record: await createAccount(user.id, input) }, 201);
    if (resource === "categories") return json({ record: await createCategory(user.id, input) }, 201);
    if (resource === "transactions") return json({ record: await createTransaction(user.id, input) }, 201);
    return json({ error: "Not found." }, 404);
  });
}
