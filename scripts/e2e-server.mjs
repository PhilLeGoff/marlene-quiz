import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
const state = ".wrangler/e2e-state";
const builtConfig = "dist/server/wrangler.json";
const config = ".sites-runtime/e2e-wrangler.json";
if (!existsSync(builtConfig))
  throw new Error("Exécuter npm run build avant les tests navigateur.");
mkdirSync(".sites-runtime", { recursive: true });
const settings = JSON.parse(readFileSync(builtConfig, "utf8"));
settings.main = new URL("../dist/server/index.js", import.meta.url).pathname;
settings.assets.directory = new URL("../dist/client", import.meta.url).pathname;
settings.vars = {
  ...settings.vars,
  ADMIN_PASSWORD: "admin-test-only",
  // The blind-test search answers from a built-in list instead of Deezer/iTunes.
  SONG_SEARCH_FIXTURE: "1",
};
writeFileSync(config, JSON.stringify(settings));
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
