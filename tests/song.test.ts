import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { env } from "./cloudflare-env";
import {
  cleanSong,
  pickMatches,
  songKey,
  songLabel,
  splitAnswer,
  typedMatches,
} from "../lib/game/song";
import {
  clearSongCache,
  dedupe,
  fromDeezer,
  fromItunes,
  handleSongSearch,
  searchCatalogue,
  searchFixture,
  songQuery,
} from "../lib/game/catalogue";
import { createParty, suppliedAnswers } from "../lib/game/seed";
import { reduce, view } from "../lib/game/engine";
import { hash } from "../lib/game/auth";
import { insertParty } from "../lib/game/store";
import type { Actor, Party, Secret } from "../lib/game/types";

const key = (s: Secret, extra: string[] = []) => songKey(s, extra)!;
// The three keys the live party uses (same shape as the custom rounds stored in production).
const marlene = key(suppliedAnswers.q6a),
  altra = key(suppliedAnswers.q6b),
  bpm = key(suppliedAnswers.q6c);

describe("song keys", () => {
  it("reads 'Artist — Title' answers", () => {
    expect(splitAnswer("Noir Désir — Marlène")).toEqual({
      artist: "Noir Désir",
      title: "Marlène",
    });
    expect(splitAnswer("Marlène")).toEqual({ title: "Marlène" });
  });
  it("has nothing to compare without a title, answer or alias", () => {
    expect(songKey(undefined)).toBeNull();
    expect(songKey({ number: 3 })).toBeNull();
  });
  it("labels the right song as 'Artist — Title'", () => {
    expect(songLabel(suppliedAnswers.q6a)).toBe("Noir Désir — Marlène");
    expect(songLabel({ text: "Marlène", artist: "Noir Désir" })).toBe(
      "Noir Désir — Marlène",
    );
    expect(songLabel({ text: "Marlène" })).toBe("Marlène");
  });
});

describe("a song picked from the search", () => {
  it("matches the live songs as the catalogue writes them", () => {
    expect(
      pickMatches(marlene, { artist: "Noir Désir", title: "Marlène" }),
    ).toBe(true);
    expect(
      pickMatches(altra, { artist: "Måneskin", title: "L'altra dimensione" }),
    ).toBe(true);
    expect(pickMatches(bpm, { artist: "Jive Me", title: "120 BPM" })).toBe(
      true,
    );
  });
  it("ignores remaster, live and version tails", () => {
    for (const title of [
      "Marlène (Remastered 2011)",
      "Marlène - Live",
      "Marlène - Remasterisé",
      "Marlène [Live at Bercy]",
      "Marlène (Emission 'Concert D'Un Soir' de Francis Zégut)",
    ])
      expect(pickMatches(marlene, { artist: "Noir Désir", title })).toBe(true);
    expect(
      pickMatches(bpm, {
        artist: "Jive Me",
        title: "120 BPM (Version extrême)",
      }),
    ).toBe(true);
  });
  it("ignores featured artists, accents, case and punctuation", () => {
    expect(
      pickMatches(marlene, {
        artist: "NOIR DESIR feat. Someone",
        title: "marlene (feat. Someone)",
      }),
    ).toBe(true);
    expect(
      pickMatches(altra, {
        artist: "Maneskin, Guest",
        title: "L’Altra Dimensione!",
      }),
    ).toBe(true);
  });
  it("needs the right artist when the key names one", () => {
    expect(
      pickMatches(marlene, { artist: "17 Hippies", title: "Marlène" }),
    ).toBe(false);
    expect(
      pickMatches(marlene, {
        artist: "Noir Désir",
        title: "Le vent nous portera",
      }),
    ).toBe(false);
    expect(
      pickMatches(altra, { artist: "Erice", title: "Altra Dimensione" }),
    ).toBe(false);
  });
  it("accepts any artist when the key is a title only", () => {
    const k = key({ text: "Marlène" });
    expect(pickMatches(k, { artist: "17 Hippies", title: "Marlène" })).toBe(
      true,
    );
    expect(pickMatches(k, { artist: "Noir Désir", title: "Tostaky" })).toBe(
      false,
    );
  });
  it("uses the artist field of keys saved from the new form", () => {
    const k = key({ text: "120 BPM", artist: "Jive Me" });
    expect(pickMatches(k, { artist: "Jive Me", title: "120 BPM" })).toBe(true);
    expect(pickMatches(k, { artist: "Someone", title: "120 BPM" })).toBe(false);
  });
  it("counts an alias as another title", () => {
    const k = key({
      text: "Je te donne",
      artist: "Jean-Jacques Goldman",
      aliases: ["I give you"],
    });
    expect(
      pickMatches(k, {
        artist: "Jean-Jacques Goldman & Michael Jones",
        title: "I Give You",
      }),
    ).toBe(true);
  });
});

