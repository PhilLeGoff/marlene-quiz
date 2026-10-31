import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      "party-runtime": new URL("./tests/cloudflare-env.ts", import.meta.url)
        .pathname,
      "@": new URL(".", import.meta.url).pathname,
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
