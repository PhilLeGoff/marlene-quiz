import {
  actor,
  boundedBody,
  hash,
  password,
  sameOrigin,
  sessionCookie,
  token,
  verify,
} from "@/lib/game/auth";
import {
  config,
  insertParty,
  mutate,
  rateLimit,
  readParty,
  putMedia,
  hasSitesBindings,
} from "@/lib/game/store";
import { GameError, reduce, view, validateStrokes } from "@/lib/game/engine";
import { createParty } from "@/lib/game/seed";
import type { Actor, Command, Role } from "@/lib/game/types";
export const dynamic = "force-dynamic";
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const roleOf = (req: Request): Role => {
  const role = new URL(req.url).searchParams.get("as");
  return role === "admin" || role === "marlene" ? role : "guest";
};
function setupAvailable(req: Request) {
  return !!(
    config("SETUP_KEY") ||
    (hasSitesBindings() && req.headers.get("oai-authenticated-user-id")) ||
    process.env.NODE_ENV === "development"
  );
}
function enrich<T extends object>(data: T) {
  const url = config("SUPABASE_URL"),
    key = config("SUPABASE_ANON_KEY");
  return url && key ? { ...data, realtime: { url, key } } : data;
}
function fail(e: unknown) {
  if (e instanceof GameError) return json({ error: e.message }, e.status);
  console.error("Game request failed", e);
  return json(
    { error: "Un petit couac dans les confettis. Réessaie dans un instant." },
    500,
  );
}
export async function GET(req: Request) {
  try {
    let current = await readParty();
    if (
      current &&
      current.party.consent &&
      Date.now() - current.party.consentAt > 7200000
    ) {
      current = await mutate((p) =>
        reduce(
          p,
          { role: "marlene" },
          { id: crypto.randomUUID(), action: "withdraw" },
        ),
      );
    }
    if (!current)
      return json({ initialized: false, setupAvailable: setupAvailable(req) });
    let a = await actor(req, current.party, roleOf(req));
    const url = new URL(req.url);
    if (
      !a &&
      url.searchParams.get("present") === "1" &&
      url.searchParams.get("room") === current.party.room
    )
      a = { role: "present" };
    const data = view(current.party, a, current.version);
    if (
      current.party.questions[current.party.index]?.kind === "drawing" &&
      current.party.secrets[current.party.questions[current.party.index].id]
        ?.prompt &&
      a
    )
      data.answer = {
        prompt:
          current.party.secrets[current.party.questions[current.party.index].id]
            .prompt,
      };
    const cursor = url.searchParams.get("cursor");
    if (cursor && url.searchParams.get("round") === data.roundId) {
      const i = data.strokes.findIndex((s) => s.id === cursor);
      if (i >= 0) {
        data.strokes = data.strokes.slice(i + 1);
        return json(enrich({ ...data, strokesMode: "append" }));
      }
    }
    return json(enrich(data));
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for") ??
      "local";
    if (Number(req.headers.get("content-length") ?? 0) > 2_000_000)
      throw new GameError("Requête trop volumineuse.", 413);
    let body: Command;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await boundedBody(req)),
      ) as Command;
    } catch (e) {
      if (e instanceof GameError) throw e;
      throw new GameError("Requête JSON invalide.");
    }
    if (!body || typeof body.action !== "string")
      throw new GameError("Action manquante.");
    await rateLimit(`request:${await hash(ip)}`, 2000);
    const role = roleOf(req);
    if (body.action === "setup") {
      await rateLimit(`auth:${await hash(ip)}`, 8);
      if (await readParty())
        throw new GameError("La fête est déjà créée.", 409);
      if (!setupAvailable(req))
        throw new GameError(
          "Configure SETUP_KEY sur le serveur pour créer la fête.",
          403,
        );
      if (config("SETUP_KEY") && body.setupKey !== config("SETUP_KEY"))
        throw new GameError("Clé d’installation incorrecte.", 403);
      const adminPassword = String(body.adminPassword ?? ""),
        starPassword = String(body.starPassword ?? "");
      if (
        adminPassword.length < 12 ||
        starPassword.length < 12 ||
        adminPassword === starPassword
      )
        throw new GameError(
          "Choisis deux mots de passe différents, de 12 caractères minimum.",
        );
      const credentials = {
        admin: await password(adminPassword),
        marlene: await password(starPassword),
      };
      const p = createParty(
        String(
          (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000,
        ),
        credentials,
      );
      const t = token();
      p.sessions[await hash(t)] = {
        role: "admin",
        expires: Date.now() + 2592000000,
      };
      if (!(await insertParty(p)))
        throw new GameError("La fête est déjà créée.", 409);
      return json(view(p, { role: "admin" }, 0), 200, {
        "Set-Cookie": sessionCookie(req, "admin", t),
      });
    }
    const current = await readParty();
    if (!current) throw new GameError("L’hôte prépare encore la fête.", 404);
    if (body.action === "login") {
      await rateLimit(`auth:${await hash(ip)}`, 8);
      if (role !== "admin" && role !== "marlene")
        throw new GameError("Rôle invalide.");
      if (
        !(await verify(
          String(body.password ?? ""),
          current.party.credentials[role],
        ))
      )
        throw new GameError("Mot de passe incorrect.", 403);
      const t = token(),
        key = await hash(t);
      const result = await mutate((p) => {
        p.sessions[key] = { role, expires: Date.now() + 2592000000 };
        return p;
      });
      return json(view(result.party, { role }, result.version), 200, {
        "Set-Cookie": sessionCookie(req, role, t),
      });
    }
    let a = await actor(req, current.party, role);
    if (body.action === "logout") {
      const t = cookieValue(req, role);
      if (t) {
        const key = await hash(t);
        await mutate((p) => {
          delete p.sessions[key];
          return p;
        });
      }
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie(req, role, "", true),
      });
    }
    if (body.action === "join") {
      await rateLimit(`join:${await hash(ip)}`, 30);
      if (body.room !== current.party.room)
        throw new GameError("Ce code de salle n’est pas le bon.");
      if (a?.role === "guest")
        return json(view(current.party, a, current.version));
      const t = token(),
        key = await hash(t),
        guest: Actor = { role: "guest", playerId: crypto.randomUUID() };
      const result = await mutate((p) => {
        const next = reduce(p, guest, body);
        next.sessions[key] = { ...guest, expires: Date.now() + 2592000000 };
        return next;
      });
      return json(view(result.party, guest, result.version), 200, {
        "Set-Cookie": sessionCookie(req, "guest", t),
      });
    }
    if (!a) throw new GameError("Connecte-toi pour continuer.", 401);
    const authenticated = a;
    await rateLimit(
      `actor:${authenticated.playerId ?? role}:${body.action === "stroke" ? "draw" : "control"}`,
      body.action === "stroke" ? 400 : 180,
    );
    let drawingId: string | undefined;
    if (
      body.action === "submit" &&
      current.party.questions[current.party.index]?.kind === "drawing"
    ) {
      validateStrokes(body.value);
      drawingId = crypto.randomUUID();
      await putMedia(
        drawingId,
        new TextEncoder().encode(JSON.stringify(body.value))
          .buffer as ArrayBuffer,
        "application/json",
      );
    }
    const result = await mutate(async (p) => {
      const live = await actor(req, p, role);
      if (!live) throw new GameError("Session expirée.", 401);
      const next = reduce(p, live, body);
      if (drawingId && !p.requests.includes(body.id)) {
        const sub = next.submissions[next.roundId]?.find(
          (s) => s.playerId === live.playerId,
        );
        if (sub) {
          sub.drawingId = drawingId;
          sub.value = [];
        }
      }
      return next;
    });
    return json(enrich(view(result.party, authenticated, result.version)));
  } catch (e) {
    return fail(e);
  }
}
function cookieValue(req: Request, role: Role) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`marlene_${role}=`))
    ?.split("=")[1];
}
