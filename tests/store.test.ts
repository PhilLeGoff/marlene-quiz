import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { env } from "./cloudflare-env";
import { createParty } from "../lib/game/seed";
import { insertParty, mutate, readParty } from "../lib/game/store";
import { reduce } from "../lib/game/engine";
import type { Party } from "../lib/game/types";
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of [
    "0000_talented_meggan.sql",
    "0001_misty_karen_page.sql",
    "0002_score_audit.sql",
  ])
    db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  env.DB = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          values = args;
          return statement;
        },
        async first() {
          return db.prepare(sql).get(...(values as any[])) ?? null;
        },
        async run() {
          const r = db.prepare(sql).run(...(values as any[]));
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return statement;
    },
  };
});
const cmd = (action: string, values: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  action,
  ...values,
});
async function fixture() {
  const p = createParty("123456", { admin: "hash", marlene: "hash" });
  p.questions = p.questions.filter((q) => q.id === "q16");
  p.players = [
    { id: "alice", nickname: "Alice", avatar: 0, active: true, joinedAt: 0 },
    { id: "bob", nickname: "Bob", avatar: 1, active: true, joinedAt: 1 },
  ];
  p.questions[0].confirmed = true;
  p.secrets.q16 = { text: "Éléphant rose" };
  return p;
}
describe("database integration", () => {
  it("retains all guests in a simultaneous 32-phone join burst", async () => {
    await insertParty(await fixture());
    const results = await Promise.allSettled(
      Array.from({ length: 32 }, (_, i) =>
        mutate((p) =>
          reduce(
            p,
            { role: "guest", playerId: `burst-${i}` },
            cmd("join", { nickname: `Invité ${i}`, avatar: i % 8 }),
          ),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(32);
    expect((await readParty())?.party.players).toHaveLength(34);
  });

  it("persists session-only in-place mutations", async () => {
    await insertParty(await fixture());
    await mutate((p) => {
      p.sessions["token-hash"] = {
        role: "marlene",
        expires: Date.now() + 10000,
      };
      return p;
    });
    expect((await readParty())?.party.sessions["token-hash"].role).toBe(
      "marlene",
    );
  });
  it("allows a single initialization under contention", async () => {
    const p = await fixture();
    const result = await Promise.all([insertParty(p), insertParty(p)]);
    expect(result.filter(Boolean)).toHaveLength(1);
  });
  it("serializes competing first-correct guesses with optimistic CAS", async () => {
    await insertParty(await fixture());
    await mutate((p) => reduce(p, { role: "admin" }, cmd("open")));
    const results = await Promise.allSettled(
      ["alice", "bob"].map((playerId) =>
        mutate((p) =>
          reduce(
            p,
            { role: "guest", playerId },
            cmd("submit", { value: "elephant rose" }),
          ),
        ),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const p = (await readParty())!.party;
    expect(p.events).toHaveLength(1);
    expect(p.events[0].delta).toBe(5);
    expect(db.prepare("SELECT count(*) n FROM score_events").get()?.n).toBe(1);
  });
  it("enforces immutable score events and append-only aggregate history in SQL", async () => {
    let p = await fixture();
    p = reduce(p, { role: "admin" }, cmd("open"));
    await insertParty(p);
    await mutate((p) =>
      reduce(
        p,
        { role: "guest", playerId: "alice" },
        cmd("submit", { value: "Éléphant rose" }),
      ),
    );
    expect(() => db.prepare("DELETE FROM score_events").run()).toThrow(
      "immutable",
    );
    expect(() => db.prepare("UPDATE score_events SET data='{}'").run()).toThrow(
      "immutable",
    );
    await expect(mutate((p) => ({ ...p, events: [] }))).rejects.toThrow(
      "append-only",
    );
  });
});
