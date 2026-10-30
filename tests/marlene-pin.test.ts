import { describe, expect, it } from "vitest";
import "./cloudflare-env";
import { actor, hash, requireMarlenePin } from "../lib/game/auth";
import { applySuppliedAnswers, createParty } from "../lib/game/seed";
import { leaderboard, reduce, view } from "../lib/game/engine";
import { isMarleneName, isPin, MARLENE_PIN } from "../lib/game/vip";
import type { Actor, Party, Question } from "../lib/game/types";

const admin: Actor = { role: "admin", playerId: "host" },
  star: Actor = { role: "marlene", playerId: "star" },
  guest: Actor = { role: "guest", playerId: "alice" };
const run = (p: Party, a: Actor, action: string, values = {}) =>
  reduce(p, a, { id: crypto.randomUUID(), action, ...values }, 2000);

// A party as stored before this change: the VIP code lived in the bonus question q8.
function legacyParty(pin = "123456") {
  const p = createParty("123456", { admin: "", marlene: "" }, 1000);
  delete p.vipPin;
  const q8: Question = {
    ...structuredClone(p.questions[0]),
    id: "q8",
    source: 8,
    title: "Quel est le code PIN de Marlène ?",
    kind: "pin",
    options: [],
    generated: [],
    confirmed: true,
    enabled: true,
  };
  p.questions.splice(
    p.questions.findIndex((q) => q.id === "q9"),
    0,
    q8,
  );
  p.secrets.q8 = { text: pin };
  p.questionPresetVersions!.q8 = "vip-pin-2026-10-29-v1";
  return p;
}
const ids = (p: Party) => p.questions.map((q) => q.id);

describe("4-digit PIN", () => {
  it("accepts exactly four digits", () => {
    expect(MARLENE_PIN).toBe("1234");
    expect(isPin("1234")).toBe(true);
    expect(isPin("0000")).toBe(true);
    for (const bad of [
      "123456",
      "123",
      "12a4",
      " 1234",
      "１２３４",
      1234,
      null,
    ])
      expect(isPin(bad)).toBe(false);
  });
  it("signs Marlène in with 1234 by default, and only with her code", async () => {
    expect(await requireMarlenePin("1234")).toBe(
      await hash("marlene-pin-v1:1234"),
    );
    for (const wrong of ["123456", "4321", "", undefined, 1234])
      await expect(requireMarlenePin(wrong)).rejects.toThrow(
        "Code PIN incorrect",
      );
    await expect(requireMarlenePin("1234", "8246")).rejects.toThrow();
    expect(await requireMarlenePin("8246", "8246")).toBeTruthy();
    // A stored 6-digit code can never be satisfied any more.
    await expect(requireMarlenePin("123456", "123456")).rejects.toThrow();
  });
  it("new parties carry the VIP code outside the questions, and no PIN question", () => {
    const p = createParty("123456", { admin: "", marlene: "" });
    expect(p.vipPin).toBe("1234");
    expect(p.secrets.q8).toBeUndefined();
    expect(p.questions.some((q) => q.kind === "pin")).toBe(false);
  });
  it("lets only the host change the VIP code, to four digits", () => {
    let p = createParty("123456", { admin: "", marlene: "" });
    expect(() => run(p, guest, "vipPin", { pin: "4321" })).toThrow("réservée");
    expect(() => run(p, star, "vipPin", { pin: "4321" })).toThrow("réservée");
    expect(() => run(p, admin, "vipPin", { pin: "123456" })).toThrow(
      "4 chiffres",
    );
    p = run(p, admin, "vipPin", { pin: "4321" });
    expect(p.vipPin).toBe("4321");
  });
  it("never puts the VIP code in any view", () => {
    let p = createParty("123456", { admin: "", marlene: "" });
    p = run(p, admin, "vipPin", { pin: "9753" });
    for (const a of [admin, star, guest, { role: "present" } as Actor, null])
      expect(JSON.stringify(view(p, a, 1))).not.toContain("9753");
  });
  it("a host-made Code mystère round takes 4 digits", () => {
    let p = createParty("123456", { admin: "", marlene: "" });
    p.questions = p.questions.filter((q) => q.id === "q3");
    p.players = [
      { id: "alice", nickname: "Alice", avatar: 0, active: true, joinedAt: 1 },
    ];
    p = run(p, admin, "edit", { questionId: "q3", patch: { kind: "pin" } });
    expect(() =>
      run(p, admin, "private", { questionId: "q3", text: "824613" }),
    ).toThrow("4 chiffres");
    p = run(p, admin, "private", { questionId: "q3", text: "8246" });
    p = run(p, admin, "open");
    expect(() => run(p, guest, "submit", { value: "824613" })).toThrow(
      "4 chiffres",
    );
    p = run(p, guest, "submit", { value: "8246" });
    expect(p.submissions[p.roundId][0].correct).toBe(true);
  });
});

