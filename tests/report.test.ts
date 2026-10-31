import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { env } from "./cloudflare-env";
import { createParty } from "../lib/game/seed";
import { FINISHED_WIPE_MS, reduce, wipeFinished } from "../lib/game/engine";
import { hash } from "../lib/game/auth";
import {
  insertParty,
  mutate,
  mutateDroppingSelfies,
  readParty,
} from "../lib/game/store";
import {
  listReports,
  readReport,
  reportFinished,
  reportMedia,
  saveReport,
} from "../lib/game/archive";
import {
  archiveKey,
  buildReport,
  renderReportHtml,
  reportId,
} from "../lib/game/report";
import { GET as reportsGET } from "../app/api/reports/route";
import { GET as avatarGET } from "../app/api/avatar/route";
import { GET as drawingGET } from "../app/api/drawing/route";
import { GET as gameGET } from "../app/api/game/route";
import type { Actor, Party, Stroke } from "../lib/game/types";

let db: DatabaseSync;
let bucket: Map<string, { bytes: Uint8Array; type: string }>;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
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
          return db.prepare(sql).get(...(values as SQLInputValue[])) ?? null;
        },
        async all() {
          return {
            results: db.prepare(sql).all(...(values as SQLInputValue[])),
          };
        },
        async run() {
          const r = db.prepare(sql).run(...(values as SQLInputValue[]));
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return statement;
    },
  };
  bucket = new Map();
  const object = (key: string) => {
    const o = bucket.get(key);
    return o
      ? {
          size: o.bytes.length,
          httpMetadata: { contentType: o.type },
          body: new Blob([o.bytes as BlobPart]).stream(),
        }
      : null;
  };
  env.BUCKET = {
    async head(key: string) {
      return object(key);
    },
    async get(key: string) {
      return object(key);
    },
    async put(
      key: string,
      body: ArrayBuffer,
      opts: { httpMetadata: { contentType: string } },
    ) {
      bucket.set(key, {
        bytes: new Uint8Array(body.slice(0)),
        type: opts.httpMetadata.contentType,
      });
    },
    async delete(key: string) {
      bucket.delete(key);
    },
  };
  env.ADMIN_PASSWORD = "unit-admin-secret";
});

const admin: Actor = { role: "admin", playerId: "host" },
  star: Actor = { role: "marlene" },
  guest = (id: string): Actor => ({ role: "guest", playerId: id });
let clock = 10_000;
const run = (
  p: Party,
  a: Actor,
  action: string,
  values: Record<string, unknown> = {},
) =>
  reduce(p, a, { id: crypto.randomUUID(), action, ...values }, (clock += 1000));

const ALICE_SELFIE = "11111111-1111-4111-8111-111111111111",
  BOB_SELFIE = "22222222-2222-4222-8222-222222222222",
  ALICE_DRAWING = "44444444-4444-4444-8444-444444444444",
  BOB_DRAWING = "55555555-5555-4555-8555-555555555555",
  SONG = "33333333-3333-4333-8333-333333333333";
const stroke: Stroke = {
  id: "s1",
  color: "#392938",
  size: 6,
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.6, y: 0.5 },
  ],
};
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

