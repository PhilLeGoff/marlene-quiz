// Blind-test answers: a song picked from the catalogue search, or typed by hand when the
// search can't find it. Both are compared to the round's key (title, artist, aliases) after
// folding away case, accents, punctuation and the usual catalogue decorations
// ("(Remastered 2011)", "- Live", "feat. X").
import type { Secret, Song } from "./types";

// Lower-case ASCII letters and digits only, like the free-text normaliser in engine.ts.
export function fold(value: string) {
  return value
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]/g, "");
}
const BRACKETS = /\s*[([{][^)\]}]*[)\]}]/g;
const FEAT = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;
const DASH_SUFFIX = /\s+[-–—]\s+.*$/;
const ARTICLE =
  /^(?:(?:the|an?|les?|la|une?|il|lo|gli|el|los|las|die|der|das)\s+|l['’]\s*)/i;
const add = (set: Set<string>, raw: string) => {
  const f = fold(raw);
  if (f) set.add(f);
};
// The forms a key string accepts: as written, without brackets or "feat.", without a
// leading article. A dash is kept: in "Noir Désir — Marlène" the part after it matters.
function keyForms(raw: string, set = new Set<string>()) {
  const bare = raw.replace(BRACKETS, " ").replace(FEAT, "").trim();
  for (const s of [raw, bare, bare.replace(ARTICLE, "")]) add(set, s);
  return set;
}
// The forms a player's title (or typed answer) can take: as keyForms, plus without a
// " - Live" / " - Remastered" tail.
export function titleForms(raw: string) {
  const set = keyForms(raw);
  const bare = raw.replace(BRACKETS, " ").replace(FEAT, "").trim();
  const head = bare.replace(DASH_SUFFIX, "").trim();
  if (head) keyForms(head, set);
  return [...set];
}
// A credited artist as a whole and each of its parts: "Noir Désir, Bertrand Cantat" and
// "Måneskin feat. X" both count as by Noir Désir / Måneskin.
const SPLIT_ARTISTS =
  /\s*(?:,|&|\+|\/|;|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\bet\b|\band\b|\bvs\.?)\s*/i;
export function artistForms(raw: string) {
  const set = keyForms(raw);
  for (const part of raw.split(SPLIT_ARTISTS)) keyForms(part, set);
  return [...set];
}

export type SongKey = {
  // What the song is called (key text, the title half of "Artist — Title" answers, aliases).
  titles: Set<string>;
  // Who it is by, if the key says; empty means any artist will do.
  artists: Set<string>;
  // Whole answers a player may type: the text, aliases, "Artist Title" and "Title Artist".
  typed: Set<string>;
};
// "Noir Désir — Marlène" → { artist: "Noir Désir", title: "Marlène" }.
export function splitAnswer(answer: string) {
  const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(answer.trim());
  return m ? { artist: m[1], title: m[2] } : { title: answer.trim() };
}
// Keys come in two shapes: rounds set up before the search box have `answers`
// ["Artist — Title"] plus `text` (the title) and `aliases`; keys saved since have `text`
// (title), `artist` and `aliases`. Both work, so stored parties need no upgrade.
export function songKey(
  key: Secret | undefined,
  extraAliases: string[] = [],
): SongKey | null {
  if (!key) return null;
  const pairs: { artist?: string; title: string }[] = [];
  if (key.text)
    pairs.push({ title: key.text, artist: key.artist || undefined });
  for (const answer of key.answers ?? []) pairs.push(splitAnswer(answer));
  const aliases = [...(key.aliases ?? []), ...extraAliases];
  if (!pairs.length && !aliases.length) return null;
  const k: SongKey = {
    titles: new Set(),
    artists: new Set(),
    typed: new Set(),
  };
  for (const { title, artist } of pairs) {
    keyForms(title, k.titles);
    keyForms(title, k.typed);
    if (artist) {
      keyForms(artist, k.artists);
      keyForms(`${artist} ${title}`, k.typed);
      keyForms(`${title} ${artist}`, k.typed);
    }
  }
  for (const a of [...(key.answers ?? []), ...aliases]) keyForms(a, k.typed);
  for (const a of aliases) keyForms(a, k.titles);
  return k;
}

function byArtist(k: SongKey, artist: string | undefined) {
  if (!k.artists.size) return true;
  return !!artist && artistForms(artist).some((a) => k.artists.has(a));
}
// A song picked from the search: the right title, by the right artist when the key names
// one. A whole alias ("Noir Désir Marlène") matches too.
export function pickMatches(k: SongKey, song: Pick<Song, "title" | "artist">) {
  if (
    titleForms(song.title).some((t) => k.titles.has(t)) &&
    byArtist(k, song.artist)
  )
    return true;
  return [`${song.artist} ${song.title}`, `${song.title} ${song.artist}`].some(
    (s) => titleForms(s).some((t) => k.typed.has(t)),
  );
}
// Words people put between the artist and the title when typing both.
const SEPARATORS = /\s+(?:[-–—:|]|by|par|de|from)\s+|\s*[:|]\s*/gi;
// Typed by hand: the title, an accepted alias, or the artist and the title in either order,
// with or without a separator ("Noir Désir - Marlène", "Marlène de Noir Désir").
export function typedMatches(k: SongKey, value: string) {
  const text = value.trim();
  if (!text) return false;
  if (titleForms(text).some((t) => k.typed.has(t))) return true;
  for (const m of text.matchAll(SEPARATORS)) {
    const left = text.slice(0, m.index).trim(),
      right = text.slice(m.index! + m[0].length).trim();
    if (!left || !right) continue;
    if (
      pickMatches(k, { artist: left, title: right }) ||
      pickMatches(k, { artist: right, title: left })
    )
      return true;
  }
  return false;
}
// How the right song is written on the reveal: "Artist — Title".
export function songLabel(key: Secret | undefined) {
  if (!key) return "";
  if (key.artist && key.text) return `${key.artist} — ${key.text}`;
  return key.answers?.[0] ?? key.text ?? "";
}
// Cover art is shown on every phone and the TV, so only the catalogues' image hosts.
const COVER =
  /^https:\/\/(?:[a-z0-9-]+\.)*(?:dzcdn\.net|mzstatic\.com)\/[\w\-./%]+$/i;
export const isCover = (url: unknown): url is string =>
  typeof url === "string" && url.length <= 300 && COVER.test(url);
// A picked song as the client sent it, checked and trimmed; null if it isn't one.
export function cleanSong(raw: unknown): Song | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max
      ? v.trim()
      : null;
  const id = text(s.id, 40),
    title = text(s.title, 200),
    artist = text(s.artist, 200);
  if (!id || !title || !artist) return null;
  return { id, title, artist, ...(isCover(s.cover) ? { cover: s.cover } : {}) };
}
