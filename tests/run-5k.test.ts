import { describe, it, expect } from "vitest";
import {
  applySuppliedAnswers,
  createParty,
  RUN_ID,
  seedQuestions,
} from "../lib/game/seed";
import { leaderboard, reduce, sliderScore, view } from "../lib/game/engine";
import {
  formatGap,
  formatNumber,
  formatTime,
  parseTime,
} from "../lib/game/time";
import type { Actor, Party, Question } from "../lib/game/types";

const admin: Actor = { role: "admin" },
  star: Actor = { role: "marlene", playerId: "star" },
  guest = (id: string): Actor => ({ role: "guest", playerId: id });
const run = (
  p: Party,
  a: Actor,
  action: string,
  values: Record<string, unknown> = {},
) => reduce(p, a, { id: crypto.randomUUID(), action, ...values }, 2000);
const ids = (p: Party) => p.questions.map((q) => q.id);
const runQuestion = () => seedQuestions.find((q) => q.id === RUN_ID)!;

// A party stored before the change: the screen-time question q9 sits where the 5 km is now.
function legacyParty() {
  const p = createParty("123456", { admin: "x", marlene: "y" });
  const at = ids(p).indexOf(RUN_ID);
  p.questions[at] = {
    ...structuredClone(p.questions[at]),
    id: "q9",
    title: "Quel est le temps d’écran de Marlène ?",
    unit: "minutes / jour",
    note: "Période : moyenne quotidienne des 7 derniers jours. Modifiable avant la manche.",
    confirmed: true,
  };
  delete p.questions[at].slider;
  p.secrets.q9 = { number: 240 };
  return p;
}

