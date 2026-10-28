import { describe, it, expect } from "vitest";
import { createParty, seedQuestions } from "../lib/game/seed";
import {
  correct,
  leaderboard,
  normalize,
  reduce,
  validateStrokes,
  view,
} from "../lib/game/engine";
import type { Actor, Command, Party, Stroke } from "../lib/game/types";
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
    expect(seedQuestions).toHaveLength(19);
    expect(seedQuestions.map((q) => q.source)).toEqual([
      1, 2, 3, 4, 5, 6, 6, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });
  it("never guesses unknown personal keys", () => {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    expect(Object.keys(p.secrets).sort()).toEqual(["q6a", "q6b", "q6c", "q7"]);
    expect(seedQuestions.filter((q) => q.confirmed).map((q) => q.id)).toEqual([
      "q6a",
      "q6b",
      "q6c",
      "q7",
    ]);
  });
  it("retains seven choices and protects optional rounds", () => {
    expect(seedQuestions.find((q) => q.id === "q4")?.options).toHaveLength(7);
    expect(seedQuestions.find((q) => q.id === "q10")?.options).toHaveLength(7);
    for (const id of ["q8", "q11", "q12"])
      expect(seedQuestions.find((q) => q.id === id)?.enabled).toBe(false);
  });
});
describe("scoring and normalization", () => {
  it("revokes score and tie-break credit for a moderated correct answer", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    p = run(p, admin, "close");
    p = run(p, admin, "reveal");
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
    p = run(p, admin, "reveal");
    expect(leaderboard(p).find((p) => p.id === "alice")?.score).toBe(-1);
    expect(leaderboard(p).find((p) => p.id === "bob")?.score).toBe(0);
  });
  it("scores the correct answer exactly once even with an idempotent retry", () => {
    let p = opened();
    const cmd = command("submit", { value: ["Elle a fait pipi"] });
    p = reduce(p, guest(), cmd, 2100);
    p = reduce(p, guest(), cmd, 2200);
    expect(p.submissions[p.roundId]).toHaveLength(1);
    p = run(p, admin, "close");
    const reveal = command("reveal");
    p = reduce(p, admin, reveal);
    p = reduce(p, admin, reveal);
    expect(p.events).toHaveLength(1);
    expect(p.events[0].delta).toBe(1);
  });
  it("breaks ties by correct count then cumulative response time; otherwise shares rank", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] }, 2100);
    p = run(p, guest("bob"), "submit", { value: ["Elle a fait pipi"] }, 2200);
    p = run(p, admin, "close");
    p = run(p, admin, "reveal");
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
      "déjà pris",
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
    const p = run(party(), admin, "open");
    expect(() => run(p, admin, "reveal")).toThrow("Ferme");
    expect(() => run(run(p, admin, "close"), admin, "reveal")).toThrow(
      "Confirme",
    );
  });
  it("reveals a confirmed answer at the right phase only", () => {
    let p = opened();
    p = run(p, admin, "close");
    p = run(p, admin, "reveal");
    expect(view(p, guest(), 1).answer?.answers).toEqual(["Elle a fait pipi"]);
  });
  it("requires explicit host permission for star-triggered reveal", () => {
    let p = opened();
    p = run(p, admin, "close");
    expect(() => run(p, star, "starReveal")).toThrow("autoriser");
    p = run(p, admin, "allowReveal", { allowed: true });
    expect(run(p, star, "starReveal").phase).toBe("reveal");
  });
});
describe("submissions, timers, drawing and winner races", () => {
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
    let p = party("q8");
    p = run(p, admin, "edit", { questionId: "q8", patch: { enabled: true } });
    p = run(p, admin, "private", { questionId: "q8", text: "8246" });
    p = run(p, admin, "open");
    for (let i = 0; i < 3; i++)
      p = run(p, guest(), "submit", { value: "1111" });
    expect(() => run(p, guest(), "submit", { value: "8246" })).toThrow(
      "tentatives",
    );
  });
  it("preserves immutable score history when resetting and excludes previous generations", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Elle a fait pipi"] });
    p = run(p, admin, "close");
    p = run(p, admin, "reveal");
    p = run(p, admin, "reset", { confirm: "123456" });
    expect(p.events).toHaveLength(1);
    expect(leaderboard(p)[0].score).toBe(0);
    expect(p.phase).toBe("lobby");
  });
  it("completes the full state sequence", () => {
    let p = opened();
    p = run(p, admin, "close");
    p = run(p, admin, "reveal");
    p = run(p, admin, "leaderboard");
    p = run(p, admin, "next");
    expect(p.phase).toBe("finished");
  });
});
