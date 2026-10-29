import {
  actor,
  requireAdminPassword,
  boundedBody,
  hash,
  sameOrigin,
  sessionCookie,
  token,
} from "@/lib/game/auth";
import {
  config,
  insertParty,
  mutate,
  rateLimit,
  readParty,
  putMedia,
} from "@/lib/game/store";
import {
  GameError,
  reduce,
  view,
  validateStrokes,
  nicknameKey,
} from "@/lib/game/engine";
import { createParty, applySuppliedAnswers } from "@/lib/game/seed";
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
    if(current&&applySuppliedAnswers(current.party)!==current.party)current=await mutate(p=>applySuppliedAnswers(p));
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
    if (!current) return json({ initialized: false });
    let a = await actor(req, current.party, roleOf(req));
    const url = new URL(req.url);
    if (url.searchParams.get("present") === "1") a = { role: "present" };
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
    if (["join", "login", "setup"].includes(body.action)) {
      await rateLimit(`join:${await hash(ip)}`, 120);
      let adminProof: string | undefined;
      if (role === "admin") {
        await rateLimit(`admin-auth:${await hash(ip)}`, 12);
        adminProof = await requireAdminPassword(body.password);
      }
      // Everyone can start or enter the party with a name. Initialization is race-safe.
      if (!(await readParty()))
        await insertParty(
          createParty(
            String(
              (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000,
            ),
            { admin: "", marlene: "" },
          ),
        );
      const t = token(),
        key = await hash(t),
        freshId = crypto.randomUUID();
      let joined: Actor = { role, playerId: freshId };
      const result = await mutate(async (p) => {
        p=applySuppliedAnswers(p);
        const own = [];
        for (const r of ["guest", "admin", "marlene"] as const) {
          const a = await actor(req, p, r, true);
          if (a?.playerId) own.push(a);
        }
        const matching = own.find(
          (a) =>
            nicknameKey(
              p.players.find((x) => x.id === a.playerId)!.nickname,
            ) === nicknameKey(String(body.nickname ?? "")),
        );
        const current = own.find((a) => a.role === role);
        joined = {
          role,
          playerId: matching?.playerId ?? current?.playerId ?? freshId,
        };
        // Expired sessions do not reserve names forever.
        for (const player of p.players)
          if (
            !Object.values(p.sessions).some(
              (s) => s.playerId === player.id && s.expires > Date.now(),
            )
          )
            player.active = false;
        const next = reduce(p, joined, { ...body, action: "join" });
        next.credentials = { admin: "", marlene: "" };
        for (const [oldKey, session] of Object.entries(next.sessions))
          if (session.role === role && session.playerId === joined.playerId)
            delete next.sessions[oldKey];
        next.sessions[key] = {
          ...joined,
          expires: Date.now() + 2592000000,
          ...(adminProof ? { adminProof } : {}),
        };
        return next;
      });
      return json(enrich(view(result.party, joined, result.version)), 200, {
        "Set-Cookie": sessionCookie(req, role, t),
      });
    }
    const current = await readParty();
    if (!current)
      throw new GameError("Entre ton nom pour commencer la fête.", 404);
    let a = await actor(req, current.party, role);
    if (body.action === "logout") {
      const t = cookieValue(req, role);
      if (t) {
        const key = await hash(t);
        await mutate((p) => {
          const session = p.sessions[key];
          for (const [oldKey, value] of Object.entries(p.sessions))
            if (
              oldKey === key ||
              (session?.playerId && value.playerId === session.playerId)
            )
              delete p.sessions[oldKey];
          if (
            session?.playerId &&
            !Object.values(p.sessions).some(
              (s) => s.playerId === session.playerId && s.expires > Date.now(),
            )
          ) {
            const player = p.players.find((x) => x.id === session.playerId);
            if (player) player.active = false;
          }
          return p;
        });
      }
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie(req, role, "", true),
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
        p=applySuppliedAnswers(p);
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