describe("best 5 km time", () => {
  it("replaces the screen-time question in the seed", () => {
    expect(seedQuestions.some((q) => q.id === "q9")).toBe(false);
    expect(seedQuestions.some((q) => /temps d’écran/.test(q.title))).toBe(
      false,
    );
    const q = runQuestion();
    expect(q.title).toBe("Quel est le meilleur temps de Marlène sur 5 km ?");
    expect(q.kind).toBe("number");
    expect(q.slider).toEqual({
      min: 900,
      max: 3600,
      step: 15,
      format: "time",
      pointEvery: 60,
    });
    // Between the sleep round and the dream job, where q9 was.
    const order = seedQuestions.map((x) => x.id);
    expect(order.indexOf(RUN_ID)).toBe(order.indexOf("q7") + 1);
    expect(order.indexOf(RUN_ID)).toBe(order.indexOf("q10") - 1);
    // Marlène's in-game answer is the key: no stored key.
    expect(q.keyFromMarlene).toBe(true);
    const p = createParty("123456", { admin: "x", marlene: "y" });
    expect(p.secrets[RUN_ID]).toBeUndefined();
    expect(applySuppliedAnswers(p)).toBe(p);
  });

  it("reads and writes mm:ss", () => {
    expect(formatTime(1650)).toBe("27:30");
    expect(formatTime(900)).toBe("15:00");
    expect(formatTime(3600)).toBe("60:00");
    expect(formatTime(65)).toBe("1:05");
    expect(parseTime("27:30")).toBe(1650);
    expect(parseTime(" 27:05 ")).toBe(1625);
    expect(parseTime("27.30")).toBe(1650);
    expect(parseTime("27,30")).toBe(1650);
    expect(parseTime("27'30")).toBe(1650);
    expect(parseTime("27")).toBe(1620);
    for (const bad of ["", "27:5", "27:60", "abc", "27:30:00", "-5:00"])
      expect(parseTime(bad)).toBeNull();
    expect(formatGap(45)).toBe("45 s");
    expect(formatGap(120)).toBe("2 min");
    expect(formatGap(135)).toBe("2 min 15 s");
    expect(formatNumber(runQuestion(), 1650)).toBe("27:30");
    expect(
      formatNumber(
        seedQuestions.find((q) => q.id === "q5")!,
        168,
      ),
    ).toBe("168 cm");
  });

  it("scores 5 for the exact time, one less per full minute off, below zero", () => {
    const slider = runQuestion().slider!;
    const key = 1650; // 27:30
    expect(sliderScore(slider, "", key, key)).toEqual({
      delta: 5,
      reason: "Pile poil !",
    });
    expect(sliderScore(slider, "", key, key + 59)).toEqual({
      delta: 5,
      reason: "59 s d’écart",
    });
    expect(sliderScore(slider, "", key, key - 60)).toEqual({
      delta: 4,
      reason: "1 min d’écart",
    });
    expect(sliderScore(slider, "", key, key + 120)).toEqual({
      delta: 3,
      reason: "2 min d’écart",
    });
    expect(sliderScore(slider, "", key, key - 135)).toEqual({
      delta: 3,
      reason: "2 min 15 s d’écart",
    });
    // 60:00 is 32 min 30 s off: 5 − 32.
    expect(sliderScore(slider, "", key, 3600)).toEqual({
      delta: -27,
      reason: "32 min 30 s d’écart",
    });
  });

  it("keeps the height at one point per cm", () => {
    const slider = seedQuestions.find((q) => q.id === "q5")!.slider!;
    expect(slider).toEqual({ min: 140, max: 200, step: 1 });
    expect(sliderScore(slider, "cm", 168, 168)).toEqual({
      delta: 5,
      reason: "Pile poil !",
    });
    expect(sliderScore(slider, "cm", 168, 171)).toEqual({
      delta: 2,
      reason: "3 cm d’écart",
    });
    expect(sliderScore(slider, "cm", 168, 200).delta).toBe(-27);
  });

  it("takes Marlène's in-game time as the key, and doesn't score her", () => {
    let p = createParty("123456", { admin: "x", marlene: "y" });
    p.questions = p.questions.filter((q) => q.id === RUN_ID);
    p.players = [
      ...["alice", "bob"].map((id, i) => ({
        id,
        nickname: id,
        avatar: i,
        active: true,
        joinedAt: 1000 + i,
      })),
      {
        id: "star",
        nickname: "Marlène",
        avatar: 2,
        active: true,
        joinedAt: 1002,
        role: "marlene" as const,
      },
    ];
    p = run(p, admin, "open");
    p = run(p, guest("alice"), "submit", { value: 1650 });
    p = run(p, guest("bob"), "submit", { value: 1785 });
    // The round waits for her answer.
    expect(p.phase).toBe("question_open");
    p = run(p, star, "submit", { value: 1650 });
    expect(p.phase).toBe("reveal");
    const score = (id: string) => leaderboard(p).find((x) => x.id === id)!;
    expect(score("alice").score).toBe(5);
    expect(score("bob").score).toBe(3); // 2 min 15 s off
    expect(score("star").score).toBe(0);
    expect(p.events.some((e) => e.playerId === "star")).toBe(false);
    expect(view(p, guest("bob"), 0).answer).toEqual({ number: 1650 });
    expect(view(p, guest("bob"), 0).answerFromMarlene).toBe(true);
    expect(p.secrets[RUN_ID]).toBeUndefined();
  });

  it("falls back on a time the host typed when Marlène doesn't answer", () => {
    let p = createParty("123456", { admin: "x", marlene: "y" });
    p.questions = p.questions.filter((q) => q.id === RUN_ID);
    p.players = ["alice", "bob", "carol"].map((id, i) => ({
      id,
      nickname: id,
      avatar: i,
      active: true,
      joinedAt: 1000 + i,
    }));
    // No key yet: the round can't be marked on its own, like the height.
    p = run(p, admin, "open");
    for (const [id, value] of [
      ["alice", 1650],
      ["bob", 1785],
      ["carol", 900],
    ] as const)
      p = run(p, guest(id), "submit", { value });
    expect(p.phase).toBe("submissions_closed");
    expect(() => run(p, admin, "reveal")).toThrow(/Confirme la bonne réponse/);
    expect(() =>
      run(p, star, "private", { questionId: RUN_ID, number: 1650 }),
    ).toThrow("réservée à l’hôte");
    p = run(p, admin, "private", { questionId: RUN_ID, number: 1650 });
    p = run(p, admin, "reveal");
    const score = (id: string) => leaderboard(p).find((x) => x.id === id)!;
    expect(score("alice")).toMatchObject({ score: 5, correctCount: 1 });
    expect(score("bob").score).toBe(3); // 2 min 15 s off
    expect(score("carol").score).toBe(-7); // 12 min 30 s off
    expect(view(p, guest("bob"), 0).result?.reason).toBe("2 min 15 s d’écart");
  });
});

