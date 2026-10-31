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
import { isMultiSelect } from "../lib/game/types";
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
    p = run(p, star, "private", {
      questionId: id,
      answers: ["Elle a fait pipi"],
    });
  if (id === "q16")
    p = run(p, star, "private", {
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
    expect(p.questions.find((q) => q.id === "q10")!.slider).toBeUndefined();
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
  it("retains seven choices and protects optional rounds", () => {
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
    let p = run(party("q5"), star, "private", {
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
    let p = run(party(), star, "private", {
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
    p = run(p, star, "private", { questionId: "q14", text: "Un voyage" });
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
    expect(leaderboard(p)).toHaveLength(0);
    p = run(p, guest(), "join", { nickname: "A" });
    expect(leaderboard(p)).toHaveLength(1);
  });
  it("lets the same identity reconnect without duplicate participation", () => {
    let p = createParty("123456", { admin: "", marlene: "" }, 1000);
    p = run(p, guest(), "join", { nickname: "Alice" });
    p = run(p, guest(), "join", { nickname: "ALICE" });
    expect(p.players).toHaveLength(1);
  });

  it("erases the private key when its question is deleted", () => {
    let p = createParty("123456", { admin: "hash", marlene: "hash" }, 1000);
    p = run(p, star, "consent");
    p = run(p, star, "private", { questionId: "q11", number: 42 });
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
    p = run(p, star, "private", { questionId: "q14", text: "Un voyage" });
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
    p = run(p, star, "private", { questionId: "q5", number: 168 });
    p = run(p, admin, "reveal");
    expect(p.events).toHaveLength(2);
    // Free-text guesses at Marlène's answer are validated by the host.
    p = opened("q14");
    p = run(p, star, "private", { questionId: "q14", text: "Un voyage" });
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
    p = run(p, star, "private", {
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
  it("requires sensitive consent from Marlène and supports immediate withdrawal", () => {
    let p = party("q11");
    expect(() => run(p, admin, "consent")).toThrow("Seule");
    expect(() =>
      run(p, admin, "edit", { questionId: "q11", patch: { enabled: true } }),
    ).toThrow("consentement");
    p = run(p, star, "consent");
    p = run(p, admin, "edit", { questionId: "q11", patch: { enabled: true } });
    p = run(p, admin, "open");
    p = run(p, star, "private", { questionId: "q11", number: 42 });
    p = run(p, guest(), "submit", { value: 22 });
    p = run(p, star, "withdraw");
    expect(p.secrets.q11).toBeUndefined();
    expect(p.submissions[p.roundId]).toBeUndefined();
    expect(p.questions[0].enabled).toBe(false);
    expect(p.events).toHaveLength(0);
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
