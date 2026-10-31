import type { Question } from "./types";
// Durations such as a 5 km run are stored in whole seconds and shown as mm:ss.
export function formatTime(seconds: number) {
  const total = Math.round(Math.abs(seconds));
  const m = Math.floor(total / 60),
    s = total % 60;
  return `${seconds < 0 ? "−" : ""}${m}:${String(s).padStart(2, "0")}`;
}
// Reads "27:30" (also "27.30", "27,30", "27'30", "27 30") or plain minutes ("27").
// Seconds need two digits so "27.5" can't silently mean 27:05. Returns null if unreadable.
export function parseTime(input: string): number | null {
  const m = input.trim().match(/^(\d{1,3})(?:\s*[:.,'’\s]\s*(\d{2}))?$/);
  if (!m) return null;
  const seconds = m[2] === undefined ? 0 : Number(m[2]);
  if (seconds > 59) return null;
  return Number(m[1]) * 60 + seconds;
}
// A gap in words: "45 s", "2 min", "2 min 15 s".
export function formatGap(seconds: number) {
  const total = Math.round(Math.abs(seconds));
  const m = Math.floor(total / 60),
    s = total % 60;
  return [m && `${m} min`, (s || !m) && `${s} s`].filter(Boolean).join(" ");
}
export function isTime(q: Pick<Question, "slider"> | null | undefined) {
  return q?.slider?.format === "time";
}
// How a number answer or key reads on screen: "27:30" for a time, "168 cm" otherwise.
export function formatNumber(
  q: Pick<Question, "slider" | "unit"> | null | undefined,
  value: number,
) {
  return isTime(q) ? formatTime(value) : `${value} ${q?.unit ?? ""}`.trim();
}