describe("5 km upgrade for stored parties", () => {
  it("swaps q9 for the 5 km question in the same slot, once", () => {
    const stored = legacyParty();
    const at = ids(stored).indexOf("q9");
    const p = applySuppliedAnswers(stored);
    expect(ids(p)).not.toContain("q9");
    expect(ids(p).indexOf(RUN_ID)).toBe(at);
    expect(p.questions[at]).toEqual(runQuestion());
    expect(p.secrets.q9).toBeUndefined();
    expect(p.secrets[RUN_ID]).toBeUndefined();
    // The stored party itself is untouched, and a second pass changes nothing.
    expect(ids(stored)).toContain("q9");
    expect(applySuppliedAnswers(p)).toBe(p);
  });

  it("keeps the queued round queued", () => {
    const stored = legacyParty();
    stored.index = ids(stored).indexOf("q9");
    stored.phase = "next_round";
    const p = applySuppliedAnswers(stored);
    expect(p.phase).toBe("next_round");
    expect(p.questions[p.index].id).toBe(RUN_ID);
    const later = legacyParty();
    later.index = ids(later).indexOf("q7");
    later.phase = "reveal";
    const q = applySuppliedAnswers(later);
    expect(q.questions[q.index].id).toBe("q7");
    expect(ids(q)).toContain(RUN_ID);
  });

  it("leaves q9 alone once it was reached or scored in this generation", () => {
    const playing = legacyParty();
    playing.index = ids(playing).indexOf("q9");
    playing.phase = "question_open";
    expect(applySuppliedAnswers(playing)).toBe(playing);
    const passed = legacyParty();
    passed.index = ids(passed).indexOf("q10");
    passed.phase = "leaderboard";
    expect(applySuppliedAnswers(passed)).toBe(passed);
    const scored = legacyParty();
    scored.events.push({
      id: "e1",
      roundId: "r1",
      questionId: "q9",
      playerId: "alice",
      delta: 1,
      correct: true,
      elapsed: 1000,
      reason: "",
      at: 1000,
      adjustment: false,
      generation: scored.generation,
    });
    expect(applySuppliedAnswers(scored)).toBe(scored);
    // After a reset, that score belongs to an older generation: the swap happens.
    const reset = structuredClone(scored);
    reset.generation++;
    const p = applySuppliedAnswers(reset);
    expect(ids(p)).not.toContain("q9");
    expect(ids(p)).toContain(RUN_ID);
    expect(p.events).toHaveLength(1);
  });

  it("adds the question after the sleep round when q9 is gone, but only once", () => {
    const stored = legacyParty();
    stored.questions = stored.questions.filter((q) => q.id !== "q9");
    delete stored.secrets.q9;
    stored.index = ids(stored).indexOf("q10");
    stored.phase = "leaderboard";
    const p = applySuppliedAnswers(stored);
    expect(ids(p).indexOf(RUN_ID)).toBe(ids(p).indexOf("q7") + 1);
    // The index moved with the round it pointed at.
    expect(p.questions[p.index].id).toBe("q10");
    expect(applySuppliedAnswers(p)).toBe(p);
    // A host who deletes it afterwards doesn't get it back.
    const deleted = structuredClone(p);
    deleted.questions = deleted.questions.filter((q) => q.id !== RUN_ID);
    expect(applySuppliedAnswers(deleted)).toBe(deleted);
  });

  it("keeps a host-edited 5 km question as is", () => {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    const target = p.questions.find((q: Question) => q.id === RUN_ID)!;
    target.title = "Ton chrono sur 5 km ?";
    expect(applySuppliedAnswers(p)).toBe(p);
  });
});
