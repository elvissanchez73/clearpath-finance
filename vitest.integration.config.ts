import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ resolve: { alias: { "@": path.resolve("src"), "server-only": path.resolve("tests/server-only.ts") } }, test: { include: ["tests/integration/**/*.test.ts"], environment: "node", setupFiles: ["tests/integration/setup.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 } });
