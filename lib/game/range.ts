// HTTP byte ranges for media. Browsers fetch audio in ranges to seek into it:
// without them Chrome can't jump to the blind-test section and iOS Safari won't play.
export type ByteRange = { offset: number; length: number };

/**
 * Reads a single `bytes=` range for an object of `size` bytes.
 * Returns null when there is no usable Range header (serve the whole file)
 * and "unsatisfiable" when the range starts past the end (answer 416).
 */
export function parseRange(
  header: string | null | undefined,
  size: number,
): ByteRange | null | "unsatisfiable" {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) {
    const suffix = Math.min(Number(m[2]), size);
    if (suffix === 0) return "unsatisfiable";
    return { offset: size - suffix, length: suffix };
  }
  const start = Number(m[1]);
  if (start >= size) return "unsatisfiable";
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (end < start) return null;
  return { offset: start, length: end - start + 1 };
}