// A whole short game: a quiz round, a Pictionary, a drawing contest, a host adjustment.
function finishedParty() {
  let p = createParty("123456", { admin: "", marlene: "" }, 1000);
  p.questions = ["q4", "q16", "q17"].map((id) =>
    p.questions.find((q) => q.id === id)!,
  );
  for (const q of p.questions) q.enabled = true;
  p.questions[0].media = [`/api/media?id=${SONG}`];
  p.players = [
    {
      id: "host",
      nickname: "Hôte",
      avatar: 0,
      active: true,
      joinedAt: 900,
      role: "admin",
    },
    {
      id: "alice",
      nickname: "Alice",
      avatar: 0,
      active: true,
      joinedAt: 1000,
      photo: ALICE_SELFIE,
    },
    {
      id: "bob",
      nickname: "Bob",
      avatar: 1,
      active: true,
      joinedAt: 1001,
      photo: BOB_SELFIE,
    },
  ];
  p.questions[0].confirmed = true;
  p.secrets.q4 = { answers: ["Son cheval"] };
  p = run(p, admin, "private", { questionId: "q16", text: "Éléphant rose" });
  p = run(p, admin, "private", { questionId: "q17", prompt: "Un gâteau" });
  // Round 1: Alice is right, Bob is wrong; everyone answered, so it closes and is revealed.
  p = run(p, admin, "open");
  p = run(p, guest("alice"), "submit", { value: ["Son cheval"] });
  p = run(p, guest("bob"), "submit", { value: ["Son chat"] });
  expect(p.phase).toBe("reveal");
  p = run(p, admin, "next");
  // Round 2: Bob guesses the word.
  p = run(p, admin, "open");
  p = run(p, guest("alice"), "submit", { value: "girafe" });
  p = run(p, guest("bob"), "submit", { value: "elephant rose" });
  expect(p.phase).toBe("pictionary_winner");
  p = run(p, admin, "next");
  // Round 3: both draw (the route stores the strokes as media), Marlène picks Alice.
  p = run(p, admin, "open");
  for (const [id, media] of [
    ["alice", ALICE_DRAWING],
    ["bob", BOB_DRAWING],
  ]) {
    p = run(p, guest(id), "submit", { value: [stroke] });
    const sub = p.submissions[p.roundId].find((s) => s.playerId === id)!;
    sub.drawingId = media;
    sub.value = [];
  }
  p = run(p, admin, "reveal");
  const aliceSub = p.submissions[p.roundId].find(
    (s) => s.playerId === "alice",
  )!;
  p = run(p, star, "vote", { submissionId: aliceSub.id });
  p = run(p, admin, "adjust", {
    playerId: "bob",
    delta: 2,
    reason: "Joli effort",
  });
  p = run(p, admin, "next");
  expect(p.phase).toBe("finished");
  return p;
}
async function storeMedia() {
  for (const id of [ALICE_SELFIE, BOB_SELFIE])
    bucket.set(id, { bytes: jpeg, type: "image/jpeg" });
  for (const id of [ALICE_DRAWING, BOB_DRAWING])
    bucket.set(id, {
      bytes: new TextEncoder().encode(JSON.stringify([stroke])),
      type: "application/json",
    });
  bucket.set(SONG, { bytes: new Uint8Array([1]), type: "audio/wav" });
}
// Signs a player in with a cookie, as the routes expect.
async function signIn(
  p: Party,
  role: "admin" | "guest" | "marlene",
  playerId: string,
) {
  const t = crypto.randomUUID();
  p.sessions[await hash(t)] = {
    role,
    playerId,
    expires: Date.now() + 60_000,
    ...(role === "admin"
      ? { adminProof: await hash("unit-admin-secret") }
      : {}),
  };
  return { cookie: `marlene_${role}=${t}` };
}

