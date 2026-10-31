// The song catalogue behind the blind-test search box. Deezer's public search needs no key
// and allows 50 requests per 5 s per server; the iTunes Search API (also keyless, but about
// 20 requests a minute) takes over when Deezer fails. The search never sees the round's key.
import type { Role, Song } from "./types";
import { GameError } from "./engine";
import { fold, isCover } from "./song";
import { actor } from "./auth";
import { config, rateLimit, readParty } from "./store";

export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const MAX_RESULTS = 12;
// Trimmed, single-spaced and 2–80 characters; anything else is a 400.
export function songQuery(raw: string | null): string {
  const q = (raw ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (q.length < MIN_QUERY || q.length > MAX_QUERY)
    throw new GameError(
      `Tape entre ${MIN_QUERY} et ${MAX_QUERY} caractères.`,
      400,
    );
  return q;
}

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
function song(
  source: string,
  id: unknown,
  title: unknown,
  artist: unknown,
  cover: unknown,
): Song | null {
  const t = text(title),
    a = text(artist);
  if (!t || !a || typeof id !== "number") return null;
  return {
    id: `${source}:${id}`,
    title: t,
    artist: a,
    ...(isCover(cover) ? { cover } : {}),
  };
}
export function fromDeezer(body: unknown): Song[] {
  const data = (body as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) throw new Error("Unexpected Deezer response");
  return data
    .map((r) => {
      const x = r as {
        id?: number;
        title?: string;
        artist?: { name?: string };
        album?: { cover_small?: string };
      };
      return song("dz", x.id, x.title, x.artist?.name, x.album?.cover_small);
    })
    .filter((x): x is Song => !!x);
}
export function fromItunes(body: unknown): Song[] {
  const data = (body as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(data)) throw new Error("Unexpected iTunes response");
  return data
    .map((r) => {
      const x = r as {
        trackId?: number;
        trackName?: string;
        artistName?: string;
        artworkUrl60?: string;
      };
      return song("it", x.trackId, x.trackName, x.artistName, x.artworkUrl60);
    })
    .filter((x): x is Song => !!x);
}
// The same recording appears on several albums: keep the first of each artist + title.
export function dedupe(songs: Song[]) {
  const seen = new Set<string>();
  return songs
    .filter((s) => {
      const k = `${fold(s.artist)}|${fold(s.title)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_RESULTS);
}

type Fetch = typeof fetch;
const sources: [string, (q: string) => string, (b: unknown) => Song[]][] = [
  [
    "deezer",
    (q) => `https://api.deezer.com/search?limit=25&q=${encodeURIComponent(q)}`,
    fromDeezer,
  ],
  [
    "itunes",
    (q) =>
      `https://itunes.apple.com/search?entity=song&limit=25&country=FR&term=${encodeURIComponent(q)}`,
    fromItunes,
  ],
];
// Asks Deezer, then iTunes; throws only if both fail. An empty list is a valid answer.
export async function searchCatalogue(
  q: string,
  get: Fetch = fetch,
): Promise<Song[]> {
  let failure: unknown;
  for (const [name, url, parse] of sources) {
    try {
      const r = await get(url(q), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) throw new Error(`${name} answered ${r.status}`);
      const body = (await r.json()) as { error?: unknown };
      // Deezer reports quota and other errors with a 200 and an `error` object.
      if (body?.error) throw new Error(`${name} error`);
      return dedupe(parse(body));
    } catch (e) {
      failure = e;
      console.error("Song search failed", name, String(e));
    }
  }
  throw failure;
}

// Browser tests never reach a real catalogue: the e2e server sets SONG_SEARCH_FIXTURE=1 and
// searches this list instead (every typed word must appear in "artist title").
export const fixtureSongs: Song[] = [
  { id: "fx:1", artist: "Noir Désir", title: "Marlène" },
  { id: "fx:2", artist: "Noir Désir", title: "Le vent nous portera" },
  { id: "fx:3", artist: "Noir Désir", title: "Marlène (Live)" },
  { id: "fx:4", artist: "Måneskin", title: "L'altra dimensione" },
  { id: "fx:5", artist: "Måneskin", title: "Beggin'" },
  { id: "fx:6", artist: "Jive Me", title: "120 BPM" },
  { id: "fx:7", artist: "Jive Me", title: "120 BPM (Version extrême)" },
  { id: "fx:8", artist: "Indochine", title: "L'Aventurier" },
  { id: "fx:9", artist: "Téléphone", title: "Cendrillon" },
  { id: "fx:10", artist: "Louise Attaque", title: "J't'emmène au vent" },
  { id: "fx:11", artist: "17 Hippies", title: "Marlène" },
];
export function searchFixture(q: string): Song[] {
  const words = q.split(" ").map(fold).filter(Boolean);
  return fixtureSongs
    .filter((s) => {
      const hay = fold(`${s.artist} ${s.title}`);
      return words.every((w) => hay.includes(w));
    })
    .slice(0, MAX_RESULTS);
}

// Recent searches, per worker isolate: several guests type the same first letters.
const CACHE_MS = 10 * 60_000,
  CACHE_SIZE = 300;
const cache = new Map<string, { at: number; songs: Song[] }>();
function cached(q: string) {
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.songs;
  cache.delete(q);
  return null;
}
function remember(q: string, songs: Song[]) {
  cache.set(q, { at: Date.now(), songs });
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}
export function clearSongCache() {
  cache.clear();
}
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
// GET /api/songs?q=… for a signed-in guest (or ?as=admin / ?as=marlene): { songs: Song[] }.
// 502 with an empty list when no catalogue answers, so the phone offers the typed answer.
export async function handleSongSearch(
  req: Request,
  get: Fetch = fetch,
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const q = songQuery(url.searchParams.get("q"));
    const as = url.searchParams.get("as");
    const role: Role = as === "admin" || as === "marlene" ? as : "guest";
    const current = await readParty();
    const a = current && (await actor(req, current.party, role));
    if (!a?.playerId) throw new GameError("Connecte-toi pour continuer.", 401);
    await rateLimit(`songs:${a.playerId}`, 90);
    if (config("SONG_SEARCH_FIXTURE") === "1")
      return reply({ songs: searchFixture(q) });
    const key = q.toLocaleLowerCase("fr");
    let songs = cached(key);
    if (!songs) {
      try {
        songs = await searchCatalogue(q, get);
      } catch {
        return reply(
          { songs: [], error: "La recherche de chansons ne répond pas." },
          502,
        );
      }
      remember(key, songs);
    }
    return reply({ songs });
  } catch (e) {
    if (e instanceof GameError) return reply({ error: e.message }, e.status);
    console.error("Song search request failed", e);
    return reply({ error: "La recherche a fait un couac." }, 500);
  }
}
