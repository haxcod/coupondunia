import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the `@/*` path alias from tsconfig.json so imports resolve in tests.
const alias = {
  "@": fileURLToPath(new URL("./", import.meta.url)),
};

/*
 * Several test files boot their own in-memory MongoDB replica set
 * (`mongodb-memory-server` via `@/test/harness/mongo-memory`). Each replica set
 * is CPU/IO heavy on startup and while running real multi-document
 * transactions. When several of these run in parallel (alongside the jsdom
 * component tests) they starve the machine, and the concurrent-transaction
 * property test (`click-service.increment` fires up to 12 simultaneous MongoDB
 * transactions) intermittently exceeds its timeout.
 *
 * `fileParallelism: false` runs the test files sequentially (the Vitest 4
 * replacement for the removed `poolOptions.forks.singleFork`), guaranteeing
 * only one in-memory replica set is ever alive at a time — keeping the suite
 * deterministic without weakening any concurrency assertion. Component tests
 * still opt into a DOM per-file via an `@vitest-environment jsdom` docblock.
 */
export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    // Run test files one at a time (Vitest 4): only one in-memory MongoDB
    // replica set is alive at any moment, so the concurrent-transaction
    // property test never competes for CPU/IO and times out.
    fileParallelism: false,
    // Transactions are IO-bound; give the concurrency property generous
    // headroom even on a loaded machine.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
