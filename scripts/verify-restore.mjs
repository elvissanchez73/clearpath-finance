// Isolated synthetic dump/restore exercise. Never dumps or restores a real workspace.
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: path.join(root, ".env"), quiet: true });
const direct = new URL(process.env.TEST_DIRECT_URL || "");
if (!["localhost", "127.0.0.1"].includes(direct.hostname) || !direct.pathname.endsWith("_test")) throw new Error("Restore verification requires a local dedicated test database URL.");
const tag = randomBytes(6).toString("hex"), source = `clearpath_restore_${tag}_source_test`, target = `clearpath_restore_${tag}_target_test`;
const scratch = path.resolve(root, "../../work"), dump = path.join(scratch, `restore-${tag}.dump`);
const bin = process.env.PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "/usr/lib/postgresql/18/bin");
const urlFor = name => { const url = new URL(direct); url.pathname = "/" + name; return url.toString(); };
const admin = new pg.Client({ connectionString: urlFor("postgres") });
const clients = [], created = [];
function command(name, args) { execFileSync(path.join(bin, name + (process.platform === "win32" ? ".exe" : "")), args, { windowsHide: true, stdio: "pipe", env: { ...process.env, PGPASSWORD: decodeURIComponent(direct.password) } }); }
const connection = ["--host", direct.hostname, "--port", direct.port || "5432", "--username", decodeURIComponent(direct.username)];
try {
  fs.mkdirSync(scratch, { recursive: true }); await admin.connect();
  for (const name of [source, target]) { assert.match(name, /^clearpath_restore_[a-f0-9]{12}_(source|target)_test$/); await admin.query(`CREATE DATABASE "${name}"`); created.push(name); }
  execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, windowsHide: true, stdio: "pipe", env: { ...process.env, DATABASE_URL: urlFor(source), DIRECT_URL: urlFor(source) } });
  const src = new PrismaClient({ datasourceUrl: urlFor(source) }); clients.push(src);
  const user = await src.user.create({ data: { name: "Restore fixture", email: `restore-${tag}@example.test`, passwordHash: "synthetic-unusable-password" } });
  await src.userSettings.create({ data: { userId: user.id } });
  const account = await src.account.create({ data: { userId: user.id, name: "Synthetic checking", type: "CHECKING", startingBalanceMinor: 123456n } });
  await src.transaction.create({ data: { userId: user.id, accountId: account.id, type: "EXPENSE", date: new Date("2020-02-29"), amountMinor: 1234n, description: "Synthetic expense" } });
  await src.retirementContribution.create({ data: { userId: user.id, date: new Date("2020-02-29"), employeeMinor: 500n } });
  command("pg_dump", [...connection, "--dbname", source, "--format=custom", "--no-owner", "--no-acl", "--file", dump]);
  command("pg_restore", [...connection, "--dbname", target, "--no-owner", "--no-acl", "--exit-on-error", dump]);
  const dst = new PrismaClient({ datasourceUrl: urlFor(target) }); clients.push(dst);
  assert.equal(await dst.user.count(), 1); assert.equal((await dst.account.findUniqueOrThrow({ where: { id: account.id } })).startingBalanceMinor, 123456n);
  assert.equal((await dst.transaction.findFirstOrThrow()).amountMinor, 1234n); assert.equal((await dst.retirementContribution.findFirstOrThrow()).employeeMinor, 500n);
  const [security] = await dst.$queryRaw`SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace AND relrowsecurity AND relforcerowsecurity`;
  assert.equal(security.count, 14);
  const [migrations] = await dst.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  assert.ok(migrations.count >= 4);
  console.log("Synthetic pg_dump/pg_restore passed: exact financial rows, migration history, and all 14 forced-RLS tables restored.");
} catch { console.error("Synthetic restore verification failed. No application database was used as a source or destination."); process.exitCode = 1; }
finally {
  for (const client of clients) await client.$disconnect();
  for (const name of created.reverse()) { assert.match(name, /^clearpath_restore_[a-f0-9]{12}_(source|target)_test$/); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  await admin.end();
  if (fs.existsSync(dump)) fs.unlinkSync(dump);
}
