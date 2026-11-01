import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { env } from "./cloudflare-env";
import { createParty } from "../lib/game/seed";
import {
  insertParty,
  mutate,
  mutateDroppingSelfies,
  readParty,
} from "../lib/game/store";
import { reduce } from "../lib/game/engine";
import type { Party } from "../lib/game/types";
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of [
    "0000_talented_meggan.sql",
    "0001_misty_karen_page.sql",
    "0002_score_audit.sql",
    "0003_game_reports.sql",
    "0004_cheap_events_guard.sql",
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

describe("selfie clean-up on reset", () => {
  it("deletes the dropped selfies after the commit, ignoring files already gone, and keeps score history", async () => {
    const p = await fixture();
    p.players[0].photo = "11111111-1111-4111-8111-111111111111";
    p.players[1].photo = "22222222-2222-4222-8222-222222222222";
    p.questions[0].media = [
      "/api/media?id=33333333-3333-4333-8333-333333333333",
    ];
    await insertParty(p);
    await mutate((s) => reduce(s, { role: "admin" }, cmd("open")));
    await mutate((s) =>
      reduce(
        s,
        { role: "guest", playerId: "alice" },
        cmd("submit", { value: "Éléphant rose" }),
      ),
    );
    const deleted: string[] = [],
      archived: string[] = [];
    let committed = false;
    // Every file reads back as a tiny JPEG, so the reset can archive it first.
    const file = () => ({
      size: 1,
      httpMetadata: { contentType: "image/jpeg" },
      body: new Blob([new Uint8Array([0xff])]).stream(),
    });
    env.BUCKET = {
      async head(id: string) {
        return id.startsWith("archive/") && !archived.includes(id)
          ? null
          : file();
      },
      async get() {
        return file();
      },
      async put(id: string) {
        archived.push(id);
      },
      async delete(id: string) {
        // The party already points nowhere when the file goes.
        committed = (await readParty())!.party.players.length === 0;
        deleted.push(id);
        if (id.startsWith("2")) throw new Error("already gone");
      },
    };
    const result = await mutateDroppingSelfies((s) =>
      reduce(s, { role: "admin" }, cmd("reset", { confirm: "123456" })),
    );
    expect(committed).toBe(true);
    expect(deleted.sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    // Each selfie was copied into the game's report archive before going.
    expect(archived.map((id) => id.split("/").pop()).sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(result.party.players).toEqual([]);
    expect(result.party.events.length).toBeGreaterThan(0);
    // Nothing more to delete the next time.
    deleted.length = 0;
    await mutateDroppingSelfies((s) => s);
    expect(deleted).toEqual([]);
  });
});
