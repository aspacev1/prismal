import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // next-auth's internal files import "next/server" as a bare ESM specifier.
  // Left external, Node's strict ESM resolver can't find it (no "exports"
  // map entry, no extension). Inlining routes it through Vite's resolver.
  ssr: {
    noExternal: ["next-auth"],
  },
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
