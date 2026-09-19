import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // PGlite workers each allocate a full database runtime; bound local memory use.
    maxWorkers: 2,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
