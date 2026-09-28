import { NextRequest } from "next/server";
import { assertOrigin, body, currentUser, handle, json } from "@/server/http";
import { deleteLedgerRecord, updateAccount, updateCategory, updateTransaction } from "@/server/ledger";
import { withOwner } from "@/server/db";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function GET(request: NextRequest, context: Context) {
  return handle(async () => {
    const user = await currentUser(request), { resource, id } = await context.params;
    const record = await withOwner<unknown>(user.id, async tx => {
      const where = { id, userId: user.id };
      if (resource === "accounts") return tx.account.findFirst({ where });
      if (resource === "categories") return tx.category.findFirst({ where });
      if (resource === "transactions") return tx.transaction.findFirst({ where });
      return null;
    });
    return record ? json({ record }) : json({ error: "Record not found." }, 404);
  });
}
export async function PATCH(request: NextRequest, context: Context) {
  return handle(async () => {
    assertOrigin(request);
    const user = await currentUser(request), { resource, id } = await context.params;
    const input = await body(request);
    if (resource === "accounts") return json({ record: await updateAccount(user.id, id, input) });
    if (resource === "categories") return json({ record: await updateCategory(user.id, id, input) });
    if (resource === "transactions") return json({ record: await updateTransaction(user.id, id, input) });
    return json({ error: "Not found." }, 404);
  });
}
export async function DELETE(request: NextRequest, context: Context) {
  return handle(async () => {
    assertOrigin(request);
    const user = await currentUser(request), { resource, id } = await context.params;
    if (resource !== "accounts" && resource !== "categories" && resource !== "transactions") return json({ error: "Not found." }, 404);
    return json(await deleteLedgerRecord(user.id, resource, id));
  });
}