describe("an answer typed by hand (search down or song missing)", () => {
  it("accepts the title, the aliases and artist + title in any order", () => {
    for (const typed of [
      "Marlène",
      "marlene",
      "MARLÈNE !",
      "Noir Désir",
      "Noir Désir Marlène",
      "Noir Désir - Marlène",
      "Marlène de Noir Désir",
      "Marlène par Noir Désir",
      "noir desir: marlene",
      "Marlène (live)",
    ])
      expect(typedMatches(marlene, typed), typed).toBe(true);
    expect(typedMatches(altra, "altra dimensione")).toBe(true);
    expect(typedMatches(altra, "Maneskin altra dimensione")).toBe(true);
    expect(typedMatches(bpm, "jive me 120 bpm")).toBe(true);
  });
  it("refuses other songs and empty answers", () => {
    for (const typed of [
      "",
      "   ",
      "Tostaky",
      "Indochine — L’Aventurier",
      "Le vent nous portera",
    ])
      expect(typedMatches(marlene, typed), typed).toBe(false);
    expect(typedMatches(bpm, "120")).toBe(false);
  });
  it("uses the question's own aliases too", () => {
    expect(
      typedMatches(
        key({ text: "Marlène" }, ["La chanson de Marlène"]),
        "la chanson de marlene",
      ),
    ).toBe(true);
  });
});

describe("cleaning a picked song", () => {
  it("keeps catalogue covers only", () => {
    const base = { id: "dz:1", title: "Marlène", artist: "Noir Désir" };
    expect(
      cleanSong({
        ...base,
        cover:
          "https://cdn-images.dzcdn.net/images/cover/abc/56x56-000000-80-0-0.jpg",
      })?.cover,
    ).toBeDefined();
    expect(
      cleanSong({
        ...base,
        cover: "https://is1-ssl.mzstatic.com/image/thumb/x/60x60bb.jpg",
      })?.cover,
    ).toBeDefined();
    expect(
      cleanSong({ ...base, cover: "https://evil.example/pixel.gif" }),
    ).toEqual(base);
    expect(cleanSong({ ...base, cover: "javascript:alert(1)" })).toEqual(base);
  });
  it("refuses anything that isn't a song", () => {
    expect(cleanSong(null)).toBeNull();
    expect(cleanSong("Marlène")).toBeNull();
    expect(cleanSong({ id: "1", title: "", artist: "x" })).toBeNull();
    expect(
      cleanSong({ id: "1", title: "x".repeat(201), artist: "x" }),
    ).toBeNull();
  });
});

// ── Scoring through the engine ──────────────────────────────────────────────────────
const admin: Actor = { role: "admin" },
  guest = (id: string): Actor => ({ role: "guest", playerId: id });
const run = (
  p: Party,
  a: Actor,
  action: string,
  values: Record<string, unknown> = {},
) => reduce(p, a, { id: crypto.randomUUID(), action, ...values }, 2000);
function blindRound(secret?: Record<string, unknown>) {
  let p = createParty("123456", { admin: "", marlene: "" }, 1000);
  p.questions = p.questions.filter((q) => q.id === "q6a");
  p.questions[0].media = ["/api/media?id=song"];
  p.players = ["alice", "bob", "carol"].map((id, i) => ({
    id,
    nickname: id[0].toUpperCase() + id.slice(1),
    avatar: i,
    active: true,
    joinedAt: 1000 + i,
  }));
  if (secret) p = run(p, admin, "private", { questionId: "q6a", ...secret });
  return run(p, admin, "open");
}
const deltas = (p: Party) =>
  Object.fromEntries(p.events.map((e) => [e.playerId, e.delta]));