describe("upgrading a stored party", () => {
  it("moves the old default 123456 to 1234 and removes q8", async () => {
    const stored = legacyParty("123456");
    const p = applySuppliedAnswers(stored);
    expect(p.vipPin).toBe("1234");
    expect(ids(p)).not.toContain("q8");
    expect(p.secrets.q8).toBeUndefined();
    expect(p.questionPresetVersions?.q8).toBeUndefined();
    expect(applySuppliedAnswers(p)).toBe(p);
    // The stored copy is not mutated.
    expect(stored.vipPin).toBeUndefined();
    expect(ids(stored)).toContain("q8");
    await expect(requireMarlenePin("1234", p.vipPin)).resolves.toBeTruthy();
  });
  it("replaces any 6-digit code the host had chosen, since the pad has 4 keys", () => {
    expect(applySuppliedAnswers(legacyParty("824613")).vipPin).toBe("1234");
  });
  it("keeps a code that is already 4 digits", () => {
    expect(applySuppliedAnswers(legacyParty("8246")).vipPin).toBe("8246");
  });
  it("signs out a session proven with the old 6-digit code", async () => {
    const stored = legacyParty("123456");
    stored.players.push({
      id: "star",
      nickname: "Marlène",
      avatar: 0,
      active: true,
      joinedAt: 1,
      role: "marlene",
    });
    stored.sessions[await hash("token")] = {
      role: "marlene",
      playerId: "star",
      expires: Date.now() + 60000,
      marleneProof: await hash("marlene-pin-v1:123456"),
    };
    const req = new Request("https://party.test", {
      headers: { cookie: "marlene_marlene=token" },
    });
    expect(await actor(req, applySuppliedAnswers(stored), "marlene")).toBe(
      null,
    );
  });
  it("keeps points already won on q8", () => {
    const stored = legacyParty();
    stored.players.push({
      id: "alice",
      nickname: "Alice",
      avatar: 0,
      active: true,
      joinedAt: 1,
    });
    stored.events.push({
      id: "1-r:alice",
      roundId: "1-r",
      questionId: "q8",
      playerId: "alice",
      delta: 5,
      correct: true,
      elapsed: 1000,
      reason: "Bonne réponse",
      at: 1500,
      adjustment: false,
      generation: stored.generation,
    });
    const p = applySuppliedAnswers(stored);
    expect(p.events).toEqual(stored.events);
    expect(leaderboard(p)[0].score).toBe(5);
  });
  it("leaves q8 alone while it is being played, then removes it", () => {
    const stored = legacyParty();
    stored.index = ids(stored).indexOf("q8");
    stored.phase = "question_open";
    const during = applySuppliedAnswers(stored);
    expect(ids(during)).toContain("q8");
    expect(during.vipPin).toBe("1234");
    expect(applySuppliedAnswers(during)).toBe(during);
    const after = applySuppliedAnswers({ ...during, phase: "leaderboard" });
    expect(ids(after)).toContain("q8");
    const next = applySuppliedAnswers({ ...during, phase: "finished" });
    expect(ids(next)).not.toContain("q8");
    expect(next.questions[next.index].id).toBe("q7");
  });
  it("keeps the current question in place when q8 is removed", () => {
    const stored = legacyParty();
    stored.index = ids(stored).indexOf("q10");
    stored.phase = "reveal";
    const p = applySuppliedAnswers(stored);
    expect(ids(p)).not.toContain("q8");
    expect(p.questions[p.index].id).toBe("q10");
  });
  it("queues the following round when q8 was up next", () => {
    const stored = legacyParty();
    stored.index = ids(stored).indexOf("q8");
    stored.phase = "next_round";
    const p = applySuppliedAnswers(stored);
    expect(ids(p)).not.toContain("q8");
    expect(p.phase).toBe("next_round");
    expect(p.questions[p.index].id).toBe("q9");
  });
});

describe("Marlène's name", () => {
  it("is recognised in every spelling", () => {
    for (const name of [
      "Marlène",
      "Marlene",
      "marlene",
      "marlène",
      "MARLENE",
      "MARLÈNE",
      "  Marlène  ",
      "marlène ",
      "Mar lène",
      "Marlène",
      "Marlène !",
      "Marlène 🎂",
      "Mar​lène",
      "Ｍａｒｌèｎｅ",
    ])
      expect(isMarleneName(name), name).toBe(true);
  });
  it("does not catch other names", () => {
    for (const name of [
      "Marlène (invité)",
      "Marlène Dupont",
      "Marla",
      "Marine",
      "Arlene",
      "",
    ])
      expect(isMarleneName(name), name).toBe(false);
  });
  it("is reserved for her: a guest or the host can't join under it", () => {
    const p = createParty("123456", { admin: "", marlene: "" });
    for (const nickname of ["marlene", "MARLÈNE ", "Marlène !"]) {
      expect(() => run(p, guest, "join", { nickname })).toThrow(
        "réservé à Marlène",
      );
      expect(() => run(p, admin, "join", { nickname })).toThrow(
        "réservé à Marlène",
      );
    }
    expect(
      run(p, star, "join", { nickname: "Marlène" }).players[0].nickname,
    ).toBe("Marlène");
  });
});