describe("end-of-game report", () => {
  it("keeps every round, answer, point, winner and the final ranking", () => {
    const r = buildReport(finishedParty())!;
    expect(r.finished).toBe(true);
    expect(r.rounds.map((x) => x.title)).toHaveLength(3);
    const [quiz, pictionary, drawing] = r.rounds;
    expect(quiz.kind).toBe("choice");
    expect(quiz.options).toContain("Son cheval");
    expect(quiz.rightAnswer).toBe("Son cheval");
    expect(quiz.media).toEqual([`/api/media?id=${SONG}`]);
    expect(
      quiz.answers.map((a) => [a.nickname, a.value, a.correct, a.points]),
    ).toEqual([
      ["Alice", ["Son cheval"], true, 1],
      ["Bob", ["Son chat"], false, -1],
    ]);
    expect(pictionary.prompt).toBe("Éléphant rose");
    expect(pictionary.winner?.nickname).toBe("Bob");
    expect(pictionary.answers.find((a) => a.playerId === "bob")?.points).toBe(
      5,
    );
    expect(drawing.prompt).toBe("Un gâteau");
    expect(drawing.winner).toMatchObject({
      nickname: "Alice",
      reason: "Le coup de cœur de Marlène",
    });
    expect(drawing.answers.map((a) => [a.drawing, a.points])).toEqual([
      [ALICE_DRAWING, 5],
      [BOB_DRAWING, 0],
    ]);
    expect(r.adjustments).toMatchObject([
      { nickname: "Bob", delta: 2, reason: "Joli effort" },
    ]);
    expect(r.leaderboard.find((x) => x.nickname === "Alice")?.score).toBe(6);
    expect(r.leaderboard.find((x) => x.nickname === "Bob")?.score).toBe(6);
    expect(r.players.map((x) => [x.nickname, x.role, x.photo])).toEqual([
      ["Hôte", "admin", undefined],
      ["Alice", "guest", ALICE_SELFIE],
      ["Bob", "guest", BOB_SELFIE],
    ]);
    expect(r.media.map((m) => m.id).sort()).toEqual(
      [ALICE_DRAWING, ALICE_SELFIE, BOB_DRAWING, BOB_SELFIE].sort(),
    );
    const html = renderReportHtml(r, new Map());
    for (const text of [
      "Alice",
      "Bob",
      "Son cheval",
      "Éléphant rose",
      "Joli effort",
    ])
      expect(html).toContain(text);
  });

  it("escapes what players typed", () => {
    const p = finishedParty();
    p.players[1].nickname = "<script>alert(1)</script>";
    const html = renderReportHtml(buildReport(p)!, new Map());
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps one report per game, updated in place, never downgraded once archived", async () => {
    const p = finishedParty();
    await reportFinished(p);
    await reportFinished(p);
    expect(await listReports()).toHaveLength(1);
    const stored = (await readReport(reportId(p)))!;
    expect(stored.rounds).toHaveLength(3);
    await saveReport({ ...stored, archived: true });
    await saveReport({ ...stored, archived: false, room: "999999" });
    expect((await readReport(reportId(p)))!).toMatchObject({
      archived: true,
      room: "123456",
    });
    expect(db.prepare("SELECT count(*) n FROM game_reports").get()?.n).toBe(1);
  });

  it("archives selfies and drawings on a new game; the live party no longer serves them", async () => {
    await storeMedia();
    const p = finishedParty();
    const hostCookie = await signIn(p, "admin", "host");
    const aliceCookie = await signIn(p, "guest", "alice");
    await insertParty(p);
    // Before the wipe, Alice's selfie is served to the game.
    const selfieUrl = `https://party.test/api/avatar?id=${ALICE_SELFIE}`;
    expect(
      (await avatarGET(new Request(selfieUrl, { headers: aliceCookie })))
        .status,
    ).toBe(200);

    const result = await mutateDroppingSelfies((s) =>
      reduce(s, admin, {
        id: crypto.randomUUID(),
        action: "reset",
        confirm: "123456",
      }),
    );
    expect(result.party.players.map((x) => x.id)).toEqual(["host"]);
    expect(result.party.submissions).toEqual({});
    const id = reportId(p);
    for (const media of [
      ALICE_SELFIE,
      BOB_SELFIE,
      ALICE_DRAWING,
      BOB_DRAWING,
    ]) {
      expect(bucket.has(media)).toBe(false);
      expect(bucket.has(archiveKey(id, media))).toBe(true);
    }
    // Question media is never touched.
    expect(bucket.has(SONG)).toBe(true);
    const report = (await readReport(id))!;
    expect(report.archived).toBe(true);
    const media = await reportMedia(report);
    expect(media.get(ALICE_SELFIE)?.dataUri).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(media.get(ALICE_DRAWING)?.strokes).toHaveLength(1);
    const html = renderReportHtml(report, media);
    expect(html).toContain("data:image/jpeg;base64,");
    expect(html).toContain("<path");
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);

    // The host still sees everything; the live routes serve nothing of the old game.
    expect(
      (await avatarGET(new Request(selfieUrl, { headers: hostCookie }))).status,
    ).toBe(404);
    const drawing = await drawingGET(
      new Request(`https://party.test/api/drawing?id=${ALICE_DRAWING}`, {
        headers: hostCookie,
      }),
    );
    expect(drawing.status).toBe(403);
    const page = await reportsGET(
      new Request(`https://party.test/api/reports?id=${id}`, {
        headers: hostCookie,
      }),
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Alice");
    const download = await reportsGET(
      new Request(`https://party.test/api/reports?id=${id}&download=1`, {
        headers: hostCookie,
      }),
    );
    expect(download.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    const list = await reportsGET(
      new Request("https://party.test/api/reports", { headers: hostCookie }),
    );
    expect(await list.json()).toMatchObject([{ id, players: 2, rounds: 3 }]);
  });

  it("keeps a file whose archive copy failed", async () => {
    await storeMedia();
    const p = finishedParty();
    await insertParty(p);
    const r2 = env.BUCKET as {
      put: (key: string, ...rest: unknown[]) => Promise<void>;
    };
    const put = r2.put;
    r2.put = async (key: string, ...rest: unknown[]) => {
      if (key.endsWith(BOB_SELFIE)) throw new Error("disk full");
      return put(key, ...rest);
    };
    await mutateDroppingSelfies((s) =>
      reduce(s, admin, {
        id: crypto.randomUUID(),
        action: "reset",
        confirm: "123456",
      }),
    );
    expect(bucket.has(BOB_SELFIE)).toBe(true);
    expect(bucket.has(ALICE_SELFIE)).toBe(false);
    // The report still shows it, from its live key.
    const report = (await readReport(reportId(p)))!;
    expect((await reportMedia(report)).get(BOB_SELFIE)?.dataUri).toBeTruthy();
  });

  it("writes no report for a game where no round was played", async () => {
    const p = createParty("123456", { admin: "", marlene: "" }, 1000);
    expect(buildReport(p)).toBeNull();
    await insertParty(p);
    await mutateDroppingSelfies((s) =>
      reduce(s, admin, {
        id: crypto.randomUUID(),
        action: "reset",
        confirm: "123456",
      }),
    );
    expect(await listReports()).toEqual([]);
  });

  it("refuses reports to guests, Marlène and the TV", async () => {
    const p = finishedParty();
    p.players.push({
      id: "marlene-vip",
      nickname: "Marlène",
      avatar: 0,
      active: true,
      joinedAt: 1,
      role: "marlene",
    });
    const guestCookie = await signIn(p, "guest", "alice");
    const hostCookie = await signIn(p, "admin", "host");
    await insertParty(p);
    await reportFinished(p);
    const id = reportId(p);
    for (const path of [
      "/api/reports",
      `/api/reports?id=${id}`,
      `/api/reports?id=${id}&download=1`,
    ]) {
      const url = `https://party.test${path}`;
      expect(
        (await reportsGET(new Request(url, { headers: guestCookie }))).status,
      ).toBe(403);
      // The TV (room code, no session) and anyone else.
      expect(
        (
          await reportsGET(
            new Request(`${url}${path.includes("?") ? "&" : "?"}room=123456`),
          )
        ).status,
      ).toBe(401);
      // A guest cookie under the host's name is not a host session.
      expect(
        (
          await reportsGET(
            new Request(url, {
              headers: { cookie: guestCookie.cookie.replace("guest", "admin") },
            }),
          )
        ).status,
      ).toBe(401);
      expect(
        (await reportsGET(new Request(url, { headers: hostCookie }))).status,
      ).toBe(200);
    }
    // Marlène, signed in with her PIN, is refused too.
    const t = crypto.randomUUID();
    await mutate(async (s) => {
      s.sessions[await hash(t)] = {
        role: "marlene",
        playerId: "marlene-vip",
        expires: Date.now() + 60_000,
        marleneProof: await hash(`marlene-pin-v1:${s.vipPin ?? "123456"}`),
      };
      return s;
    });
    const marlene = await reportsGET(
      new Request("https://party.test/api/reports", {
        headers: { cookie: `marlene_marlene=${t}` },
      }),
    );
    expect(marlene.status).toBe(403);
    expect((await readParty())!.party.players).toHaveLength(4);
  });

  it("reports a game stored finished before finish times existed, before its wipe", async () => {
    await storeMedia();
    // As stored by an older release: no finish time, no round log.
    const p = finishedParty();
    delete p.finishedAt;
    delete p.rounds;
    await insertParty(p);
    const id = reportId(p);
    expect(await readReport(id)).toBeNull();

    // The first load after the deploy starts the clean-up clock and writes the report.
    expect(
      (await gameGET(new Request("https://party.test/api/game"))).status,
    ).toBe(200);
    const party = (await readParty())!.party;
    expect(party.finishedAt).toBeGreaterThan(0);
    expect(party.players).toHaveLength(3);
    const early = (await readReport(id))!;
    expect(early.archived).toBe(false);
    expect(early.rounds.map((r) => r.questionId)).toEqual(["q4", "q16", "q17"]);
    expect(early.rounds[0].answers.map((a) => a.points)).toEqual([1, -1]);
    expect(early.leaderboard.map((x) => x.score)).toEqual([6, 6]);
    // Its selfies and drawings are still live, and the report shows them.
    expect((await reportMedia(early)).get(ALICE_SELFIE)?.dataUri).toBeTruthy();

    // An hour later the wipe archives it all.
    await mutateDroppingSelfies((s) =>
      wipeFinished(s, party.finishedAt! + FINISHED_WIPE_MS + 1),
    );
    expect((await readParty())!.party.players).toEqual([]);
    const report = (await readReport(id))!;
    expect(report.archived).toBe(true);
    expect(report.rounds).toHaveLength(3);
    for (const media of [
      ALICE_SELFIE,
      BOB_SELFIE,
      ALICE_DRAWING,
      BOB_DRAWING,
    ]) {
      expect(bucket.has(media)).toBe(false);
      expect(bucket.has(archiveKey(id, media))).toBe(true);
    }
    expect(await listReports()).toHaveLength(1);
  });

  it("shows Marlène's answer as the key, each named photo, and picked or typed songs", () => {
    let p = createParty("123456", { admin: "", marlene: "" }, 1000);
    p.questions = ["q5", "q18", "q6a"].map((id) =>
      p.questions.find((q) => q.id === id)!,
    );
    for (const q of p.questions) q.enabled = true;
    p.questions[2].media = [`/api/media?id=${SONG}`];
    p.players = [
      {
        id: "queen",
        nickname: "Marlène",
        avatar: 0,
        active: true,
        joinedAt: 1,
        role: "marlene",
      },
      { id: "alice", nickname: "Alice", avatar: 1, active: true, joinedAt: 2 },
    ];
    const queen: Actor = { role: "marlene", playerId: "queen" };
    const round = (answers: [Actor, Record<string, unknown>][]) => {
      p = run(p, admin, "open");
      for (const [who, values] of answers) p = run(p, who, "submit", values);
      if (["question_open"].includes(p.phase)) p = run(p, admin, "close");
      if (p.phase === "submissions_closed") p = run(p, admin, "reveal");
      p = run(p, admin, "next");
    };
    round([
      [queen, { value: 168 }],
      [guest("alice"), { value: 170 }],
    ]);
    round([
      [queen, { value: ["Guillaume", "Aloïs", "Valentin", "Renaud"] }],
      [guest("alice"), { value: ["Guillaume", "Renaud", "", ""] }],
    ]);
    round([
      [queen, { value: "noir desir marlene" }],
      [
        guest("alice"),
        {
          value: "Noir Désir — Marlène",
          song: { id: "42", title: "Marlène", artist: "Noir Désir" },
        },
      ],
    ]);
    expect(p.phase).toBe("finished");
    const [height, exes, blind] = buildReport(p)!.rounds;
    expect(height.rightAnswer).toBe("168 cm (réponse de Marlène)");
    expect(height.answers.find((a) => a.playerId === "queen")?.isKey).toBe(
      true,
    );
    expect(height.answers.find((a) => a.playerId === "alice")).toMatchObject({
      text: "170 cm",
      points: 3,
    });
    expect(exes.kind).toBe("match");
    expect(exes.photos).toEqual(["ex-1", "ex-2", "ex-3", "ex-4"]);
    expect(exes.rightAnswer).toBe(
      "ex-1 : Guillaume, ex-2 : Aloïs, ex-3 : Valentin, ex-4 : Renaud",
    );
    expect(exes.answers.find((a) => a.playerId === "alice")?.text).toBe(
      "ex-1 : Guillaume, ex-2 : Renaud",
    );
    expect(blind.rightAnswer).toBe("Noir Désir — Marlène");
    const picked = blind.answers.find((a) => a.playerId === "alice")!;
    expect(picked.song).toEqual({ title: "Marlène", artist: "Noir Désir" });
    expect(picked.correct).toBe(true);
    expect(blind.answers.find((a) => a.playerId === "queen")?.text).toBe(
      "noir desir marlene (écrite)",
    );
    const html = renderReportHtml(buildReport(p)!, new Map());
    expect(html).toContain("la bonne réponse");
    expect(html).toContain("recherche");
  });
});
