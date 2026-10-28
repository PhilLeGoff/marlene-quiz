import { actor } from "@/lib/game/auth";
import { getMedia, readParty } from "@/lib/game/store";
import { REVEALED } from "@/lib/game/types";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const current = await readParty();
  if (!current) return new Response(null, { status: 404 });
  const p = current.party,
    url = new URL(req.url),
    id = url.searchParams.get("id");
  const a =
    (await actor(req, p, "admin")) ??
    (await actor(req, p, "marlene")) ??
    (await actor(req, p, "guest"));
  const subs = p.submissions[p.roundId] ?? [];
  const sub = subs.find((s) => s.drawingId === id && !s.moderated);
  const canRead =
    a?.role === "admin" ||
    a?.playerId === sub?.playerId ||
    ((!!a || url.searchParams.get("room") === p.room) &&
      (p.phase === "voting_open" || REVEALED.includes(p.phase)));
  if (!id || !sub || !canRead) return new Response(null, { status: 403 });
  return getMedia(id);
}