describe("blind-test scoring", () => {
  it("scores +1 / −1 for picks and typed answers on a stored-party key", () => {
    let p = blindRound();
    p = run(p, guest("alice"), "submit", {
      value: "ignored",
      song: {
        id: "dz:1",
        title: "Marlène (Remastered)",
        artist: "Noir Désir",
        cover:
          "https://cdn-images.dzcdn.net/images/cover/a/56x56-000000-80-0-0.jpg",
      },
    });
    p = run(p, guest("bob"), "submit", {
      value: "x",
      song: { id: "dz:2", title: "Marlène", artist: "17 Hippies" },
    });
    p = run(p, guest("carol"), "submit", { value: "noir desir marlene" });
    expect(p.phase).toBe("reveal");
    expect(deltas(p)).toEqual({ alice: 1, bob: -1, carol: 1 });
    const alice = p.submissions[p.roundId].find((s) => s.playerId === "alice")!;
    expect(alice.value).toBe("Noir Désir — Marlène (Remastered)");
    expect(alice.song?.cover).toMatch(/dzcdn/);
  });
  it("reveals the right song and everyone's answer, to guests and the TV", () => {
    let p = blindRound();
    p = run(p, guest("alice"), "submit", {
      value: "",
      song: { id: "dz:1", title: "Marlène", artist: "Noir Désir" },
    });
    p = run(p, guest("bob"), "submit", { value: "Tostaky" });
    p = run(p, guest("carol"), "submit", { value: "Marlène" });
    for (const a of [guest("bob"), { role: "present" } as Actor]) {
      const v = view(p, a, 1);
      expect(v.answer?.answers).toEqual(["Noir Désir — Marlène"]);
      expect(v.picks).toEqual([
        {
          playerId: "alice",
          nickname: "Alice",
          label: "Noir Désir — Marlène",
          correct: true,
        },
        { playerId: "bob", nickname: "Bob", label: "Tostaky", correct: false },
        {
          playerId: "carol",
          nickname: "Carol",
          label: "Marlène",
          correct: true,
        },
      ]);
    }
  });
  it("shows no options, no key and no picks while the round is open", () => {
    let p = blindRound();
    p = run(p, guest("alice"), "submit", { value: "Marlène" });
    for (const a of [guest("bob"), { role: "present" } as Actor]) {
      const v = view(p, a, 1);
      expect(v.question?.options).toEqual([]);
      expect(v.answer).toBeUndefined();
      expect(v.picks).toBeUndefined();
    }
    // The host still sees the stored options.
    expect(view(p, admin, 1).questions?.[0].options.length).toBe(4);
  });
  it("uses a key saved with title and artist from the new form", () => {
    let p = blindRound({
      text: "L'altra dimensione",
      artist: "Måneskin",
      aliases: [],
    });
    expect(p.secrets.q6a).toMatchObject({
      text: "L'altra dimensione",
      artist: "Måneskin",
    });
    expect(p.secrets.q6a.answers).toBeUndefined();
    p = run(p, guest("alice"), "submit", {
      value: "",
      song: { id: "1", title: "L'altra dimensione", artist: "Måneskin" },
    });
    p = run(p, guest("bob"), "submit", {
      value: "",
      song: { id: "2", title: "Altra Dimensione", artist: "Erice" },
    });
    p = run(p, guest("carol"), "submit", { value: "altra dimensione" });
    expect(deltas(p)).toEqual({ alice: 1, bob: -1, carol: 1 });
  });
  it("refuses an empty answer and the old option arrays", () => {
    const p = blindRound();
    expect(() => run(p, guest("alice"), "submit", { value: "  " })).toThrow(
      /chanson/,
    );
    expect(() =>
      run(p, guest("alice"), "submit", { value: ["Noir Désir — Marlène"] }),
    ).toThrow(/chanson/);
    expect(() =>
      run(p, guest("alice"), "submit", { value: "x".repeat(201) }),
    ).toThrow(/chanson/);
  });
});

