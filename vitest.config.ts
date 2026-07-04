import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 30000,
    // All test files share one Postgres test database (no per-file schema
    // isolation), so file-level parallelism causes one file's afterEach
    // cleanup to race with another file's in-flight assertions.
    fileParallelism: false,
  },
});
