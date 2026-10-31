import { describe, it, expect } from "vitest";
import {
  EXES_MATCH_ID,
  applySuppliedAnswers,
  createParty,
  exesMatchKey,
} from "../lib/game/seed";
import { leaderboard, matchScore, reduce, view } from "../lib/game/engine";
import type { Actor, Party } from "../lib/game/types";
const admin: Actor = { role: "admin" },
  present: Actor = { role: "present" },
  guest = (id = "alice"): Actor => ({ role: "guest", playerId: id });
const run = (
  p: Party,
  a: Actor,
  action: string,
  values: Record<string, unknown> = {},
  now = 2000,
) => reduce(p, a, { id: crypto.randomUUID(), action, ...values }, now);
const KEY = exesMatchKey.answers!; // Guillaume, Aloïs, Valentin, Renaud
function party() {
  const p = createParty("123456", { admin: "hash", marlene: "hash" }, 1000);
  p.questions = p.questions.filter((q) => q.id === EXES_MATCH_ID);
  p.players = ["alice", "bob", "chloe"].map((id, i) => ({
    id,
    nickname: id,
    avatar: i,
    active: true,
    joinedAt: 1000 + i,
  }));
  return p;
}
const opened = () => run(party(), admin, "open");
describe("exes matching round", () => {
  it("is seeded after the blind tests, enabled, with names in alphabetical order", () => {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    const ids = p.questions.map((q) => q.id);
    expect(ids.indexOf(EXES_MATCH_ID)).toBe(ids.indexOf("q6c") + 1);
    const q = p.questions.find((x) => x.id === EXES_MATCH_ID)!;
    expect(q).toMatchObject({ kind: "match", enabled: true, confirmed: true });
    expect(q.options).toEqual(["Aloïs", "Guillaume", "Renaud", "Valentin"]);
    expect(q.photos).toEqual(["ex-1", "ex-2", "ex-3", "ex-4"]);
    // The key is not the options order, so the options give nothing away.
    expect(p.secrets[EXES_MATCH_ID].answers).not.toEqual(q.options);
  });
  it("scores +1 per right pair and 0 for wrong or empty ones", () => {
    expect(matchScore(KEY, ["", "", "", ""]).delta).toBe(0);
    expect(
      matchScore(KEY, ["Aloïs", "Guillaume", "Renaud", "Valentin"]).delta,
    ).toBe(0);
    expect(matchScore(KEY, ["Guillaume", "", "", ""])).toEqual({
      delta: 1,
      reason: "1 bonne association sur 4",
    });
    expect(
      matchScore(KEY, ["Guillaume", "Aloïs", "Renaud", "Valentin"]).delta,
    ).toBe(2);
    expect(matchScore(KEY, ["Guillaume", "Aloïs", "Valentin", ""]).delta).toBe(
      3,
    );
    expect(matchScore(KEY, [...KEY])).toEqual({
      delta: 4,
      reason: "4 bonnes associations sur 4",
    });
    expect(matchScore(KEY, ["Renaud", "", "", ""]).reason).toBe(
      "Aucune bonne association",
    );
  });
  it("closes and scores once every guest has answered", () => {
    let p = opened();
    p = run(p, guest("alice"), "submit", { value: [...KEY] });
    p = run(p, guest("bob"), "submit", {
      value: ["Guillaume", "Valentin", "", "Aloïs"],
    });
    expect(p.phase).toBe("question_open");
    p = run(p, guest("chloe"), "submit", {
      value: ["Renaud", "Valentin", "Aloïs", "Guillaume"],
    });
    expect(p.phase).toBe("reveal");
    const scores = Object.fromEntries(
      leaderboard(p).map((x) => [x.id, [x.score, x.correctCount]]),
    );
    // Only a full set counts as "correct" for tie-breaks.
    expect(scores).toEqual({ alice: [4, 1], bob: [1, 0], chloe: [0, 0] });
    const v = view(p, guest("bob"), 1);
    expect(v.answer?.answers).toEqual(KEY);
    expect(v.matchRight).toEqual([2, 1, 1, 1]);
    expect(v.result).toMatchObject({
      delta: 1,
      reason: "1 bonne association sur 4",
    });
  });
  it("rejects duplicate, unknown, empty or misshaped answers", () => {
    const p = opened();
    const submit = (value: unknown) => run(p, guest(), "submit", { value });
    expect(() => submit(["Aloïs", "Aloïs", "", ""])).toThrow(
      "Chaque prénom ne va qu’avec une seule photo.",
    );
    expect(() => submit(["Aloïs", "Kevin", "", ""])).toThrow(
      "Choisis parmi les prénoms proposés.",
    );
    expect(() => submit(["Aloïs", "Renaud"])).toThrow(
      "Choisis parmi les prénoms proposés.",
    );
    expect(() => submit("Aloïs")).toThrow(
      "Choisis parmi les prénoms proposés.",
    );
    expect(() => submit(["", "", "", ""])).toThrow(
      "Associe au moins une photo.",
    );
    expect(submit(["", "Aloïs", "", ""]).submissions[p.roundId]).toHaveLength(
      1,
    );
  });
  it("keeps the key out of guest and TV views until the reveal", () => {
    let p = opened();
    p = run(p, guest(), "submit", { value: ["Guillaume", "Renaud", "", ""] });
    for (const actor of [guest(), guest("bob"), present, null]) {
      const v = view(p, actor, 1);
      expect(v.answer).toBeUndefined();
      expect(v.secrets).toBeUndefined();
      expect(v.matchRight).toBeUndefined();
      expect(v.questions).toBeUndefined();
      expect(JSON.stringify(v)).not.toContain(KEY.join('","'));
    }
    expect(view(p, guest("bob"), 1).question?.photos).toEqual([
      "ex-1",
      "ex-2",
      "ex-3",
      "ex-4",
    ]);
    p = run(p, admin, "close");
    expect(p.phase).toBe("reveal");
    expect(view(p, present, 1).answer?.answers).toEqual(KEY);
    expect(view(p, present, 1).matchRight).toEqual([1, 0, 0, 0]);
  });
  it("lets the host fix a name or the pairs; renaming keeps the pairs", () => {
    let p = party();
    p = run(p, admin, "edit", {
      questionId: EXES_MATCH_ID,
      patch: { options: ["Aloys", "Guillaume", "Renaud", "Valentin"] },
    });
    expect(p.secrets[EXES_MATCH_ID].answers).toEqual([
      "Guillaume",
      "Aloys",
      "Valentin",
      "Renaud",
    ]);
    expect(p.questions[0].confirmed).toBe(true);
    p = run(p, admin, "private", {
      questionId: EXES_MATCH_ID,
      answers: ["Aloys", "Guillaume", "Valentin", "Renaud"],
    });
    expect(p.secrets[EXES_MATCH_ID].answers![0]).toBe("Aloys");
    expect(() =>
      run(p, admin, "private", {
        questionId: EXES_MATCH_ID,
        answers: ["Aloys", "Aloys", "Valentin", "Renaud"],
      }),
    ).toThrow("Donne un prénom différent à chaque photo.");
    expect(() =>
      run(p, admin, "private", {
        questionId: EXES_MATCH_ID,
        answers: ["Aloys", "Guillaume"],
      }),
    ).toThrow("Donne un prénom différent à chaque photo.");
    // A different number of names can't be translated: the pairs must be set again.
    p = run(p, admin, "edit", {
      questionId: EXES_MATCH_ID,
      patch: { options: ["Aloys", "Guillaume", "Renaud", "Valentin", "Kevin"] },
    });
    expect(p.secrets[EXES_MATCH_ID]).toBeUndefined();
    expect(p.questions[0].confirmed).toBe(false);
  });
});
describe("exes round upgrade for stored parties", () => {
  // A party stored before the round existed: no q18, no marker.
  function stored() {
    const p = createParty("123456", { admin: "x", marlene: "y" });
    p.questions = p.questions.filter((q) => q.id !== EXES_MATCH_ID);
    delete p.secrets[EXES_MATCH_ID];
    delete p.questionPresetVersions![EXES_MATCH_ID];
    return p;
  }
  it("inserts the round after the blind tests exactly once", () => {
    const old = stored();
    const p = applySuppliedAnswers(old);
    const ids = p.questions.map((q) => q.id);
    expect(ids.filter((id) => id === EXES_MATCH_ID)).toHaveLength(1);
    expect(ids.indexOf(EXES_MATCH_ID)).toBe(ids.indexOf("q6c") + 1);
    expect(p.secrets[EXES_MATCH_ID]).toEqual(exesMatchKey);
    expect(old.questions.some((q) => q.id === EXES_MATCH_ID)).toBe(false);
    const again = applySuppliedAnswers(p);
    expect(again).toBe(p);
    expect(
      applySuppliedAnswers(
        createParty("1", { admin: "x", marlene: "y" }),
      ).questions.filter((q) => q.id === EXES_MATCH_ID),
    ).toHaveLength(1);
  });
  it("keeps the current round in place when inserting before it", () => {
    const old = stored();
    old.index = old.questions.findIndex((q) => q.id === "q7");
    old.phase = "question_open";
    const p = applySuppliedAnswers(old);
    expect(p.questions[p.index].id).toBe("q7");
  });
  it("doesn't bring back a round the host deleted", () => {
    let p = applySuppliedAnswers(stored());
    p = run(p, admin, "delete", { questionId: EXES_MATCH_ID });
    expect(applySuppliedAnswers(p)).toBe(p);
    expect(p.questions.some((q) => q.id === EXES_MATCH_ID)).toBe(false);
  });
});
