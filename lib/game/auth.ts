import type { Actor, Party, Role } from "./types";
import { GameError } from "./engine";
import { config } from "./store";
import { MARLENE_PIN, isPin } from "./vip";
const enc = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export const token = () => crypto.randomUUID() + crypto.randomUUID();
export async function hash(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}
export async function requireAdminPassword(value: unknown) {
  const secret = config("ADMIN_PASSWORD");
  if (!secret)
    throw new GameError(
      "Le mot de passe administrateur doit être configuré sur le serveur.",
      503,
    );
  const expected = await hash(secret),
    given = await hash(typeof value === "string" ? value : "");
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  if (difference !== 0)
    throw new GameError("Mot de passe administrateur incorrect.", 401);
  return expected;
}
export async function requireMarlenePin(value: unknown, pin = MARLENE_PIN) {
  const expected = await hash(`marlene-pin-v1:${pin}`);
  const given = await hash(
    `marlene-pin-v1:${typeof value === "string" ? value : ""}`,
  );
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  if (!isPin(value) || difference !== 0)
    throw new GameError("Code PIN incorrect. Réessaie, Votre Majesté !", 401);
  return expected;
}
export function cookie(req: Request, role: Role) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`marlene_${role}=`))
    ?.split("=")[1];
}
export async function actor(
  req: Request,
  p: Party,
  role: Role = "guest",
  identityOnly = false,
): Promise<Actor | null> {
  const t = cookie(req, role);
  if (!t) return null;
  const s = p.sessions[await hash(t)];
  if (!s || s.expires < Date.now() || s.role !== role) return null;
  if (!s.playerId || !p.players.some((x) => x.id === s.playerId && x.active))
    return null;
  if (role === "admin" && !identityOnly) {
    const secret = config("ADMIN_PASSWORD");
    if (!secret || s.adminProof !== (await hash(secret))) return null;
  }
  if (role === "marlene" && !identityOnly) {
    const pin = p.vipPin ?? MARLENE_PIN;
    if (s.marleneProof !== (await hash(`marlene-pin-v1:${pin}`))) return null;
  }
  return { role: s.role, playerId: s.playerId };
}
export function sessionCookie(
  req: Request,
  role: Role,
  t: string,
  remove = false,
) {
  const secure = new URL(req.url).protocol === "https:";
  return `marlene_${role}=${remove ? "" : t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${remove ? 0 : 2592000}${secure ? "; Secure" : ""}`;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin)
    throw new GameError("Origine de requête non autorisée.", 403);
}
export async function boundedBody(
  req: Request,
  max = 2_000_000,
): Promise<ArrayBuffer> {
  const reader = req.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new GameError("Requête trop volumineuse.", 413);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}