// ── Catalogue parsing and the /api/songs route ────────────────────────────────────────
describe("catalogue responses", () => {
  it("trims Deezer and iTunes results to id, title, artist and cover", () => {
    expect(
      fromDeezer({
        data: [
          {
            id: 1090085,
            title: "Marlène",
            artist: { name: "Noir Désir" },
            album: {
              cover_small:
                "https://cdn-images.dzcdn.net/images/cover/x/56x56-000000-80-0-0.jpg",
            },
            preview: "…",
          },
          { id: 2, title: "", artist: { name: "No title" } },
        ],
      }),
    ).toEqual([
      {
        id: "dz:1090085",
        title: "Marlène",
        artist: "Noir Désir",
        cover:
          "https://cdn-images.dzcdn.net/images/cover/x/56x56-000000-80-0-0.jpg",
      },
    ]);
    expect(
      fromItunes({
        results: [
          {
            trackId: 7,
            trackName: "120 BPM",
            artistName: "Jive Me",
            artworkUrl60: "https://is1-ssl.mzstatic.com/a/60x60bb.jpg",
          },
        ],
      }),
    ).toEqual([
      {
        id: "it:7",
        title: "120 BPM",
        artist: "Jive Me",
        cover: "https://is1-ssl.mzstatic.com/a/60x60bb.jpg",
      },
    ]);
    expect(() => fromDeezer({ error: { code: 4 } })).toThrow();
  });
  it("drops repeated recordings", () => {
    const s = (id: string, artist: string, title: string) => ({
      id,
      artist,
      title,
    });
    expect(
      dedupe([
        s("1", "Noir Désir", "Marlène"),
        s("2", "NOIR DESIR", "Marlene"),
        s("3", "17 Hippies", "Marlène"),
      ]).map((x) => x.id),
    ).toEqual(["1", "3"]);
  });
  it("falls back to iTunes when Deezer fails, and throws when both do", async () => {
    const calls: string[] = [];
    const songs = await searchCatalogue("jive me", (async (url: string) => {
      calls.push(url);
      return url.includes("deezer")
        ? new Response("oops", { status: 503 })
        : Response.json({
            results: [
              { trackId: 1, trackName: "120 BPM", artistName: "Jive Me" },
            ],
          });
    }) as typeof fetch);
    expect(calls.map((u) => new URL(u).host)).toEqual([
      "api.deezer.com",
      "itunes.apple.com",
    ]);
    expect(songs).toEqual([
      { id: "it:1", title: "120 BPM", artist: "Jive Me" },
    ]);
    await expect(
      searchCatalogue("x y", (async () => {
        throw new Error("offline");
      }) as typeof fetch),
    ).rejects.toThrow();
  });
  it("searches the e2e fixture word by word, accents ignored", () => {
    expect(searchFixture("marlene noir").map((s) => s.id)).toEqual([
      "fx:1",
      "fx:3",
    ]);
    expect(searchFixture("zzz")).toEqual([]);
  });
});

