import { env } from "party-runtime";
import type { Party } from "./types";
import { GameError } from "./engine";
import { parseRange } from "./range";
export function config(name: string): string {
  return String(
    (env as unknown as Record<string, unknown>)[name] ??
      process.env[name] ??
      "",
  );
}
export function supabase() {
  const url = config("SUPABASE_URL");
  const key = config("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? { url, key } : null;
}
export async function sb(path: string, init: RequestInit = {}) {
  const c = supabase();
  if (!c) throw new GameError("Supabase non configuré.", 503);
  const r = await fetch(`${c.url}${path}`, {
    ...init,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!r.ok) {
    console.error("Database error", r.status);
    throw new GameError("La base est momentanément indisponible.", 503);
  }
  return r;
}
export async function readParty(): Promise<{
  party: Party;
  version: number;
} | null> {
  if (supabase()) {
    const rows = (await (
      await sb("/rest/v1/parties?id=eq.main&select=data,version")
    ).json()) as { data: Party; version: number }[];
    return rows[0] ? { party: rows[0].data, version: rows[0].version } : null;
  }
  const row = await env.DB.prepare(
    "SELECT data,version FROM parties WHERE id=?",
  )
    .bind("main")
    .first<{ data: string; version: number }>();
  return row ? { party: JSON.parse(row.data), version: row.version } : null;
}
export async function insertParty(party: Party): Promise<boolean> {
  if (supabase()) {
    const r = await sb("/rest/v1/parties?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ id: "main", data: party, version: 0 }),
    });
    return ((await r.json()) as unknown[]).length > 0;
  }
  const r = await env.DB.prepare(
    "INSERT OR IGNORE INTO parties (id,data,version) VALUES (?,?,0)",
  )
    .bind("main", JSON.stringify(party))
    .run();
  return !!r.meta.changes;
}
async function cas(party: Party, version: number): Promise<boolean> {
  if (supabase()) {
    const result = await (
      await sb("/rest/v1/rpc/commit_party", {
        method: "POST",
        body: JSON.stringify({ expected_version: version, new_data: party }),
      })
    ).json();
    return result === true;
  }
  const r = await env.DB.prepare(
    "UPDATE parties SET data=?,version=version+1 WHERE id=? AND version=?",
  )
    .bind(JSON.stringify(party), "main", version)
    .run();
  return !!r.meta.changes;
}
export async function mutate(fn: (p: Party) => Promise<Party> | Party) {
  for (let retry = 0; retry < 12; retry++) {
    const current = await readParty();
    if (!current) throw new GameError("L’hôte prépare encore la fête.", 404);
    const next = await fn(current.party);
    if (await cas(next, current.version))
      return { party: next, version: current.version + 1 };
    // Spread simultaneous phone submissions instead of repeatedly colliding in lockstep.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(80, 3 * 2 ** retry) * (0.5 + Math.random())),
    );
  }
  throw new GameError("Tout le monde répond en même temps ! Réessaie.", 409);
}
export async function rateLimit(key: string, max = 60, windowMs = 60_000) {
  const bucket = Math.floor(Date.now() / windowMs);
  const rateKey = `${key}:${bucket}`;
  let count: number;
  if (supabase())
    count = (await (
      await sb("/rest/v1/rpc/hit_rate_limit", {
        method: "POST",
        body: JSON.stringify({
          bucket_key: rateKey,
          expiry: Date.now() + windowMs * 2,
        }),
      })
    ).json()) as number;
  else {
    const row = await env.DB.prepare(
      "INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
      .bind(rateKey, Date.now() + windowMs * 2)
      .first<{ count: number }>();
    count = row?.count ?? max + 1;
    if (Math.random() < 0.02)
      await env.DB.prepare("DELETE FROM rate_limits WHERE expires<?")
        .bind(Date.now())
        .run();
  }
  if (count > max)
    throw new GameError(
      "Doucement, le gâteau n’est pas encore parti. Réessaie dans une minute.",
      429,
    );
}
export async function putMedia(id: string, body: ArrayBuffer, type: string) {
  if (supabase())
    await sb(`/storage/v1/object/party-media/${id}`, {
      method: "POST",
      headers: { "Content-Type": type },
      body,
    });
  else await env.BUCKET.put(id, body, { httpMetadata: { contentType: type } });
}
export async function deleteMedia(id: string) {
  if (supabase())
    await sb(`/storage/v1/object/party-media/${id}`, { method: "DELETE" });
  else await env.BUCKET.delete(id);
}
// `range` is the request's Range header: audio is fetched in pieces so the
// player can seek straight to the blind-test section.
export async function getMedia(
  id: string,
  range?: string | null,
): Promise<Response> {
  const base = {
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  if (supabase()) {
    const r = await sb(`/storage/v1/object/party-media/${id}`, {
      headers: range ? { Range: range } : {},
    });
    const headers: Record<string, string> = {
      ...base,
      "Content-Type":
        r.headers.get("Content-Type") ?? "application/octet-stream",
    };
    for (const name of ["Content-Length", "Content-Range"]) {
      const v = r.headers.get(name);
      if (v) headers[name] = v;
    }
    return new Response(r.body, { status: r.status, headers });
  }
  const head = await env.BUCKET.head(id);
  if (!head) throw new GameError("Média introuvable.", 404);
  const type = head.httpMetadata?.contentType ?? "application/octet-stream";
  const part = parseRange(range, head.size);
  if (part === "unsatisfiable")
    return new Response(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${head.size}` },
    });
  const obj = await env.BUCKET.get(id, part ? { range: part } : undefined);
  if (!obj) throw new GameError("Média introuvable.", 404);
  if (!part)
    return new Response(obj.body, {
      headers: {
        ...base,
        "Content-Type": type,
        "Content-Length": String(head.size),
      },
    });
  return new Response(obj.body, {
    status: 206,
    headers: {
      ...base,
      "Content-Type": type,
      "Content-Length": String(part.length),
      "Content-Range": `bytes ${part.offset}-${part.offset + part.length - 1}/${head.size}`,
    },
  });
}

export function hasSitesBindings() {
  return !!env.DB;
}
