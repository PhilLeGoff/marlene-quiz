import { defineConfig } from "@playwright/test";
if (
  process.env.TEST_BASE_URL &&
  process.env.TEST_ALLOW_EXTERNAL_MUTATIONS !== "1"
)
  throw new Error(
    "Les tests modifient la partie. Utilisez le serveur isolé par défaut, ou confirmez une base de test avec TEST_ALLOW_EXTERNAL_MUTATIONS=1.",
  );
export default defineConfig({
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "node scripts/e2e-server.mjs",
        url: "http://127.0.0.1:3105",
        reuseExistingServer: false,
        timeout: 90000,
      },
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 12000 },
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