describe("GET /api/songs", () => {
  let token = "",
    starToken = "";
  beforeEach(async () => {
    clearSongCache();
    delete env.SONG_SEARCH_FIXTURE;
    const db = new DatabaseSync(":memory:");
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
            return db.prepare(sql).get(...(values as never[])) ?? null;
          },
          async run() {
            const r = db.prepare(sql).run(...(values as never[]));
            return { meta: { changes: Number(r.changes) } };
          },
        };
        return statement;
      },
    };
    const p = createParty("123456", { admin: "", marlene: "" });
    p.players = [
      { id: "alice", nickname: "Alice", avatar: 0, active: true, joinedAt: 0 },
      {
        id: "star",
        nickname: "Marlène",
        avatar: 1,
        active: true,
        joinedAt: 0,
        role: "marlene",
      },
    ];
    token = crypto.randomUUID();
    p.sessions[await hash(token)] = {
      role: "guest",
      playerId: "alice",
      expires: Date.now() + 60_000,
    };
    // Marlène plays the blind test too, signed in with her PIN.
    starToken = crypto.randomUUID();
    p.sessions[await hash(starToken)] = {
      role: "marlene",
      playerId: "star",
      expires: Date.now() + 60_000,
      marleneProof: await hash(`marlene-pin-v1:${p.vipPin}`),
    };
    await insertParty(p);
  });
  const ask = (q: string | null, signedIn = true, get?: typeof fetch) =>
    handleSongSearch(
      new Request(
        `http://localhost/api/songs${q === null ? "" : `?q=${encodeURIComponent(q)}`}`,
        {
          headers: signedIn ? { cookie: `marlene_guest=${token}` } : {},
        },
      ),
      get,
    );
  const deezer = (calls: string[]) =>
    (async (url: string) => {
      calls.push(url);
      return Response.json({
        data: [{ id: 1, title: "Marlène", artist: { name: "Noir Désir" } }],
      });
    }) as typeof fetch;

  it("validates the query before anything else", async () => {
    for (const q of [null, "", "a", " a ", "x".repeat(81)]) {
      const r = await ask(q);
      expect(r.status, String(q)).toBe(400);
    }
    expect(songQuery("  Noir   Désir ")).toBe("Noir Désir");
  });
  it("needs a signed-in session", async () => {
    const calls: string[] = [];
    const r = await ask("marlene", false, deezer(calls));
    expect(r.status).toBe(401);
    expect(calls).toEqual([]);
  });
  it("returns trimmed songs and caches repeated searches", async () => {
    const calls: string[] = [];
    const r = await ask("Marlène noir", true, deezer(calls));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      songs: [{ id: "dz:1", title: "Marlène", artist: "Noir Désir" }],
    });
    await ask("marlène NOIR", true, deezer(calls));
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]).searchParams.get("q")).toBe("Marlène noir");
  });
  it("answers 502 with no songs when every catalogue is down", async () => {
    const r = await ask(
      "marlene",
      true,
      (async () => new Response("", { status: 500 })) as typeof fetch,
    );
    expect(r.status).toBe(502);
    expect(((await r.json()) as { songs: { id: string }[] }).songs).toEqual([]);
  });
  it("serves the fixture when SONG_SEARCH_FIXTURE=1, without any fetch", async () => {
    env.SONG_SEARCH_FIXTURE = "1";
    const r = await ask("altra", true, (async () => {
      throw new Error("no network in tests");
    }) as typeof fetch);
    expect(
      ((await r.json()) as { songs: { id: string }[] }).songs.map(
        (s: { id: string }) => s.id,
      ),
    ).toEqual(["fx:4"]);
  });
  it("accepts Marlène's session, rate-limited like a guest", async () => {
    const calls: string[] = [];
    const asStar = (q: string, as = "&as=marlene") =>
      handleSongSearch(
        new Request(
          `http://localhost/api/songs?q=${encodeURIComponent(q)}${as}`,
          { headers: { cookie: `marlene_marlene=${starToken}` } },
        ),
        deezer(calls),
      );
    // Her cookie is only read as Marlène's.
    expect((await asStar("marlene", "")).status).toBe(401);
    expect((await asStar("Marlène noir")).status).toBe(200);
    let last = 200;
    for (let i = 0; i < 95 && last === 200; i++)
      last = (await asStar(`song ${i}`)).status;
    expect(last).toBe(429);
  });
  it("rate-limits each player", async () => {
    const calls: string[] = [];
    let last = 200;
    for (let i = 0; i < 95 && last === 200; i++)
      last = (await ask(`song ${i}`, true, deezer(calls))).status;
    expect(last).toBe(429);
  });
});
