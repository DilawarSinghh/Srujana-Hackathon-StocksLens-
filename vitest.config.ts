import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
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
