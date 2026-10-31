import { actor, boundedBody, sameOrigin } from "@/lib/game/auth";
import { getMedia, putMedia, rateLimit, readParty } from "@/lib/game/store";
import { GameError } from "@/lib/game/engine";
export const dynamic = "force-dynamic";
const error = (e: unknown) =>
  Response.json(
    {
      error:
        e instanceof GameError ? e.message : "Le média n’a pas pu être chargé.",
    },
    { status: e instanceof GameError ? e.status : 500 },
  );
export async function GET(req: Request) {
  try {
    const current = await readParty();
    if (!current) throw new GameError("Fête introuvable.", 404);
    const p = current.party;
    const url = new URL(req.url);
    const a =
      (await actor(req, p, "admin")) ??
      (await actor(req, p, "marlene")) ??
      (await actor(req, p, "guest"));
    const projector = url.searchParams.get("room") === p.room;
    if (!a && !projector) throw new GameError("Connexion requise.", 401);
    const id = url.searchParams.get("id") ?? "";
    if (!/^[a-zA-Z0-9-]{36}$/.test(id))
      throw new GameError("Identifiant invalide.");
    const currentQ = p.questions[p.index];
    if (a?.role !== "admin" && !currentQ?.media.some((x) => x.includes(id)))
      throw new GameError("Média non disponible.", 403);
    return await getMedia(id, req.headers.get("Range"));
  } catch (e) {
    return error(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const current = await readParty();
    if (!current || !(await actor(req, current.party, "admin")))
      throw new GameError("Réservé à l’hôte.", 403);
    await rateLimit("upload", 20);
    if (Number(req.headers.get("content-length") ?? 0) > 10_000_000)
      throw new GameError("Maximum : 8 Mo.", 413);
    const raw = await boundedBody(req, 10_000_000);
    const data = await new Response(raw, {
      headers: { "Content-Type": req.headers.get("Content-Type") ?? "" },
    }).formData();
    const file = data.get("file");
    if (!(file instanceof File) || file.size > 8 * 1024 * 1024)
      throw new GameError("Choisis un fichier de moins de 8 Mo.");
    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
        "audio/x-wav",
      ].includes(file.type)
    )
      throw new GameError(
        "Formats acceptés : PNG, JPEG, WebP, MP3, WAV, OGG et M4A.",
      );
    const bytes = await file.arrayBuffer();
    const b = new Uint8Array(bytes);
    const head = String.fromCharCode(...b.slice(0, 12));
    if (
      file.type.startsWith("image/") &&
      !(
        (b[0] === 0x89 && head.includes("PNG")) ||
        (b[0] === 0xff && b[1] === 0xd8) ||
        (head.startsWith("RIFF") && head.includes("WEBP"))
      )
    )
      throw new GameError("Format d’image invalide.");
    const id = crypto.randomUUID();
    await putMedia(id, bytes, file.type);
    return Response.json({ url: `/api/media?id=${id}` });
  } catch (e) {
    return error(e);
  }
}
