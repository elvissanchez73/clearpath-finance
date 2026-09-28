import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";
import { financialTables } from "@/lib/security";

const globalDb = globalThis as unknown as { clearpathDb?: PrismaClient };
export const db = globalDb.clearpathDb ?? new PrismaClient({ log: [] });
if (process.env.NODE_ENV !== "production") globalDb.clearpathDb = db;

let roleCheck: Promise<void> | undefined;
export function ensureRuntimeRole() {
  roleCheck ??= verifyDatabaseProtection(db).catch(error => { roleCheck = undefined; throw error; });
  return roleCheck;
}
export async function verifyDatabaseProtection(client: PrismaClient) {
    const [role] = await client.$queryRaw<{ unsafe: boolean }[]>`
      SELECT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR EXISTS (
        SELECT 1 FROM pg_class c WHERE c.relname IN (${Prisma.join(financialTables)}) AND c.relnamespace = 'public'::regnamespace AND pg_has_role(current_user, c.relowner, 'MEMBER')
      )) AS unsafe FROM pg_roles r WHERE r.rolname = current_user`;
    if (!role || role.unsafe) throw new Error("Runtime database role must not own tables or bypass row security.");
    const [protection] = await client.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN (${Prisma.join(financialTables)}) AND c.relrowsecurity AND c.relforcerowsecurity AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)`;
    if (protection.count !== BigInt(financialTables.length)) throw new Error("Financial tables require forced row security and owner policies.");
}

/** Only trusted server session IDs may enter this boundary. Never pass request.userId. */
export async function withOwner<T>(userId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("Owner context required");
  await ensureRuntimeRole();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return operation(tx);
  });
}
