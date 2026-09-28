import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import path from "node:path";
config({ quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_DIRECT_URL"] as const) {
  const value = process.env[key];
  if (!value || !new URL(value).pathname.endsWith("_test")) throw new Error(`${key} must reference a dedicated database ending in _test.`);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: process.env, stdio: "pipe", windowsHide: true });
