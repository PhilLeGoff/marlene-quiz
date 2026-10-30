// The section of a blind-test song that plays during the round, in seconds.
// Shared by the editor (which knows the song's length) and the server (which doesn't).
export const CLIP_MIN = 5;
export const CLIP_MAX = 60;
// Upper bound for any position in a song: an hour is far more than an 8 MB file holds.
export const CLIP_LIMIT = 3600;

export type Clip = { start: number; end: number };

const tenth = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** "1:05" or "1:05.5" for 65 or 65.5 seconds. */
export function formatClock(seconds: number) {
  const t = tenth(Math.max(0, seconds));
  const m = Math.floor(t / 60);
  const s = tenth(t - m * 60);
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 10);
  return `${m}:${String(whole).padStart(2, "0")}${frac ? `.${frac}` : ""}`;
}

/** Reads "1:05", "1:05.5", "65" or "65,5" as seconds; null if it isn't a time. */
export function parseClock(text: string): number | null {
  const v = text.trim().replace(",", ".");
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(v);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = Number(m[2]);
  if (m[1] && seconds >= 60) return null;
  return tenth(minutes * 60 + seconds);
}

/** Shortest section the editor allows: 5 s, or the whole song if it's shorter. */
function minLength(duration?: number) {
  return duration && duration < CLIP_MIN ? duration : CLIP_MIN;
}

/**
 * Moves one edge of the section to `value`, keeping it valid: inside the song,
 * at least 5 s and at most 60 s long. The other edge is pushed along when needed,
 * so dragging the start past the end slides the whole section.
 */
export function moveClipEdge(
  clip: Clip,
  edge: "start" | "end",
  value: number,
  duration?: number,
): Clip {
  const total = duration && duration > 0 ? duration : CLIP_LIMIT;
  const min = minLength(duration);
  if (edge === "start") {
    const start = tenth(clamp(value, 0, total - min));
    const end = clamp(clip.end, start + min, Math.min(start + CLIP_MAX, total));
    return { start, end: tenth(end) };
  }
  const end = tenth(clamp(value, min, total));
  const start = clamp(clip.start, Math.max(0, end - CLIP_MAX), end - min);
  return { start: tenth(start), end };
}

/** Why the section can't be saved, in French, or null when it's fine. */
export function clipProblem(clip: Clip, duration?: number): string | null {
  const { start, end } = clip;
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return "Indique un début et une fin valides.";
  if (start < 0) return "Le début ne peut pas être négatif.";
  if (end <= start) return "La fin doit venir après le début.";
  if (duration && end > duration + 0.05)
    return `La chanson s’arrête à ${formatClock(duration)}.`;
  if (end - start < minLength(duration) - 0.05)
    return `L’extrait doit durer au moins ${CLIP_MIN} secondes.`;
  if (end - start > CLIP_MAX + 0.05)
    return `L’extrait doit durer au plus ${CLIP_MAX} secondes.`;
  return null;
}
