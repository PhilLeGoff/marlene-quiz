import { describe, it, expect } from "vitest";
import {
  applySuppliedAnswers,
  createParty,
  seedQuestions,
} from "../lib/game/seed";
import {
  correct,
  leaderboard,
  normalize,
  reduce,
  setPhoto,
  validateStrokes,
  view,
} from "../lib/game/engine";
import type { Actor, Command, Party, Stroke } from "../lib/game/types";
import { isMultiSelect, showsSelfieStep } from "../lib/game/types";
const admin: Actor = { role: "admin" },
  star: Actor = { role: "marlene" },
  guest = (id = "alice"): Actor => ({ role: "guest", playerId: id });
const command = (
  action: string,
  values: Record<string, unknown> = {},
): Command => ({ id: crypto.randomUUID(), action, ...values });
function party(id = "q3") {
  const p = createParty("123456", { admin: "hash", marlene: "hash" }, 1000);
  p.questions = p.questions.filter((q) => q.id === id);
  p.players = [
    { id: "alice", nickname: "Alice", avatar: 0, active: true, joinedAt: 1000 },
    { id: "bob", nickname: "Bob", avatar: 1, active: true, joinedAt: 1001 },
  ];
  return p;
}
const run = (
  p: Party,
  a: Actor,
  action: string,
  values: Record<string, unknown> = {},
  now = 2000,
) => reduce(p, a, command(action, values), now);
function opened(id = "q3") {
  let p = party(id);
  if (id === "q3")
    p = run(p, admin, "private", {
      questionId: id,
      answers: ["Elle a fait pipi"],
    });
  if (id === "q16")
    p = run(p, admin, "private", {
      questionId: id,
      text: "Éléphant rose",
      aliases: ["Un éléphant rose"],
    });
  return run(p, admin, "open");
}
// A host-made "Code mystère" round with the fictional code 824613.
function pinParty() {
  let p = party("q3");
  p = run(p, admin, "edit", { questionId: "q3", patch: { kind: "pin" } });
  return run(p, admin, "private", { questionId: "q3", text: "824613" });
}
const stroke: Stroke = {
  id: "test-stroke",
  color: "#392938",
  size: 8,
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.7 },
  ],
};
describe("seed bank", () => {
  it("keeps supplied order and splits the blind test into three rounds", () => {
    // q8 (Marlène's PIN as a bonus question) was removed: the joke is in her login.
    expect(seedQuestions).toHaveLength(18);
    expect(seedQuestions.map((q) => q.source)).toEqual([
      1, 2, 3, 4, 5, 6, 6, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });
  it("never guesses unknown personal keys", () => {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    const supplied = [
      "q1",
      "q2",
      "q3",
      "q4",
      "q6a",
      "q6b",
      "q6c",
      "q7",
      "q10",
      "q13",
    ];
    expect(Object.keys(p.secrets).sort()).toEqual([...supplied].sort());
    expect(seedQuestions.filter((q) => q.confirmed).map((q) => q.id)).toEqual(
      supplied,
    );
  });
  it("answers the height with a slider, also in parties created before it", () => {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    const height = (x: Party) => x.questions.find((q) => q.id === "q5")!;
    expect(height(p).slider).toEqual({ min: 140, max: 200, step: 1 });
    expect(p.questions.find((q) => q.id === "q9")!.slider).toBeUndefined();
    delete height(p).slider;
    const upgraded = applySuppliedAnswers(p);
    expect(height(upgraded).slider).toEqual({ min: 140, max: 200, step: 1 });
    expect(height(p).slider).toBeUndefined();
    expect(applySuppliedAnswers(upgraded)).toBe(upgraded);
  });
  it("asks the sleep question as a single choice with socks as the key", () => {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    const sleep = p.questions.find((q) => q.id === "q7")!;
    expect(sleep.title).toBe(
      "Quel est l’élément incontournable de Marlène pour aller dormir ?",
    );
    expect(sleep.kind).toBe("choice");
    expect(isMultiSelect(sleep.kind)).toBe(false);
    expect(sleep.options).toEqual(
      expect.arrayContaining([
        "Des chaussettes",
        "Son doudou",
        "Un verre d’eau",
      ]),
    );
    expect(p.secrets.q7).toEqual({ answers: ["Des chaussettes"] });
  });
  it("swaps the old pyjama round for the sleep question in stored parties", () => {
    // A party seeded before the change: old q7, preset already marked as applied.
    const legacy = () => {
      const p = createParty("123456", { admin: "x", marlene: "y" });
      Object.assign(
        p.questions.find((q) => q.id === "q7")!,
        {
          title: "Comment dort Marlène ?",
          kind: "outfit",
          options: [
            "Chaussettes",
            "Pyjama intégral",
            "T-shirt",
            "Bonnet de nuit",
            "Short",
          ],
          generated: ["Pyjama intégral", "Bonnet de nuit"],
          note: "Bonne combinaison fournie : chaussettes + short + t-shirt.",
          duration: 90,
        },
      );
      p.secrets.q7 = { answers: ["Chaussettes", "T-shirt", "Short"] };
      return p;
    };
    const sleep = (x: Party) => x.questions.find((q) => q.id === "q7")!;
    const seeded = seedQuestions.find((q) => q.id === "q7")!;

    const stored = legacy();
    const upgraded = applySuppliedAnswers(stored);
    expect(sleep(upgraded)).toMatchObject({
      title: seeded.title,
      kind: "choice",
      options: seeded.options,
      generated: seeded.generated,
      note: seeded.note,
      confirmed: true,
      duration: 90, // the host's other settings stay
    });
    expect(upgraded.secrets.q7).toEqual({ answers: ["Des chaussettes"] });
    expect(sleep(stored).title).toBe("Comment dort Marlène ?");
    expect(applySuppliedAnswers(upgraded)).toBe(upgraded);

    // Queued as the next round but not opened yet: still swapped.
    const queued = legacy();
    queued.phase = "next_round";
    queued.index = queued.questions.findIndex((q) => q.id === "q7");
    expect(sleep(applySuppliedAnswers(queued)).kind).toBe("choice");

    // The host renamed it: theirs now, left alone.
    const renamed = legacy();
    sleep(renamed).title = "Comment dort Marlène, vraiment ?";
    expect(applySuppliedAnswers(renamed)).toBe(renamed);

    // Open, already played, or scored: left alone.
    const open = legacy();
    open.phase = "question_open";
    open.index = open.questions.findIndex((q) => q.id === "q7");
    expect(sleep(applySuppliedAnswers(open)).kind).toBe("outfit");
    const past = legacy();
    past.phase = "next_round";
    past.index = past.questions.findIndex((q) => q.id === "q7") + 1;
    expect(sleep(applySuppliedAnswers(past)).kind).toBe("outfit");
    const scored = legacy();
    scored.events.push({
      id: "e1",
      roundId: "r1",
      questionId: "q7",
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
    // Played before a reset: the old score stays in the history but no longer blocks it.
    const rehearsed = structuredClone(scored);
    rehearsed.generation++;
    expect(sleep(applySuppliedAnswers(rehearsed)).kind).toBe("choice");
  });
  it("retains seven choices and leaves the optional rounds off", () => {
    expect(seedQuestions.find((q) => q.id === "q4")?.options).toHaveLength(7);
    expect(seedQuestions.find((q) => q.id === "q10")?.options).toHaveLength(7);
    for (const id of ["q11", "q12"])
      expect(seedQuestions.find((q) => q.id === id)?.enabled).toBe(false);
  });
});
describe("scoring and normalization", () => {
  it("revokes score and tie-break credit for a moderated correct answer", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    p = run(p, admin, "close");
    const sub = p.submissions[p.roundId][0];
    p = run(p, admin, "moderate", { submissionId: sub.id });
    const result = leaderboard(p).find((x) => x.id === "alice")!;
    expect(result.score).toBe(0);
    expect(result.correctCount).toBe(0);
    expect(result.correctTime).toBe(0);
    expect(p.events).toHaveLength(2);
  });
  it("normalizes accents, punctuation, spaces and casing", () =>
    expect(normalize(" ÉLÉPHANT — rose !!! ")).toBe("elephantrose"));
  it("requires the exact set for multi select", () => {
    const q = seedQuestions[0];
    q.confirmed = true;
    expect(
      correct(q, { answers: ["Philippe", "Simone"] }, ["Simone", "Philippe"]),
    ).toBe(true);
    expect(correct(q, { answers: ["Philippe", "Simone"] }, ["Simone"])).toBe(
      false,
    );
    q.confirmed = false;
  });
  it("scores the height slider 5 for exact, one less per cm off, below zero", () => {
    let p = run(party("q5"), admin, "private", {
      questionId: "q5",
      number: 168,
    });
    p.players.push({
      id: "carol",
      nickname: "Carol",
      avatar: 2,
      active: true,
      joinedAt: 1002,
    });
    p = run(p, admin, "open");
    p = run(p, guest(), "submit", { value: 168 });
    p = run(p, guest("bob"), "submit", { value: 171 });
    p = run(p, guest("carol"), "submit", { value: 200 });
    // Every guest has answered, so the round has already closed and been scored.
    expect(p.phase).toBe("reveal");
    const score = (id: string) => leaderboard(p).find((x) => x.id === id)!;
    expect(score("alice")).toMatchObject({ score: 5, correctCount: 1 });
    expect(score("bob")).toMatchObject({ score: 2, correctCount: 0 });
    expect(score("carol").score).toBe(-27);
    expect(view(p, guest("bob"), 0).result?.reason).toBe("3 cm d’écart");
  });
  it("scores multi select per ticked option, +1 right and −1 wrong", () => {
    let p = run(party(), admin, "private", {
      questionId: "q3",
      answers: ["Elle a fait pipi", "Elle a sauté du balcon en culotte"],
    });
    p = run(p, admin, "open");
    p = run(p, guest(), "submit", {
      value: [
        "Elle a fait pipi",
        "Elle a vomi sur le tapis",
        "Elle a dormi toute la nuit dehors",
      ],
    });
    p = run(p, guest("bob"), "submit", {
      value: ["Elle a fait pipi", "Elle a sauté du balcon en culotte"],
    });
    // Every guest has answered, so the round has already closed and been scored.
    expect(p.phase).toBe("reveal");
    const [alice, bob] = ["alice", "bob"].map((id) =>
      leaderboard(p).find((x) => x.id === id)!,
    );
    expect(alice.score).toBe(-1);
    expect(alice.correctCount).toBe(0);
    expect(bob.score).toBe(2);
    expect(bob.correctCount).toBe(1);
    expect(view(p, guest(), 0).result).toMatchObject({
      delta: -1,
      reason: "1 bonne réponse, 2 mauvaises réponses",
    });
  });
  it("supports numeric exact and tolerance", () => {
    const q = { ...seedQuestions[4], confirmed: true, tolerance: 2 };
    expect(correct(q, { number: 168 }, 170)).toBe(true);
    expect(correct(q, { number: 168 }, 171)).toBe(false);
    expect(correct({ ...q, tolerance: 0 }, { number: 168 }, 168)).toBe(true);
  });
  it("scores +1 and -1, with zero for no answer and negative totals", () => {
    let p = opened();
    p = run(p, guest(), "submit", {
      value: ["Elle a dormi toute la nuit dehors"],
    });
    p = run(p, admin, "close");
    expect(leaderboard(p).find((p) => p.id === "alice")?.score).toBe(-1);
    expect(leaderboard(p).find((p) => p.id === "bob")?.score).toBe(0);
  });
  it("scores the correct answer exactly once even with an idempotent retry", () => {
    let p = opened();
    const cmd = command("submit", { value: ["Elle a fait pipi"] });
    p = reduce(p, guest(), cmd, 2100);
    p = reduce(p, guest(), cmd, 2200);
    expect(p.submissions[p.roundId]).toHaveLength(1);
    const close = command("close");
    p = reduce(p, admin, close);
    p = reduce(p, admin, close);
    expect(p.events).toHaveLength(1);
    expect(p.events[0].delta).toBe(1);
  });
  it("breaks ties by correct count then cumulative response time; otherwise shares rank", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] }, 2100);
    p = run(p, guest("bob"), "submit", { value: ["Elle a fait pipi"] }, 2200);
    expect(leaderboard(p)[0].id).toBe("alice");
    p.events[1].elapsed = 100;
    expect(leaderboard(p).map((x) => x.rank)).toEqual([1, 1]);
  });
  it("leaves ambiguous answers for manual validation", () => {
    let p = opened("q14");
    p = run(p, admin, "private", { questionId: "q14", text: "Un voyage" });
    p = run(p, guest(), "submit", { value: "Voyager" });
    p = run(p, admin, "close");
    p = run(p, admin, "reveal");
    expect(p.events).toHaveLength(0);
    const sub = p.submissions[p.roundId][0];
    p = run(p, admin, "grade", { submissionId: sub.id, correct: true });
    expect(p.events[0].delta).toBe(1);
    expect(() =>
      run(p, admin, "grade", { submissionId: sub.id, correct: true }),
    ).toThrow("déjà été notée");
  });
});
describe("authorization and hidden answers", () => {
  it("reserves names across every role, ignoring accents, casing and extra spaces", () => {
    let p = createParty("123456", { admin: "", marlene: "" }, 1000);
    p = run(p, { role: "admin", playerId: "host" }, "join", {
      nickname: "  Élodie  Martin ",
    });
    expect(() =>
      run(p, guest(), "join", { nickname: "elodie   MARTIN" }),
    ).toThrow("déjà pris");
    p = run(p, { role: "marlene", playerId: "star" }, "join", {
      nickname: "Marlène",
    });
    expect(() => run(p, guest(), "join", { nickname: "marlene" })).toThrow(
      "réservé à Marlène",
    );
    // Marlène plays and is ranked; the host isn't.
    expect(leaderboard(p).map((x) => x.id)).toEqual(["star"]);
    p = run(p, guest(), "join", { nickname: "A" });
    expect(leaderboard(p)).toHaveLength(2);
  });
  it("lets the same identity reconnect without duplicate participation", () => {
    let p = createParty("123456", { admin: "", marlene: "" }, 1000);
    p = run(p, guest(), "join", { nickname: "Alice" });
    p = run(p, guest(), "join", { nickname: "ALICE" });
    expect(p.players).toHaveLength(1);
  });

  it("erases the private key when its question is deleted", () => {
    let p = createParty("123456", { admin: "hash", marlene: "hash" }, 1000);
    p = run(p, admin, "private", { questionId: "q11", number: 42 });
    p = run(p, admin, "delete", { questionId: "q11" });
    expect(p.secrets.q11).toBeUndefined();
    expect(p.questions.some((q) => q.id === "q11")).toBe(false);
  });

  it.each([
    "open",
    "close",
    "reveal",
    "next",
    "edit",
    "adjust",
    "reset",
    "grade",
  ])("denies guest command %s", (action) =>
    expect(() => run(opened(), guest(), action)).toThrow("réservée"),
  );
  it("does not let Marlène override the host", () =>
    expect(() => run(opened(), star, "reveal")).toThrow("réservée"));
  it.each(["guest", "present"] as const)(
    "never leaks secret keys to %s before reveal",
    (role) => {
      const p = opened("q16");
      const v = view(
        p,
        { role, playerId: role === "guest" ? "alice" : undefined },
        1,
      );
      expect(JSON.stringify(v)).not.toContain("Éléphant rose");
      expect(v).not.toHaveProperty("secrets");
      expect(v).not.toHaveProperty("questions");
      expect(v).not.toHaveProperty("sessions");
    },
  );
  it("rejects reveal before close and refuses unconfirmed keys", () => {
    // The height has no key until Marlène enters it.
    const p = run(party("q5"), admin, "open");
    expect(() => run(p, admin, "reveal")).toThrow("Ferme");
    expect(() => run(run(p, admin, "close"), admin, "reveal")).toThrow(
      "Confirme",
    );
  });
  it("reveals a confirmed answer at the right phase only", () => {
    let p = opened();
    expect(view(p, guest(), 1).answer).toBeUndefined();
    p = run(p, admin, "close");
    expect(view(p, guest(), 1).answer?.answers).toEqual(["Elle a fait pipi"]);
  });
  it("requires explicit host permission for star-triggered reveal", () => {
    let p = opened("q14");
    p.players.push({
      id: "star",
      nickname: "Marlène",
      avatar: 2,
      active: true,
      joinedAt: 1002,
      role: "marlene",
    });
    // Her in-game answer is the key she reveals.
    p = run(p, { ...star, playerId: "star" }, "submit", { value: "Un voyage" });
    p = run(p, admin, "close");
    expect(() => run(p, star, "starReveal")).toThrow("autoriser");
    p = run(p, admin, "allowReveal", { allowed: true });
    expect(run(p, star, "starReveal").phase).toBe("reveal");
  });
});
describe("submissions, timers, drawing and winner races", () => {
  it("closes, reveals and scores the round once every guest has answered", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    expect(p.phase).toBe("question_open");
    expect(p.events).toHaveLength(0);
    p = run(p, guest("bob"), "submit", { value: ["Elle a vomi sur le tapis"] });
    expect(p.phase).toBe("reveal");
    expect(p.deadline).toBe(0);
    expect(leaderboard(p).map((x) => [x.id, x.score])).toEqual([
      ["alice", 1],
      ["bob", -1],
    ]);
    expect(() => run(p, admin, "close")).toThrow("Aucune manche");
  });
  it("waits for the host when the server can't mark the round itself", () => {
    // No answer key yet: everyone answered, but the host confirms it before the reveal.
    let p = run(party("q5"), admin, "open");
    p = run(p, guest(), "submit", { value: 165 });
    p = run(p, guest("bob"), "submit", { value: 172 });
    expect(p.phase).toBe("submissions_closed");
    expect(p.events).toHaveLength(0);
    p = run(p, admin, "private", { questionId: "q5", number: 168 });
    p = run(p, admin, "reveal");
    expect(p.events).toHaveLength(2);
    // Free-text guesses at Marlène's answer are validated by the host.
    p = opened("q14");
    p = run(p, admin, "private", { questionId: "q14", text: "Un voyage" });
    p = run(p, guest(), "submit", { value: "Voyager" });
    p = run(p, guest("bob"), "submit", { value: "Une maison" });
    expect(p.phase).toBe("submissions_closed");
  });
  it("keeps several-try rounds open after everyone's first answer", () => {
    let p = pinParty();
    p = run(p, admin, "open");
    p = run(p, guest(), "submit", { value: "111111" });
    p = run(p, guest("bob"), "submit", { value: "222222" });
    expect(p.phase).toBe("question_open");
  });
  it("rejects duplicate and expired submissions", () => {
    const p = run(opened(), guest(), "submit", { value: ["Elle a fait pipi"] });
    expect(() =>
      run(p, guest(), "submit", { value: ["Elle a fait pipi"] }),
    ).toThrow("déjà enregistrée");
    expect(() =>
      run(opened(), guest(), "submit", { value: ["Elle a fait pipi"] }, 100000),
    ).toThrow("écoulé");
  });
  it("awards only the first server-verified Pictionary guess", () => {
    let p = opened("q16");
    p = run(p, guest(), "submit", { value: "elephant ROSE" }, 2100);
    expect(p.phase).toBe("pictionary_winner");
    expect(p.events[0].delta).toBe(5);
    expect(() =>
      run(p, guest("bob"), "submit", { value: "Éléphant rose" }, 2101),
    ).toThrow("fermées");
    expect(p.events).toHaveLength(1);
  });
  it("keeps the drawing gallery anonymous and allows one final +5 vote", () => {
    let p = party("q17");
    p = run(p, admin, "private", {
      questionId: "q17",
      prompt: "Un chat en soirée",
    });
    p = run(p, admin, "open");
    p = run(p, guest(), "submit", { value: [stroke] });
    p = run(p, admin, "close");
    p = run(p, admin, "reveal");
    const v = view(p, star, 1);
    expect(v.gallery[0]).not.toHaveProperty("artist");
    expect(v.gallery[0]).not.toHaveProperty("playerId");
    const id = v.gallery[0].id;
    p = run(p, star, "vote", { submissionId: id });
    expect(p.events[0].delta).toBe(5);
    expect(view(p, guest(), 1).gallery[0].artist).toBe("Alice");
    expect(() => run(p, star, "vote", { submissionId: id })).toThrow();
  });
  it("validates vector bounds and rejects oversized/injected strokes", () => {
    expect(validateStrokes([stroke])).toHaveLength(1);
    expect(() =>
      validateStrokes([{ ...stroke, color: "url(evil)" }]),
    ).toThrow();
    expect(() =>
      validateStrokes([{ ...stroke, points: [{ x: 2, y: 0 }] }]),
    ).toThrow();
  });
  it("plays the body count as a normal round the host turns on, or skips", () => {
    let p = party("q11");
    expect(p.questions[0].enabled).toBe(false);
    expect(() => run(p, admin, "open")).toThrow("Active au moins");
    // No consent step: the host switches it on and can type the key too.
    expect(() => run(p, star, "consent")).toThrow("Action inconnue");
    expect(() => run(p, star, "withdraw")).toThrow("Action inconnue");
    p = run(p, admin, "edit", { questionId: "q11", patch: { enabled: true } });
    p = run(p, admin, "private", { questionId: "q11", text: "3" });
    p = run(p, admin, "open");
    expect(view(p, guest(), 1).question?.note).toBe("");
    p = run(p, guest(), "submit", { value: "3" });
    p = run(p, guest("bob"), "submit", { value: "12" });
    p = run(p, admin, "reveal");
    expect(view(p, guest(), 1).answer?.text).toBe("3");
    // Moving on keeps its key, like any other round.
    p = run(p, admin, "next");
    expect(p.secrets.q11.text).toBe("3");
    // Skipped from the admin: switched off, it is never opened.
    p = party("q3");
    p.questions.push(
      structuredClone(seedQuestions.find((q) => q.id === "q11")!),
    );
    p = run(p, admin, "open");
    p = run(p, admin, "close");
    expect(run(p, admin, "next").phase).toBe("finished");
  });
  it("swaps the body count's old consent note in stored parties", () => {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    const q11 = p.questions.find((q) => q.id === "q11")!;
    const fresh = q11.note;
    q11.note =
      "Facultatif et privé. Consentement explicite de Marlène requis. Retrait et passage sans pénalité.";
    const upgraded = applySuppliedAnswers(p);
    expect(upgraded.questions.find((q) => q.id === "q11")!.note).toBe(fresh);
    expect(applySuppliedAnswers(upgraded)).toBe(upgraded);
  });
  it("limits PIN attempts and uses a fictional secret", () => {
    let p = run(pinParty(), admin, "open");
    for (let i = 0; i < 3; i++)
      p = run(p, guest(), "submit", { value: "111111" });
    expect(() => run(p, guest(), "submit", { value: "824613" })).toThrow(
      "tentatives",
    );
  });
  it("preserves immutable score history when resetting and excludes previous generations", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    p = run(p, admin, "close");
    p = run(p, admin, "reset", { confirm: "123456" });
    expect(p.events).toHaveLength(1);
    expect(leaderboard(p)[0].score).toBe(0);
    expect(p.phase).toBe("lobby");
  });
  it("completes the full state sequence", () => {
    let p = opened();
    p = run(p, admin, "close");
    p = run(p, admin, "leaderboard");
    p = run(p, admin, "next");
    expect(p.phase).toBe("finished");
  });
});
describe("Marlène plays like a guest", () => {
  const me: Actor = { role: "marlene", playerId: "star" };
  // The usual two guests, with Marlène signed in from her own screen.
  function withMarlene(id: string, active = true) {
    const p = party(id);
    p.players.push({
      id: "star",
      nickname: "Marlène",
      avatar: 2,
      active,
      joinedAt: 1002,
      role: "marlene",
    });
    return p;
  }
  function openWith(id: string, key: Record<string, unknown>, active = true) {
    let p = withMarlene(id, active);
    p = run(p, admin, "private", { questionId: id, ...key });
    return run(p, admin, "open");
  }
  it("answers, gets scored and is ranked with the guests", () => {
    let p = openWith("q3", { answers: ["Elle a fait pipi"] });
    p = run(p, me, "submit", { value: ["Elle a fait pipi"] });
    expect(view(p, me, 1).submitted).toBe(true);
    p = run(p, guest(), "submit", { value: ["Elle a vomi sur le tapis"] });
    p = run(p, guest("bob"), "submit", { value: ["Elle a vomi sur le tapis"] });
    expect(p.phase).toBe("reveal");
    expect(leaderboard(p).map((x) => [x.id, x.score])).toEqual([
      ["star", 1],
      ["alice", -1],
      ["bob", -1],
    ]);
    const v = view(p, me, 1);
    expect(v.result).toMatchObject({ delta: 1, correct: true });
    expect(v.players.map((x) => x.id)).toContain("star");
    // The host is never ranked.
    p.players.push({
      id: "host",
      nickname: "Hôte",
      avatar: 3,
      active: true,
      joinedAt: 1003,
      role: "admin",
    });
    expect(leaderboard(p).map((x) => x.id)).not.toContain("host");
  });
  it("keeps a normal round open until she has answered too", () => {
    let p = openWith("q3", { answers: ["Elle a fait pipi"] });
    expect(view(p, guest(), 1).roundPlayers).toBe(3);
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    p = run(p, guest("bob"), "submit", { value: ["Elle a fait pipi"] });
    expect(p.phase).toBe("question_open");
    p = run(p, me, "submit", { value: ["Elle a fait pipi"] });
    expect(p.phase).toBe("reveal");
    // Signed out, she no longer holds the round up.
    p = openWith("q3", { answers: ["Elle a fait pipi"] }, false);
    expect(view(p, guest(), 1).roundPlayers).toBe(2);
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    p = run(p, guest("bob"), "submit", { value: ["Elle a fait pipi"] });
    expect(p.phase).toBe("reveal");
  });
  it("leads the drawing, creative and Pictionary rounds instead of answering", () => {
    const drawing = openWith("q17", { prompt: "Un chat en soirée" });
    const creative = run(withMarlene("q15"), admin, "open");
    const pictionary = openWith("q16", { text: "Éléphant rose" });
    for (const [p, value] of [
      [drawing, [stroke]],
      [creative, "Mon chat a mangé mon agenda"],
      [pictionary, "Éléphant rose"],
    ] as const) {
      expect(() => run(p, me, "submit", { value })).toThrow("mènes");
      expect(view(p, guest(), 1).roundPlayers).toBe(2);
    }
    // The guests' answers alone close the drawing and creative rounds.
    let p = run(drawing, guest(), "submit", { value: [stroke] });
    p = run(p, guest("bob"), "submit", { value: [stroke] });
    expect(p.phase).toBe("drawing_submissions_closed");
    p = run(creative, guest(), "submit", { value: "J’ai piscine" });
    // She only sees the excuses she judges once the round is closed.
    expect(view(p, me, 1).submissions).toBeUndefined();
    p = run(p, guest("bob"), "submit", { value: "Mon hamster est malade" });
    expect(p.phase).toBe("submissions_closed");
    p = run(p, admin, "reveal");
    expect(view(p, me, 1).submissions).toHaveLength(2);
  });
  it("never sees the others' answers while a round is open", () => {
    let p = openWith("q3", { answers: ["Elle a fait pipi"] });
    p = run(p, guest(), "submit", { value: ["Elle a vomi sur le tapis"] });
    const v = view(p, me, 1);
    expect(v.submissions).toBeUndefined();
    expect(v.events).toBeUndefined();
    expect(v.submissionCount).toBe(1);
  });
  it("answers a reveal round about herself and can still reveal it herself", () => {
    let p = openWith("q14", { text: "Un voyage" });
    p = run(p, me, "submit", { value: "Un voyage" });
    p = run(p, guest(), "submit", { value: "Une maison" });
    p = run(p, guest("bob"), "submit", { value: "Un bateau" });
    expect(p.phase).toBe("submissions_closed");
    p = run(p, admin, "allowReveal", { allowed: true });
    p = run(p, me, "starReveal");
    expect(p.phase).toBe("reveal");
  });
});
describe("Marlène's answer is the key", () => {
  const me: Actor = { role: "marlene", playerId: "star" };
  function withMarlene(id: string, active = true) {
    const p = party(id);
    p.players.push({
      id: "star",
      nickname: "Marlène",
      avatar: 2,
      active,
      joinedAt: 1002,
      role: "marlene",
    });
    return p;
  }
  const score = (p: Party, id: string) =>
    leaderboard(p).find((x) => x.id === id)!.score;
  it("seeds the flag on the height, the body count and the million", () => {
    const flagged = seedQuestions
      .filter((q) => q.keyFromMarlene)
      .map((q) => q.id);
    expect(flagged).toEqual(["q5", "q11", "q14"]);
    // None of them comes with a key: the host's is only a fallback.
    const p = createParty("123456", { admin: "x", marlene: "y" });
    for (const id of flagged) expect(p.secrets[id]).toBeUndefined();
  });
  it("takes her height as the key, scores the guests by distance, not her", () => {
    let p = run(withMarlene("q5"), admin, "open");
    p = run(p, guest(), "submit", { value: 168 });
    p = run(p, guest("bob"), "submit", { value: 171 });
    // The round waits for her answer while she's signed in.
    expect(p.phase).toBe("question_open");
    // Her answer is stored with the round's answers, never shown to the others.
    p = run(p, me, "submit", { value: 169 });
    expect(p.phase).toBe("reveal");
    expect(p.secrets.q5).toBeUndefined();
    expect(score(p, "alice")).toBe(4);
    expect(score(p, "bob")).toBe(3);
    expect(view(p, guest("bob"), 1).result?.reason).toBe("2 cm d’écart");
    // She's the reference: no score event for her on this round.
    expect(p.events.some((e) => e.playerId === "star")).toBe(false);
    expect(view(p, me, 1).result).toBeUndefined();
    for (const v of [view(p, guest(), 1), view(p, me, 1)]) {
      expect(v.answer).toEqual({ number: 169 });
      expect(v.answerFromMarlene).toBe(true);
    }
  });
  it("keeps her answer away from the guests and the TV until the reveal", () => {
    let p = run(withMarlene("q14"), admin, "open");
    p = run(p, me, "submit", { value: "Ouvrir un bar à Bali" });
    for (const v of [view(p, guest(), 1), view(p, { role: "present" }, 1)]) {
      expect(JSON.stringify(v)).not.toContain("Bali");
      expect(v.answer).toBeUndefined();
    }
  });
  it("prefers her answer to a key the host typed, which stays as the fallback", () => {
    let p = withMarlene("q5");
    p = run(p, admin, "private", { questionId: "q5", number: 160 });
    p = run(p, admin, "open");
    p = run(p, guest(), "submit", { value: 169 });
    p = run(p, guest("bob"), "submit", { value: 160 });
    expect(p.phase).toBe("question_open");
    p = run(p, me, "submit", { value: 169 });
    expect(score(p, "alice")).toBe(5);
    expect(score(p, "bob")).toBe(-4);
    expect(p.secrets.q5.number).toBe(160);
  });
  it("falls back on the host's key when she isn't signed in", () => {
    let p = withMarlene("q5", false);
    p = run(p, admin, "private", { questionId: "q5", number: 168 });
    p = run(p, admin, "open");
    p = run(p, guest(), "submit", { value: 168 });
    p = run(p, guest("bob"), "submit", { value: 170 });
    // She isn't playing: the guests' answers close it and the host's key marks it.
    expect(p.phase).toBe("reveal");
    expect(score(p, "alice")).toBe(5);
    expect(view(p, guest(), 1).answerFromMarlene).toBeUndefined();
  });
  it("waits for the host when she never answers and there's no key", () => {
    let p = run(withMarlene("q5"), admin, "open");
    p = run(p, guest(), "submit", { value: 168 });
    p = run(p, guest("bob"), "submit", { value: 170 });
    expect(p.phase).toBe("question_open");
    p = run(p, admin, "close");
    expect(p.phase).toBe("submissions_closed");
    expect(() => run(p, admin, "reveal")).toThrow("Confirme");
    // The host types the key as a fallback, then reveals.
    p = run(p, admin, "private", { questionId: "q5", number: 170 });
    p = run(p, admin, "reveal");
    expect(score(p, "alice")).toBe(3);
    expect(score(p, "bob")).toBe(5);
  });
  it("shows her answer on a reveal round, and the host grades only the guests", () => {
    let p = run(withMarlene("q14"), admin, "open");
    p = run(p, guest(), "submit", { value: "Voyager" });
    p = run(p, guest("bob"), "submit", { value: "Une maison" });
    p = run(p, me, "submit", { value: "Faire le tour du monde" });
    // A "Marlène dévoile" round: the host validates the guesses.
    expect(p.phase).toBe("submissions_closed");
    p = run(p, admin, "reveal");
    expect(view(p, guest(), 1).answer).toEqual({
      text: "Faire le tour du monde",
    });
    expect(view(p, guest(), 1).answerFromMarlene).toBe(true);
    const subs = p.submissions[p.roundId];
    const hers = subs.find((x) => x.playerId === "star")!;
    expect(() =>
      run(p, admin, "grade", { submissionId: hers.id, correct: true }),
    ).toThrow("référence");
    const alice = subs.find((x) => x.playerId === "alice")!;
    p = run(p, admin, "grade", { submissionId: alice.id, correct: true });
    expect(score(p, "alice")).toBe(1);
    // Without her answer nor the host's, there's nothing to reveal.
    let empty = run(withMarlene("q14"), admin, "open");
    empty = run(empty, admin, "close");
    expect(() => run(empty, admin, "reveal")).toThrow(
      "Marlène n’a pas répondu",
    );
  });
  it("gives her no key and no notes, only the Pictionary word she draws", () => {
    let p = withMarlene("q16");
    p = run(p, admin, "private", {
      questionId: "q16",
      text: "Éléphant rose",
    });
    p = run(p, admin, "open");
    expect(p.phase).toBe("pictionary_live");
    const v = view(p, me, 1);
    expect(v).not.toHaveProperty("secrets");
    expect(v).not.toHaveProperty("questions");
    expect(v.word).toBe("Éléphant rose");
    // Other rounds' keys never reach her.
    expect(JSON.stringify(v)).not.toContain("Prof de plongée");
    expect(view(p, guest(), 1).word).toBeUndefined();
    // Nor during a normal round she answers.
    let q3 = withMarlene("q3");
    q3 = run(q3, admin, "open");
    const mine = view(q3, me, 1);
    expect(mine).not.toHaveProperty("secrets");
    expect(mine.word).toBeUndefined();
    expect(JSON.stringify(mine)).not.toContain('Elle a fait pipi"]');
  });
  it("lets only the host set answer keys", () => {
    const p = withMarlene("q5");
    expect(() =>
      run(p, me, "private", { questionId: "q5", number: 168 }),
    ).toThrow("réservée à l’hôte");
    expect(
      run(p, admin, "private", { questionId: "q5", number: 168 }).secrets.q5
        .number,
    ).toBe(168);
  });
  it("lets the host turn the flag on or off between rounds", () => {
    let p = withMarlene("q3");
    p = run(p, admin, "edit", {
      questionId: "q3",
      patch: { keyFromMarlene: true },
    });
    expect(p.questions[0].keyFromMarlene).toBe(true);
    expect(() =>
      run(p, admin, "edit", {
        questionId: "q3",
        patch: { keyFromMarlene: "yes" },
      }),
    ).toThrow("invalides");
    // A multi-select round: her ticks become the key and she isn't scored.
    p = run(p, admin, "open");
    p = run(p, me, "submit", { value: ["Elle a fait pipi"] });
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    p = run(p, guest("bob"), "submit", { value: ["Elle a vomi sur le tapis"] });
    expect(p.phase).toBe("reveal");
    expect(score(p, "alice")).toBe(1);
    expect(score(p, "bob")).toBe(-1);
    expect(score(p, "star")).toBe(0);
    // Ignored on the rounds she leads.
    let q16 = withMarlene("q16");
    q16 = run(q16, admin, "edit", {
      questionId: "q16",
      patch: { keyFromMarlene: true },
    });
    q16 = run(q16, admin, "private", { questionId: "q16", text: "Chat" });
    q16 = run(q16, admin, "open");
    expect(() => run(q16, me, "submit", { value: "Chat" })).toThrow("mènes");
  });
  it("flags stored parties once, keeping typed keys and the host's choice", () => {
    const legacy = () => {
      const p = createParty("123456", { admin: "x", marlene: "y" });
      for (const q of p.questions) delete q.keyFromMarlene;
      const height = p.questions.find((q) => q.id === "q5")!;
      height.note =
        "Marlène renseigne sa taille en privé. 5 points pile poil, un de moins par cm d’écart.";
      p.questions.find((q) => q.id === "q16")!.note =
        "Marlène choisit un mot secret et dessine. Première bonne réponse : +5.";
      p.secrets.q5 = { number: 168 };
      height.confirmed = true;
      return p;
    };
    const flag = (x: Party, id: string) =>
      x.questions.find((q) => q.id === id)!.keyFromMarlene;
    const stored = legacy();
    const upgraded = applySuppliedAnswers(stored);
    for (const id of ["q5", "q11", "q14"])
      expect(flag(upgraded, id)).toBe(true);
    expect(flag(upgraded, "q4")).toBeUndefined();
    expect(upgraded.secrets.q5).toEqual({ number: 168 });
    expect(upgraded.questions.find((q) => q.id === "q5")!.note).toBe(
      seedQuestions.find((q) => q.id === "q5")!.note,
    );
    expect(upgraded.questions.find((q) => q.id === "q16")!.note).toBe(
      seedQuestions.find((q) => q.id === "q16")!.note,
    );
    expect(flag(stored, "q5")).toBeUndefined();
    expect(applySuppliedAnswers(upgraded)).toBe(upgraded);
    // The host turned it off: left alone.
    const off = legacy();
    off.questions.find((q) => q.id === "q14")!.keyFromMarlene = false;
    expect(flag(applySuppliedAnswers(off), "q14")).toBe(false);
    // Being played right now: left alone until the round is over.
    const playing = legacy();
    playing.index = playing.questions.findIndex((q) => q.id === "q5");
    playing.phase = "question_open";
    expect(flag(applySuppliedAnswers(playing), "q5")).toBeUndefined();
    playing.phase = "next_round";
    expect(flag(applySuppliedAnswers(playing), "q5")).toBe(true);
  });
});
describe("selfies", () => {
  const first = "11111111-1111-4111-8111-111111111111",
    second = "22222222-2222-4222-8222-222222222222";
  it("sets, replaces and removes a player's photo without touching the original", () => {
    const original = party();
    const added = setPhoto(original, "alice", first);
    expect(added.previous).toBeUndefined();
    expect(original.players[0].photo).toBeUndefined();
    const replaced = setPhoto(added.party, "alice", second);
    expect(replaced.previous).toBe(first);
    expect(replaced.party.players[0].photo).toBe(second);
    const removed = setPhoto(replaced.party, "alice", null);
    expect(removed.previous).toBe(second);
    expect(removed.party.players[0].photo).toBeUndefined();
  });
  it("asks Marlène for a selfie like a guest, never the host or the TV", () => {
    let p = party();
    p.players.push({
      id: "star",
      nickname: "Marlène",
      avatar: 2,
      active: true,
      joinedAt: 1002,
      role: "marlene",
    });
    const me: Actor = { role: "marlene", playerId: "star" };
    expect(showsSelfieStep(view(p, me, 1))).toBe(true);
    expect(showsSelfieStep(view(p, guest(), 1))).toBe(true);
    expect(showsSelfieStep(view(p, admin, 1))).toBe(false);
    expect(showsSelfieStep(view(p, { role: "present" }, 1))).toBe(false);
    // Arriving during an open round, she answers first.
    const open = run(
      run(p, admin, "private", {
        questionId: "q3",
        answers: ["Elle a fait pipi"],
      }),
      admin,
      "open",
    );
    expect(showsSelfieStep(view(open, me, 1))).toBe(false);
    p = setPhoto(p, "star", first).party;
    expect(showsSelfieStep(view(p, me, 1))).toBe(false);
    // She chose to change it.
    expect(showsSelfieStep(view(p, me, 1), "lobby")).toBe(true);
    // Her selfie shows on the guests' phones and the TV.
    for (const a of [guest(), { role: "present" } as Actor])
      expect(view(p, a, 1).players.find((x) => x.id === "star")?.photo).toBe(
        first,
      );
    // The host removes it: back to the step.
    p = setPhoto(p, "star", null).party;
    expect(showsSelfieStep(view(p, me, 1))).toBe(true);
  });
  it("rejects an unknown player", () =>
    expect(() => setPhoto(party(), "mallory", first)).toThrow("introuvable"));
  it("shows photos to everyone in the player list", () => {
    const p = setPhoto(party(), "bob", first).party;
    expect(view(p, guest(), 1).players.find((x) => x.id === "bob")?.photo).toBe(
      first,
    );
  });
  it("deals the drawn fallback avatar in join order, ignoring any client pick", () => {
    let p = createParty("123456", { admin: "", marlene: "" }, 1000);
    for (let i = 0; i < 10; i++)
      p = run(p, guest(`g${i}`), "join", {
        nickname: `Invité ${i}`,
        avatar: i === 0 ? 7 : "<script>",
      });
    expect(p.players.map((x) => x.avatar)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 0, 1,
    ]);
  });
  it("keeps the same drawn avatar when a guest reconnects", () => {
    let p = createParty("123456", { admin: "", marlene: "" }, 1000);
    p = run(p, guest("a"), "join", { nickname: "A" });
    p = run(p, guest("b"), "join", { nickname: "B" });
    p = run(p, guest("b"), "join", { nickname: "B bis", avatar: 6 });
    expect(p.players.find((x) => x.id === "b")?.avatar).toBe(1);
  });
  it("can't be set through a game command", () =>
    expect(() => run(party(), guest(), "photo", { photo: first })).toThrow(
      "Action inconnue",
    ));
});
