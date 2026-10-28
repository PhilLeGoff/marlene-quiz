import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
const state = ".wrangler/e2e-state";
const config = "dist/server/wrangler.json";
if (!existsSync(config))
  throw new Error("Exécuter npm run build avant les tests navigateur.");
// This directory belongs only to Playwright; never touch the live preview state.
rmSync(state, { recursive: true, force: true });
const cli = [
  "--import",
  "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
];
for (const file of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const r = spawnSync(
    process.execPath,
    [
      ...cli,
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      config,
      "--persist-to",
      state,
      "--file",
      `drizzle/${file}`,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const server = spawn(
  process.execPath,
  [
    ...cli,
    "dev",
    "--config",
    config,
    "--local",
    "--persist-to",
    state,
    "--ip",
    "127.0.0.1",
    "--port",
    "3105",
    "--inspector-port",
    "0",
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
