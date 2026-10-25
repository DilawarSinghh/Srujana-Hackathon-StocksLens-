import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Use the automatic JSX runtime (matches Next.js) so .tsx tests don't need an
  // explicit `import React`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
      // Pure unit tests for the e2e auth-harness helpers (the production-target
      // safety guard). Playwright specs live at e2e/*.spec.ts and never match
      // this *.test.ts pattern, so they are not pulled into vitest.
      "e2e/auth/**/*.test.ts",
    ],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws when loaded outside a React Server Component.
      // Stub it to an empty module so server-only units can be unit-tested.
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
