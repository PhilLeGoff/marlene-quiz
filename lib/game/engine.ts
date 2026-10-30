import type {
  Actor,
  Command,
  Party,
  Question,
  RankedPlayer,
  Secret,
  Stroke,
  Submission,
  View,
} from "./types";
import { OPEN, REVEALED } from "./types";
import { PIN_LENGTH, isMarleneName, isPin, nicknameKey } from "./vip";
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function must(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new GameError(message, status);
}
export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]/g, "");
}
export function correct(
  q: Question,
  key: Secret | undefined,
  value: Submission["value"],
): boolean | null {
  if (!q.confirmed || !key) return null;
  if (["creative", "drawing", "reveal"].includes(q.kind)) return null;
  if (q.kind === "number")
    return typeof value === "number" && key.number !== undefined
      ? Math.abs(value - key.number) <= q.tolerance
      : null;
  if (
    ["multi", "outfit", "photo", "choice"].includes(q.kind) ||
    (q.kind === "blind" && q.options.length > 0)
  ) {
    if (!key.answers?.length) return null;
    const values: unknown[] = Array.isArray(value) ? value : [value];
    return (
      values.length === key.answers.length &&
      key.answers.every((a) => values.includes(a))
    );
  }
  if (!key.text) return null;
  if (q.kind === "pin") return String(value) === key.text;
  return [key.text, ...(key.aliases ?? []), ...q.aliases].some(
    (a) => normalize(a) === normalize(String(value)),
  );
}
export { nicknameKey };
// Not a `reduce` command: only /api/avatar may set a photo, after storing the uploaded image,
// so a client can't point its avatar at another media ID (a drawing, a blind-test clip).
export function setPhoto(
  original: Party,
  playerId: string,
  photo: string | null,
): { party: Party; previous?: string } {
  const s = structuredClone(original);
  const player = s.players.find((p) => p.id === playerId);
  must(player, "Invité introuvable.", 404);
  const previous = player.photo;
  if (photo) player.photo = photo;
  else delete player.photo;
  return { party: s, previous };
}
export function leaderboard(s: Party): RankedPlayer[] {
  const rows = s.players
    .filter((p) => p.active && (!p.role || p.role === "guest"))
    .map((p) => {
      const events = s.events.filter(
        (e) => e.playerId === p.id && e.generation === s.generation,
      );
      const revokedRounds = new Set(
        events
          .filter((e) => e.id.startsWith("moderate-"))
          .map((e) => e.roundId),
      );
      const validCorrect = events.filter(
        (e) => e.correct && !e.adjustment && !revokedRounds.has(e.roundId),
      );
      return {
        ...p,
        score: events.reduce((v, e) => v + e.delta, 0),
        correctCount: validCorrect.length,
        correctTime: validCorrect.reduce((v, e) => v + e.elapsed, 0),
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.correctCount - a.correctCount ||
        a.correctTime - b.correctTime ||
        a.joinedAt - b.joinedAt,
    );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank =
      prev &&
      prev.score === r.score &&
      prev.correctCount === r.correctCount &&
      prev.correctTime === r.correctTime
        ? prev.rank
        : i + 1;
  });
  return rows;
}
function award(
  s: Party,
  playerId: string,
  delta: number,
  now: number,
  reason: string,
  isCorrect = false,
  elapsed = 0,
  adjustment = false,
  eventId?: string,
) {
  const id = eventId ?? `${s.roundId}:${playerId}`;
  if (s.events.some((e) => e.id === id)) return;
  s.events.push({
    id,
    roundId: s.roundId,
    questionId: s.questions[s.index]?.id ?? "",
    playerId,
    delta,
    correct: isCorrect,
    elapsed,
    reason,
    at: now,
    adjustment,
    generation: s.generation,
  });
}
function scoreRound(s: Party, now: number) {
  const q = s.questions[s.index];
  if (["pictionary", "drawing", "creative", "reveal"].includes(q.kind)) return;
  for (const sub of s.submissions[s.roundId] ?? []) {
    if (sub.moderated) continue;
    const result = correct(q, s.secrets[q.id], sub.value);
    if (result === null) continue;
    if (q.slider && typeof sub.value === "number") {
      const { delta, reason } = sliderScore(
        q.slider,
        q.unit,
        s.secrets[q.id].number!,
        sub.value,
      );
      award(s, sub.playerId, delta, now, reason, result, sub.elapsed);
    } else if (MULTI_SELECT.includes(q.kind) && Array.isArray(sub.value)) {
      const { delta, reason } = optionScore(
        s.secrets[q.id].answers!,
        sub.value as string[],
      );
      award(s, sub.playerId, delta, now, reason, result, sub.elapsed);
    } else
      award(
        s,
        sub.playerId,
        result ? 1 : -1,
        now,
        result ? "Bonne réponse" : "Mauvaise réponse",
        result,
        sub.elapsed,
      );
  }
}
// Slider rounds reward closeness: 5 points for the exact value, one less per step off
// (per cm for the height), going negative for wild guesses.
export const SLIDER_POINTS = 5;
export function sliderScore(
  slider: NonNullable<Question["slider"]>,
  unit: string,
  key: number,
  value: number,
) {
  const off = Math.round(Math.abs(value - key) / slider.step);
  return {
    delta: SLIDER_POINTS - off,
    reason: off ? `${off * slider.step} ${unit} d’écart` : "Pile poil !",
  };
}
// Multi-select rounds score each ticked option: +1 if it is a right answer, −1 if not.
// Leaving an option unticked costs nothing; `correct` still means the exact set, for tie-breaks.
const MULTI_SELECT: Question["kind"][] = ["multi", "outfit", "photo"];
export function optionScore(answers: string[], picked: string[]) {
  const right = picked.filter((v) => answers.includes(v)).length,
    wrong = picked.length - right;
  const s = (n: number) => (n > 1 ? "s" : "");
  return {
    delta: right - wrong,
    reason:
      [
        right && `${right} bonne${s(right)} réponse${s(right)}`,
        wrong && `${wrong} mauvaise${s(wrong)} réponse${s(wrong)}`,
      ]
        .filter(Boolean)
        .join(", ") || "Aucune réponse cochée",
  };
}
export function validateStrokes(value: unknown): Stroke[] {
  must(Array.isArray(value) && value.length <= 400, "Dessin trop volumineux.");
  let total = 0;
  for (const st of value) {
    must(
      st &&
        typeof st.id === "string" &&
        st.id.length <= 80 &&
        /^#[a-f0-9]{6}$/i.test(st.color) &&
        Number.isFinite(st.size) &&
        st.size >= 1 &&
        st.size <= 40 &&
        Array.isArray(st.points) &&
        st.points.length <= 3000,
      "Trait invalide.",
    );
    total += st.points.length;
    must(total <= 25000, "Dessin trop détaillé.");
    for (const p of st.points)
      must(
        Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          p.x >= 0 &&
          p.x <= 1 &&
          p.y >= 0 &&
          p.y <= 1,
        "Point invalide.",
      );
  }
  return value;
}
function start(s: Party, now: number) {
  const q = s.questions[s.index];
  s.startedAt = now;
  s.deadline = now + q.duration * 1000;
  s.strokes = [];
  s.winner = undefined;
  s.revealAllowed = false;
  s.audio = { playing: false, at: now, offset: q.clipStart };
  s.phase =
    q.kind === "drawing"
      ? s.secrets[q.id]?.prompt
        ? "drawing_open"
        : "waiting_for_marlene_answer"
      : q.kind === "pictionary"
        ? s.secrets[q.id]?.text
          ? "pictionary_live"
          : "waiting_for_marlene_answer"
        : "question_open";
  if (s.phase === "waiting_for_marlene_answer") s.deadline = 0;
}
// Rounds the server can mark on its own: no vote, no host or Marlène judgment, and a known key.
function autoScored(s: Party, q: Question) {
  return (
    !["drawing", "creative", "reveal", "pictionary"].includes(q.kind) &&
    correct(q, s.secrets[q.id], q.kind === "number" ? 0 : "") !== null
  );
}
// Closing a round the server can mark goes straight to the answer and the points;
// the others wait for the host (vote, validation, or a key still to confirm).
function closeRound(s: Party, now: number) {
  const q = s.questions[s.index];
  s.phase =
    q.kind === "drawing" ? "drawing_submissions_closed" : "submissions_closed";
  s.deadline = 0;
  s.audio.playing = false;
  if (autoScored(s, q)) {
    scoreRound(s, now);
    s.phase = "reveal";
  }
}
// Pictionary and the PIN bonus allow several tries, so a first answer doesn't end them.
function everyoneAnswered(s: Party) {
  const q = s.questions[s.index];
  if (q.kind === "pictionary" || q.kind === "pin") return false;
  const answered = new Set(
    (s.submissions[s.roundId] ?? []).map((x) => x.playerId),
  );
  const guests = s.players.filter(
    (p) => p.active && (!p.role || p.role === "guest"),
  );
  return guests.length > 0 && guests.every((p) => answered.has(p.id));
}
function publicQuestion(q: Question): Question {
  return {
    id: q.id,
    source: q.source,
    title: q.title,
    kind: q.kind,
    options: q.options,
    generated: [],
    enabled: q.enabled,
    confirmed: q.confirmed,
    duration: q.duration,
    tolerance: q.tolerance,
    unit: q.unit,
    note: q.sensitive
      ? "Facultatif. Tu peux passer sans pénalité."
      : q.kind === "number"
        ? q.note
        : "",
    aliases: [],
    bonus: q.bonus,
    attempts: q.attempts,
    sensitive: q.sensitive,
    media: q.media,
    clipStart: q.clipStart,
    clipEnd: q.clipEnd,
    slider: q.slider,
  };
}
export function view(
  s: Party,
  actor: Actor | null,
  version: number,
  now = Date.now(),
): View {
  const q = s.questions[s.index];
  const revealed = REVEALED.includes(s.phase) && !s.finishedEarly;
  const subs = s.submissions[s.roundId] ?? [];
  const me = subs.find((x) => x.playerId === actor?.playerId);
  const gallery =
    [
      "voting_open",
      "winner_revealed",
      "reveal",
      "leaderboard",
      "finished",
    ].includes(s.phase) &&
    q?.kind === "drawing" &&
    !s.finishedEarly
      ? subs
          .filter((x) => !x.moderated)
          .map((x) => ({
            id: x.id,
            strokes: x.value as Stroke[],
            drawingUrl: x.drawingId
              ? `/api/drawing?id=${x.drawingId}&room=${s.room}`
              : undefined,
            ...(revealed
              ? { artist: s.players.find((p) => p.id === x.playerId)?.nickname }
              : {}),
          }))
      : [];
  const v: View = {
    initialized: true,
    role: actor?.role ?? null,
    playerId: actor?.playerId,
    room: s.room,
    version,
    phase: s.phase,
    index: s.index,
    total: s.questions.filter((q) => q.enabled).length,
    roundId: s.roundId,
    deadline: s.deadline,
    players: leaderboard(s),
    question: q && actor ? publicQuestion(q) : null,
    submitted: !!me,
    mySubmission: me,
    submissionCount: subs.filter((x) => !x.moderated).length,
    gallery,
    strokes: actor ? s.strokes : [],
    winner: revealed ? s.winner : undefined,
    audio: s.audio,
    serverTime: now,
  };
  if (q && revealed && actor) v.answer = s.secrets[q.id];
  if (revealed && actor?.playerId) {
    const result = s.events.filter(
      (e) =>
        e.roundId === s.roundId &&
        e.playerId === actor.playerId &&
        e.generation === s.generation,
    );
    if (result.length)
      v.result = {
        delta: result.reduce((n, e) => n + e.delta, 0),
        correct: result[0].correct,
        reason: result.at(-1)!.reason,
      };
  }
  if (q?.kind === "drawing" && actor && s.secrets[q.id]?.prompt)
    v.answer = { prompt: s.secrets[q.id].prompt };
  if (actor?.role === "admin") {
    v.questions = s.questions;
    v.secrets = s.secrets;
    v.submissions = subs;
    v.events = s.events.filter((event) => event.generation === s.generation);
    v.consent = s.consent;
    v.revealAllowed = s.revealAllowed;
  }
  if (actor?.role === "marlene") {
    v.questions = s.questions;
    v.secrets = s.secrets;
    v.consent = s.consent;
    v.revealAllowed = s.revealAllowed;
    if (q?.kind === "creative")
      v.submissions = subs
        .filter((x) => !x.moderated)
        .map((x) => ({ ...x, playerId: "" }));
  }
  return v;
}
export function reduce(
  original: Party,
  actor: Actor,
  cmd: Command,
  now = Date.now(),
): Party {
  must(
    typeof cmd.id === "string" && cmd.id.length >= 8 && cmd.id.length <= 100,
    "Identifiant de requête manquant.",
  );
  if (original.requests.includes(cmd.id)) return original;
  const s = structuredClone(original);
  if (s.consent && now - s.consentAt > 7200000) {
    s.consent = false;
    for (const item of s.questions.filter((x) => x.sensitive)) {
      delete s.secrets[item.id];
      item.enabled = false;
    }
    if (s.questions[s.index]?.sensitive) {
      delete s.submissions[s.roundId];
      s.phase = "submissions_closed";
      s.deadline = 0;
    }
  }
  const q = s.questions[s.index];
  const isAdmin = actor.role === "admin";
  const isStar = actor.role === "marlene";
  const privileged = isAdmin || isStar;
  if (
    [
      "close",
      "reveal",
      "leaderboard",
      "next",
      "open",
      "finish",
      "edit",
      "reorder",
      "delete",
      "add",
      "adjust",
      "moderate",
      "reset",
      "timer",
      "audio",
      "allowReveal",
      "adjudicate",
      "grade",
      "vipPin",
    ].includes(cmd.action)
  )
    must(isAdmin, "Cette action est réservée à l’hôte.", 403);
  if (
    [
      "private",
      "vote",
      "consent",
      "withdraw",
      "starReveal",
      "stroke",
      "undoStroke",
      "clearStrokes",
    ].includes(cmd.action)
  )
    must(privileged, "Cette action est réservée à Marlène ou à l’hôte.", 403);
  switch (cmd.action) {
    case "join": {
      must(actor.role !== "present", "Choisis un accès à la fête.", 403);
      const nickname = String(cmd.nickname ?? "")
        .normalize("NFKC")
        .trim()
        .replace(/[<>\u0000-\u001f]/g, "")
        .replace(/\s+/g, " ");
      must(
        nickname.length >= 1 && nickname.length <= 24,
        "Entre un nom de 1 à 24 caractères.",
      );
      must(
        actor.role === "marlene" || !isMarleneName(nickname),
        "Ce prénom est réservé à Marlène. Choisis un autre petit nom.",
        409,
      );
      must(
        !s.players.some(
          (p) =>
            p.active &&
            p.id !== actor.playerId &&
            nicknameKey(p.nickname) === nicknameKey(nickname),
        ),
        "Ce nom est déjà pris. Choisis-en un autre.",
        409,
      );
      must(actor.playerId, "Identité manquante.");
      const existing = s.players.find((p) => p.id === actor.playerId);
      if (existing) {
        existing.nickname = nickname;
        existing.active = true;
        if (actor.role === "marlene") existing.role = "marlene";
        if (actor.role === "guest") existing.role = "guest";
      } else
        s.players.push({
          id: actor.playerId,
          nickname,
          avatar: Math.max(0, Math.min(7, Number(cmd.avatar) || 0)),
          joinedAt: now,
          active: true,
          role: actor.role,
        });
      break;
    }
    case "open": {
      must(
        ["lobby", "next_round"].includes(s.phase),
        "Cette manche a déjà commencé.",
      );
      if (s.phase === "lobby")
        s.index = s.questions.findIndex((q) => q.enabled);
      must(s.index >= 0, "Active au moins une manche.");
      must(
        !s.questions[s.index].sensitive || s.consent,
        "Marlène doit donner son consentement.",
      );
      const opening = s.questions[s.index];
      must(
        opening.kind !== "blind" || opening.media.length,
        "Importe un extrait audio autorisé avant le blind test.",
      );
      must(
        opening.kind !== "photo" || opening.media.length,
        "Importe des images autorisées avant cette manche.",
      );
      must(
        opening.kind !== "pin" || s.secrets[opening.id]?.text,
        "Définis un code fictif pour le bonus.",
      );
      s.roundId = `${s.generation}-${cmd.id}`;
      start(s, now);
      break;
    }
    case "submit": {
      must(
        actor.role === "guest" &&
          s.players.some((p) => p.id === actor.playerId && p.active),
        "Rejoins la fête pour jouer.",
        403,
      );
      must(q && OPEN.includes(s.phase), "Les réponses sont fermées.", 409);
      must(now <= s.deadline, "Le temps est écoulé.", 409);
      const list = (s.submissions[s.roundId] ??= []);
      const previous = list.find((x) => x.playerId === actor.playerId);
      must(
        !previous || q.kind === "pictionary" || q.kind === "pin",
        "Ta réponse est déjà enregistrée.",
        409,
      );
      must(
        !previous || !previous.moderated,
        "Cette participation a été modérée.",
        403,
      );
      must(
        !previous ||
          Number(previous.attempts ?? 1) < (q.kind === "pin" ? q.attempts : 40),
        "Tu as utilisé toutes tes tentatives.",
      );
      const value = cmd.value;
      must(value !== null && value !== undefined, "Ajoute ta réponse.");
      if (q.kind === "drawing") validateStrokes(value);
      else if (q.kind === "number" || q.sensitive)
        must(
          typeof value === "number" &&
            Number.isFinite(value) &&
            Math.abs(value) <= 1e9,
          "Entre un nombre valide.",
        );
      else if (
        ["choice", "multi", "outfit", "photo"].includes(q.kind) ||
        (q.kind === "blind" && q.options.length > 0)
      ) {
        must(
          Array.isArray(value) &&
            value.length <= q.options.length &&
            value.every(
              (v) => typeof v === "string" && q.options.includes(v),
            ) &&
            new Set(value).size === value.length,
          "Choisis parmi les réponses proposées.",
        );
        if (q.kind === "choice" || q.kind === "blind")
          must(value.length === 1, "Choisis une seule réponse.");
      } else
        must(
          typeof value === "string" &&
            value.trim().length > 0 &&
            value.length <= 500,
          "Réponse attendue : 1 à 500 caractères.",
        );
      if (q.kind === "pin")
        must(isPin(value), `Entre un code à ${PIN_LENGTH} chiffres.`);
      const sub: Submission = {
        id: previous?.id ?? cmd.id,
        playerId: actor.playerId!,
        value: value as Submission["value"],
        at: now,
        elapsed: Math.max(0, now - s.startedAt),
        moderated: false,
        attempts: (previous?.attempts ?? 0) + 1,
      };
      if (previous) list.splice(list.indexOf(previous), 1, sub);
      else list.push(sub);
      if (q.kind === "pictionary" && correct(q, s.secrets[q.id], sub.value)) {
        must(!s.winner, "Le mot a déjà été trouvé.", 409);
        s.winner = actor.playerId;
        s.phase = "pictionary_winner";
        s.deadline = 0;
        award(
          s,
          actor.playerId!,
          5,
          now,
          "Premier mot trouvé",
          true,
          sub.elapsed,
        );
      }
      if (q.kind === "pin" && correct(q, s.secrets[q.id], sub.value))
        sub.correct = true;
      if (OPEN.includes(s.phase) && everyoneAnswered(s)) closeRound(s, now);
      break;
    }
    case "close":
      must(
        OPEN.includes(s.phase) || s.phase === "waiting_for_marlene_answer",
        "Aucune manche ouverte.",
      );
      closeRound(s, now);
      break;
    case "reveal": {
      must(
        ["submissions_closed", "drawing_submissions_closed"].includes(s.phase),
        "Ferme les réponses avant la révélation.",
      );
      if (q.kind === "drawing") {
        s.phase = "voting_open";
        break;
      }
      if (!["creative", "reveal", "pictionary"].includes(q.kind))
        must(autoScored(s, q), "Confirme la bonne réponse avant de révéler.");
      if (q.kind === "reveal")
        must(
          s.secrets[q.id]?.text !== undefined ||
            s.secrets[q.id]?.number !== undefined,
          "Marlène peut répondre ou l’hôte peut passer la manche.",
        );
      scoreRound(s, now);
      s.phase = "reveal";
      break;
    }
    case "leaderboard":
      must(REVEALED.includes(s.phase), "Révèle la manche avant le classement.");
      s.phase = "leaderboard";
      break;
    case "next": {
      must(
        [
          "leaderboard",
          "reveal",
          "winner_revealed",
          "pictionary_winner",
          "submissions_closed",
          "voting_open",
        ].includes(s.phase),
        "Ferme la manche avant de passer.",
      );
      const next = s.questions.findIndex(
        (x, i) => i > s.index && x.enabled && (!x.sensitive || s.consent),
      );
      if (q?.sensitive) {
        delete s.secrets[q.id];
        delete s.submissions[s.roundId];
      }
      s.index = next < 0 ? s.index : next;
      s.phase = next < 0 ? "finished" : "next_round";
      s.deadline = 0;
      s.strokes = [];
      s.audio.playing = false;
      break;
    }
    case "finish":
      s.phase = "finished";
      s.finishedEarly = true;
      s.deadline = 0;
      s.strokes = [];
      s.audio.playing = false;
      s.revealAllowed = false;
      s.consent = false;
      s.consentAt = 0;
      for (const item of s.questions.filter((x) => x.sensitive)) {
        delete s.secrets[item.id];
        for (const [rid, subs] of Object.entries(s.submissions))
          if (
            s.events.some(
              (e) => e.roundId === rid && e.questionId === item.id,
            ) ||
            (rid === s.roundId && q?.sensitive)
          )
            delete s.submissions[rid];
      }
      break;
    case "private": {
      const target = s.questions.find((x) => x.id === cmd.questionId);
      must(target, "Question introuvable.");
      must(
        !target.sensitive || (s.consent && isStar),
        "Seule Marlène peut fournir cette réponse, après consentement.",
        403,
      );
      must(
        !(target.id === q?.id && REVEALED.includes(s.phase)),
        "La réponse est déjà révélée.",
      );
      const secret: Secret = { updatedAt: now };
      if (cmd.number !== undefined) {
        must(
          typeof cmd.number === "number" && Number.isFinite(cmd.number),
          "Nombre invalide.",
        );
        secret.number = cmd.number;
      }
      if (cmd.text !== undefined) {
        must(
          typeof cmd.text === "string" &&
            cmd.text.length > 0 &&
            cmd.text.length <= 500,
          "Réponse trop longue ou vide.",
        );
        if (target.kind === "pin")
          must(
            isPin(cmd.text),
            `Utilise un code fictif de ${PIN_LENGTH} chiffres.`,
          );
        secret.text = cmd.text;
      }
      if (cmd.answers !== undefined) {
        must(
          Array.isArray(cmd.answers) &&
            cmd.answers.length > 0 &&
            cmd.answers.every((v) => target.options.includes(v)),
          "Choix invalides.",
        );
        secret.answers = cmd.answers as string[];
        if (target.kind === "choice" || target.kind === "blind")
          must(
            secret.answers.length === 1,
            "Une seule bonne réponse attendue.",
          );
      }
      if (cmd.aliases !== undefined) {
        must(
          Array.isArray(cmd.aliases) &&
            cmd.aliases.length <= 20 &&
            cmd.aliases.every((v) => typeof v === "string" && v.length <= 100),
          "Alias invalides.",
        );
        secret.aliases = cmd.aliases as string[];
      }
      if (cmd.prompt !== undefined) {
        must(
          typeof cmd.prompt === "string" &&
            cmd.prompt.trim().length > 0 &&
            cmd.prompt.length <= 200,
          "Thème attendu, 200 caractères maximum.",
        );
        secret.prompt = cmd.prompt;
      }
      must(
        secret.number !== undefined ||
          secret.text ||
          secret.answers ||
          secret.prompt,
        "Ajoute une réponse.",
      );
      s.secrets[target.id] = secret;
      target.confirmed = true;
      if (q?.id === target.id && s.phase === "waiting_for_marlene_answer") {
        s.startedAt = now;
        s.deadline = now + q.duration * 1000;
        s.phase = q.kind === "drawing" ? "drawing_open" : "pictionary_live";
      }
      break;
    }
    case "vote": {
      must(isStar, "Seule Marlène peut choisir son coup de cœur.", 403);
      must(
        q && ["drawing", "creative"].includes(q.kind),
        "Pas de vote pour cette manche.",
      );
      must(
        q.kind === "drawing" ? s.phase === "voting_open" : s.phase === "reveal",
        "Le vote n’est pas ouvert.",
      );
      must(!s.winner, "Le vote final a déjà eu lieu.", 409);
      const sub = s.submissions[s.roundId]?.find(
        (x) => x.id === cmd.submissionId && !x.moderated,
      );
      must(sub, "Participation introuvable.");
      s.winner = sub.playerId;
      award(
        s,
        sub.playerId,
        q.kind === "drawing" ? 5 : q.bonus,
        now,
        "Le coup de cœur de Marlène",
        false,
        sub.elapsed,
      );
      s.phase = "winner_revealed";
      break;
    }
    case "adjudicate": {
      must(
        q?.kind === "pictionary" &&
          ["pictionary_live", "submissions_closed"].includes(s.phase) &&
          !s.winner,
        "Cette manche a déjà son résultat.",
      );
      const sub = s.submissions[s.roundId]?.find(
        (x) => x.id === cmd.submissionId && !x.moderated,
      );
      must(sub, "Proposition introuvable.");
      s.winner = sub.playerId;
      s.phase = "pictionary_winner";
      s.deadline = 0;
      award(
        s,
        sub.playerId,
        5,
        now,
        "Mot validé par l’hôte",
        true,
        sub.elapsed,
      );
      break;
    }
    case "stroke":
      must(
        q?.kind === "pictionary" &&
          s.phase === "pictionary_live" &&
          now <= s.deadline,
        "Le dessin en direct est fermé.",
      );
      const st = validateStrokes([cmd.stroke])[0];
      must(
        s.strokes.length < 400 &&
          s.strokes.reduce((n, x) => n + x.points.length, 0) +
            st.points.length <=
            25000,
        "Limite de traits atteinte.",
      );
      if (!s.strokes.some((x) => x.id === st.id)) s.strokes.push(st);
      break;
    case "undoStroke":
      must(
        q?.kind === "pictionary" && s.phase === "pictionary_live",
        "Le dessin est fermé.",
      );
      if (typeof cmd.strokeId === "string")
        s.strokes = s.strokes.filter(
          (x) => !x.id.startsWith(cmd.strokeId + "__"),
        );
      else s.strokes.pop();
      break;
    case "clearStrokes":
      must(
        q?.kind === "pictionary" && s.phase === "pictionary_live",
        "Le dessin est fermé.",
      );
      s.strokes = [];
      break;
    case "allowReveal":
      s.revealAllowed = !!cmd.allowed;
      break;
    case "starReveal":
      must(
        isStar && s.revealAllowed && s.phase === "submissions_closed",
        "L’hôte doit autoriser la révélation.",
        403,
      );
      must(q && s.secrets[q.id], "Ajoute d’abord ta réponse.");
      scoreRound(s, now);
      s.phase = "reveal";
      s.revealAllowed = false;
      break;
    case "consent":
      must(isStar, "Seule Marlène peut consentir.", 403);
      s.consent = true;
      s.consentAt = now;
      break;
    case "withdraw":
      must(isStar, "Seule Marlène peut retirer son consentement.", 403);
      s.consent = false;
      for (const item of s.questions.filter((x) => x.sensitive)) {
        item.enabled = false;
        delete s.secrets[item.id];
      }
      if (q?.sensitive) {
        delete s.submissions[s.roundId];
        s.phase = "submissions_closed";
        s.deadline = 0;
      }
      break;
    case "edit": {
      const item = s.questions.find((x) => x.id === cmd.questionId);
      must(item, "Question introuvable.");
      must(
        item.id !== q?.id ||
          ["lobby", "next_round", "finished"].includes(s.phase),
        "Modifie cette question entre les manches.",
      );
      const patch = cmd.patch as Partial<Question>;
      must(patch && typeof patch === "object", "Données invalides.");
      for (const name of ["title", "note", "unit"] as const)
        if (patch[name] !== undefined) {
          must(
            typeof patch[name] === "string" && patch[name]!.length <= 600,
            "Texte trop long.",
          );
          item[name] = patch[name]!;
        }
      if (patch.options) {
        must(
          Array.isArray(patch.options) &&
            patch.options.length <= 16 &&
            patch.options.every(
              (v) => typeof v === "string" && v.length > 0 && v.length <= 180,
            ) &&
            new Set(patch.options).size === patch.options.length,
          "Options invalides.",
        );
        item.options = patch.options;
        item.confirmed = false;
        delete s.secrets[item.id];
      }
      if (patch.enabled !== undefined) {
        must(
          !item.sensitive || s.consent || !patch.enabled,
          "Marlène doit donner son consentement.",
        );
        item.enabled = !!patch.enabled;
      }
      if (patch.kind) {
        must(
          [
            "choice",
            "multi",
            "number",
            "text",
            "reveal",
            "blind",
            "outfit",
            "pin",
            "photo",
            "creative",
            "pictionary",
            "drawing",
          ].includes(patch.kind),
          "Type inconnu.",
        );
        must(
          !item.sensitive || patch.kind === "reveal",
          "Cette manche reste facultative.",
        );
        item.kind = patch.kind;
        item.confirmed = false;
      }
      for (const name of [
        "duration",
        "tolerance",
        "bonus",
        "attempts",
        "clipStart",
        "clipEnd",
      ] as const)
        if (patch[name] !== undefined) {
          const v = patch[name]!;
          must(
            Number.isFinite(v) && v >= 0 && v <= 3600,
            "Valeur hors limites.",
          );
          item[name] = v;
        }
      must(
        item.duration >= 10 && item.attempts >= 1,
        "Minima : 10 secondes et 1 tentative.",
      );
      if (patch.media) {
        must(
          Array.isArray(patch.media) &&
            patch.media.length <= 12 &&
            patch.media.every((v) =>
              /^\/api\/media\?id=[a-zA-Z0-9-]+$/.test(v),
            ),
          "Média non autorisé.",
        );
        item.media = patch.media;
      }
      break;
    }
    case "reorder": {
      must(
        ["lobby", "finished"].includes(s.phase),
        "Réorganise les manches avant la partie.",
      );
      const ids = cmd.ids;
      must(
        Array.isArray(ids) &&
          ids.length === s.questions.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => s.questions.some((q) => q.id === id)),
        "Ordre invalide.",
      );
      s.questions = (ids as string[]).map((id) =>
        s.questions.find((q) => q.id === id)!,
      );
      break;
    }
    case "delete":
      must(s.questions.length > 1, "Garde au moins une question.");
      must(
        ["lobby", "finished"].includes(s.phase),
        "Supprime les manches avant la partie.",
      );
      delete s.secrets[String(cmd.questionId)];
      s.questions = s.questions.filter((q) => q.id !== cmd.questionId);
      break;
    case "vipPin":
      // Server-only: never copied into a view. Changing it signs Marlène out everywhere.
      must(isPin(cmd.pin), `Le code VIP doit faire ${PIN_LENGTH} chiffres.`);
      s.vipPin = cmd.pin;
      break;
    case "add": {
      must(
        ["lobby", "finished"].includes(s.phase),
        "Ajoute une manche avant la partie.",
      );
      const base = s.questions[0];
      must(base, "Garde au moins une question.");
      s.questions.push({
        ...structuredClone(base),
        id: `custom-${cmd.id}`,
        title: "Une nouvelle question pour Marlène ?",
        source: 0,
        kind: "text",
        options: [],
        generated: [],
        confirmed: false,
        enabled: true,
        sensitive: false,
        media: [],
        note: "À personnaliser.",
      });
      break;
    }
    case "grade": {
      must(
        q &&
          ["text", "reveal"].includes(q.kind) &&
          ["reveal", "leaderboard"].includes(s.phase),
        "Validation manuelle indisponible.",
      );
      const sub = s.submissions[s.roundId]?.find(
        (x) => x.id === cmd.submissionId && !x.moderated,
      );
      must(sub, "Participation introuvable.");
      must(typeof cmd.correct === "boolean", "Validation manquante.");
      must(
        !s.events.some((e) => e.id === `${s.roundId}:${sub.playerId}`),
        "Cette réponse a déjà été notée.",
        409,
      );
      award(
        s,
        sub.playerId,
        cmd.correct ? 1 : -1,
        now,
        cmd.correct
          ? "Réponse validée par l’hôte"
          : "Réponse refusée par l’hôte",
        cmd.correct,
        sub.elapsed,
      );
      break;
    }
    case "adjust": {
      must(
        typeof cmd.playerId === "string" &&
          s.players.some((p) => p.id === cmd.playerId),
        "Joueur introuvable.",
      );
      must(
        typeof cmd.delta === "number" &&
          Number.isInteger(cmd.delta) &&
          Math.abs(cmd.delta) <= 100,
        "Ajustement entre −100 et +100.",
      );
      must(
        typeof cmd.reason === "string" &&
          cmd.reason.trim().length > 0 &&
          cmd.reason.length <= 200,
        "Ajoute un motif.",
      );
      award(
        s,
        cmd.playerId,
        cmd.delta,
        now,
        cmd.reason,
        false,
        0,
        true,
        cmd.id,
      );
      break;
    }
    case "moderate": {
      const sub = s.submissions[s.roundId]?.find(
        (x) => x.id === cmd.submissionId,
      );
      must(sub, "Participation introuvable.");
      sub.moderated = true;
      const previous = s.events.find(
        (e) => e.id === `${s.roundId}:${sub.playerId}`,
      );
      if (previous)
        award(
          s,
          sub.playerId,
          -previous.delta,
          now,
          "Participation retirée par l’hôte",
          false,
          0,
          true,
          `moderate-${sub.id}`,
        );
      break;
    }
    case "timer":
      must(OPEN.includes(s.phase), "Aucun chrono en cours.");
      must(
        typeof cmd.seconds === "number" &&
          cmd.seconds >= 10 &&
          cmd.seconds <= 600,
        "Durée entre 10 et 600 secondes.",
      );
      s.deadline = now + cmd.seconds * 1000;
      break;
    case "audio":
      must(
        q?.kind === "blind" && OPEN.includes(s.phase),
        "Aucun blind test en cours.",
      );
      s.audio = { playing: !!cmd.playing, at: now, offset: q.clipStart };
      break;
    case "reset":
      must(
        cmd.confirm === s.room,
        "Recopie le code de la salle pour réinitialiser.",
      );
      s.generation++;
      s.finishedEarly = false;
      s.index = -1;
      s.phase = "lobby";
      s.roundId = "";
      s.submissions = {};
      s.strokes = [];
      s.deadline = 0;
      s.startedAt = 0;
      s.winner = undefined;
      s.consent = false;
      s.consentAt = 0;
      s.revealAllowed = false;
      s.audio = { playing: false, at: 0, offset: 0 };
      for (const item of s.questions.filter((x) => x.sensitive)) {
        delete s.secrets[item.id];
        item.enabled = false;
      }
      break;
    default:
      throw new GameError("Action inconnue.");
  }
  s.requests.push(cmd.id);
  s.requests = s.requests.slice(-3000);
  return s;
}
