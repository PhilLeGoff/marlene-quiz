import { describe, it, expect } from "vitest";
import { createParty } from "../lib/game/seed";
import { reduce } from "../lib/game/engine";
import {
  CLIP_MAX,
  clipProblem,
  formatClock,
  moveClipEdge,
  parseClock,
} from "../lib/game/clip";
import { parseRange } from "../lib/game/range";
import type { Party } from "../lib/game/types";

const admin = { role: "admin" } as const;
const edit = (p: Party, patch: Record<string, unknown>, questionId = "q6a") =>
  reduce(
    p,
    admin,
    { id: crypto.randomUUID(), action: "edit", questionId, patch },
    2000,
  );
const blind = (p: Party) => p.questions.find((q) => q.id === "q6a")!;
const fresh = () =>
  createParty("123456", { admin: "hash", marlene: "hash" }, 1000);

describe("blind-test section, server side", () => {
  it("saves a valid section", () => {
    const p = edit(fresh(), { clipStart: 41.5, clipEnd: 71.5 });
    expect(blind(p)).toMatchObject({ clipStart: 41.5, clipEnd: 71.5 });
  });
  it("rejects a negative start, a non-number or a position past an hour", () => {
    for (const patch of [
      { clipStart: -1, clipEnd: 20 },
      { clipStart: "10", clipEnd: 20 },
      { clipStart: 0, clipEnd: Number.NaN },
      { clipStart: 3590, clipEnd: 3601 },
    ])
      expect(() => edit(fresh(), patch)).toThrow("Valeur hors limites.");
  });
  it("needs the end after the start", () => {
    expect(() => edit(fresh(), { clipStart: 30, clipEnd: 30 })).toThrow(
      "La fin de l’extrait doit venir après le début.",
    );
    expect(() => edit(fresh(), { clipStart: 40, clipEnd: 10 })).toThrow(
      "après le début",
    );
    // Moving only the start past the saved end is caught too.
    expect(() => edit(fresh(), { clipStart: 45 })).toThrow("après le début");
  });
  it(`caps the section at ${CLIP_MAX} seconds`, () => {
    expect(() => edit(fresh(), { clipStart: 10, clipEnd: 70.5 })).toThrow(
      "au plus 60 secondes",
    );
    expect(blind(edit(fresh(), { clipStart: 10, clipEnd: 70 })).clipEnd).toBe(
      70,
    );
  });
  it("leaves other edits alone when the section isn't touched", () => {
    const p = edit(fresh(), { note: "Monter le son" });
    expect(blind(p)).toMatchObject({ clipStart: 0, clipEnd: 30 });
  });
  it("starts the round's audio from the section start", () => {
    let p = edit(fresh(), {
      clipStart: 12,
      clipEnd: 42,
      media: ["/api/media?id=00000000-0000-4000-8000-000000000000"],
      enabled: true,
    });
    p = {
      ...p,
      questions: p.questions.filter((q) => q.id === "q6a"),
    };
    p = reduce(p, admin, { id: crypto.randomUUID(), action: "open" }, 3000);
    p = reduce(
      p,
      admin,
      { id: crypto.randomUUID(), action: "audio", playing: true },
      4000,
    );
    expect(p.audio).toEqual({ playing: true, at: 4000, offset: 12 });
  });
});

describe("blind-test section, editor helpers", () => {
  it("formats and reads m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(41.5)).toBe("0:41.5");
    expect(formatClock(183.24)).toBe("3:03.2");
    expect(parseClock("1:05")).toBe(65);
    expect(parseClock(" 0:41,5 ")).toBe(41.5);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("1:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("-3")).toBeNull();
  });
  it("keeps a dragged section between 5 and 60 seconds and inside the song", () => {
    const clip = { start: 10, end: 40 };
    // Dragging the start past the end pushes the end along.
    expect(moveClipEdge(clip, "start", 50, 180)).toEqual({
      start: 50,
      end: 55,
    });
    // Dragging the end far away drags the start to keep 60 s at most.
    expect(moveClipEdge(clip, "end", 120, 180)).toEqual({
      start: 60,
      end: 120,
    });
    // The start can't leave room for less than 5 s before the song ends.
    expect(moveClipEdge(clip, "start", 179, 180)).toEqual({
      start: 175,
      end: 180,
    });
    expect(moveClipEdge(clip, "end", 500, 180)).toEqual({
      start: 120,
      end: 180,
    });
    expect(moveClipEdge(clip, "start", -4, 180)).toEqual({ start: 0, end: 40 });
    expect(moveClipEdge(clip, "end", 2, 180)).toEqual({ start: 0, end: 5 });
    expect(moveClipEdge(clip, "start", 12.34, 180)).toEqual({
      start: 12.3,
      end: 40,
    });
  });
  it("explains what's wrong with a typed section", () => {
    expect(clipProblem({ start: 11, end: 41 }, 183)).toBeNull();
    expect(clipProblem({ start: 20, end: 10 }, 183)).toMatch(/après le début/);
    expect(clipProblem({ start: 10, end: 12 }, 183)).toMatch(/au moins 5/);
    expect(clipProblem({ start: 10, end: 80 }, 183)).toMatch(/au plus 60/);
    expect(clipProblem({ start: 170, end: 190 }, 183)).toMatch(/3:03/);
    expect(clipProblem({ start: -1, end: 10 })).toMatch(/négatif/);
    // A song shorter than 5 s can still be played whole.
    expect(clipProblem({ start: 0, end: 1 }, 1)).toBeNull();
  });
});

describe("media byte ranges", () => {
  it("reads the Range header browsers send to seek in audio", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-", 1000)).toEqual({ offset: 0, length: 1000 });
    expect(parseRange("bytes=100-199", 1000)).toEqual({
      offset: 100,
      length: 100,
    });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({
      offset: 900,
      length: 100,
    });
    expect(parseRange("bytes=-100", 1000)).toEqual({
      offset: 900,
      length: 100,
    });
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-1", 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
  });
});
