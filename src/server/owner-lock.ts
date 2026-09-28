import "server-only";
import type { Prisma } from "@prisma/client";

/** All financial mutations and multi-query summaries for an owner share this lock. */
export async function lockOwner(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}
