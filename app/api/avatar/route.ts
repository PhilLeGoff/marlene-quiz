import { actor, boundedBody, hash, sameOrigin } from "@/lib/game/auth";
import {
  deleteMedia,
  getMedia,
  mutate,
  putMedia,
  rateLimit,
  readParty,
} from "@/lib/game/store";
import { GameError, setPhoto } from "@/lib/game/engine";
import type { Role } from "@/lib/game/types";
export const dynamic = "force-dynamic";
// The client crops and scales the selfie before upload; this leaves room for an uncompressed PNG.
const MAX_BYTES = 1_500_000;
const signatures: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) =>
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function fail(e: unknown) {
  if (e instanceof GameError) return json({ error: e.message }, e.status);
  console.error("Avatar request failed", e);
  return json({ error: "La photo n’a pas pu être enregistrée." }, 500);
}
const roleOf = (req: Request): Role => {
  const role = new URL(req.url).searchParams.get("as");
  return role === "admin" || role === "marlene" ? role : "guest";
};
async function replacePhoto(playerId: string, photo: string | null) {
  let previous: string | undefined;
  await mutate((p) => {
    const result = setPhoto(p, playerId, photo);
    previous = result.previous;
    return result.party;
  });
  // Best effort: a leftover file is private and only costs storage.
  if (previous) await deleteMedia(previous).catch(() => {});
}
export async function GET(req: Request) {
  try {
    const current = await readParty();
    if (!current) throw new GameError("Fête introuvable.", 404);
    const p = current.party,
      url = new URL(req.url),
      id = url.searchParams.get("id");
    const a =
      (await actor(req, p, "admin")) ??
      (await actor(req, p, "marlene")) ??
      (await actor(req, p, "guest"));
    const projector = url.searchParams.get("room") === p.room;
    if (!a && !projector) throw new GameError("Connexion requise.", 401);
    // Only a current selfie is served, never another media ID passed in its place.
    if (!id || !p.players.some((x) => x.active && x.photo === id))
      throw new GameError("Photo introuvable.", 404);
    return await getMedia(id);
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    // Read the (bounded) upload before any check can answer early: an unread request body
    // makes the runtime stall the next request to this route.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES)
      throw new GameError("Photo trop lourde.", 413);
    const bytes = new Uint8Array(await boundedBody(req, MAX_BYTES));
    sameOrigin(req);
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for") ??
      "local";
    await rateLimit(`avatar:${await hash(ip)}`, 30);
    const current = await readParty();
    if (!current)
      throw new GameError("Entre ton nom pour commencer la fête.", 404);
    const a = await actor(req, current.party, roleOf(req));
    if (!a?.playerId) throw new GameError("Connecte-toi pour continuer.", 401);
    await rateLimit(`avatar:${a.playerId}`, 10);
    const type = req.headers.get("content-type") ?? "";
    const matches = signatures[type];
    if (!matches)
      throw new GameError("Formats acceptés : JPEG, PNG et WebP.", 415);
    if (!matches(bytes)) throw new GameError("Format d’image invalide.");
    const id = crypto.randomUUID();
    await putMedia(id, bytes.buffer, type);
    try {
      await replacePhoto(a.playerId, id);
    } catch (e) {
      await deleteMedia(id).catch(() => {});
      throw e;
    }
    return json({ photo: id });
  } catch (e) {
    return fail(e);
  }
}
// A player removes their own selfie; the host removes anyone's with ?as=admin&playerId=….
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const current = await readParty();
    if (!current) throw new GameError("Fête introuvable.", 404);
    const role = roleOf(req);
    const a = await actor(req, current.party, role);
    if (!a?.playerId) throw new GameError("Connecte-toi pour continuer.", 401);
    const target =
      role === "admin"
        ? (new URL(req.url).searchParams.get("playerId") ?? a.playerId)
        : a.playerId;
    await replacePhoto(target, null);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
