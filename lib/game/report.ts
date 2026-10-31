// End-of-game reports: everything a finished (or wiped) game leaves behind, so it can be kept
// after a new game wipes the party. Pure functions; storage lives in archive.ts.
import type { Kind, Participant, Party, Question, ScoreEvent } from "./types";
import { keyFromMarlene, kindLabels } from "./types";
import { formatNumber as formatQuestionNumber } from "./time";
import { leaderboard } from "./engine";

export type ReportValue = string | string[] | number | null;
export type ReportAnswer = {
  playerId: string;
  nickname: string;
  value: ReportValue;
  // The answer as it reads: a time as mm:ss, each photo with its name, a picked song.
  text: string;
  // Blind test: the song picked in the search; without it, the guest typed the answer.
  song?: { title: string; artist: string };
  // Marlène's answer on a round where it is the right answer.
  isKey?: boolean;
  // Media ID of a drawing-contest drawing (JSON strokes).
  drawing?: string;
  at: number;
  elapsed: number;
  attempts: number;
  moderated: boolean;
  correct: boolean | null;
  points: number;
  reasons: string[];
};
export type ReportRound = {
  id: string;
  number: number;
  questionId: string;
  title: string;
  kind: Kind | "unknown";
  kindLabel: string;
  options: string[];
  unit: string;
  media: string[];
  // A "match" round: the photos to name, in order.
  photos?: string[];
  openedAt: number;
  rightAnswer: string | null;
  // Drawing-contest theme, or the Pictionary word.
  prompt?: string;
  answers: ReportAnswer[];
  // Marlène's favourite (creative, drawing) or the first to guess the Pictionary word.
  winner?: { playerId: string; nickname: string; reason: string };
  events: ScoreEvent[];
};
export type ReportPlayer = {
  id: string;
  nickname: string;
  role: NonNullable<Participant["role"]> | "guest";
  photo?: string;
  joinedAt: number;
};
export type ReportRank = {
  playerId: string;
  nickname: string;
  rank: number;
  score: number;
  correctCount: number;
};
export type GameReport = {
  id: string;
  version: 1;
  generation: number;
  room: string;
  startedAt: number;
  finishedAt: number;
  // false when a new game wiped a game that never reached the podium.
  finished: boolean;
  finishedEarly: boolean;
  builtAt: number;
  players: ReportPlayer[];
  rounds: ReportRound[];
  adjustments: (ScoreEvent & { nickname: string })[];
  leaderboard: ReportRank[];
  // Selfies and drawings the report shows; archived under archive/<id>/<media id>.
  media: { id: string; kind: "selfie" | "drawing" }[];
  archived: boolean;
};
export type ReportSummary = {
  id: string;
  generation: number;
  room: string;
  startedAt: number;
  finishedAt: number;
  finished: boolean;
  players: number;
  rounds: number;
  winners: string[];
};

// One report per generation of a party.
export const reportId = (p: Party) => `${p.createdAt}-${p.generation}`;
export const archiveKey = (report: string, media: string) =>
  `archive/${report}/${media}`;

const isModeration = (e: ScoreEvent) => e.id.startsWith("moderate-");

// Rounds of the current generation, oldest first: the open log, then anything older parties
// only know from their submissions or score events.
function roundsOf(p: Party) {
  const prefix = `${p.generation}-`;
  const events = p.events.filter((e) => e.generation === p.generation);
  const list = (p.rounds ?? [])
    .filter((r) => r.id.startsWith(prefix))
    .map((r) => ({ ...r }));
  const known = new Set(list.map((r) => r.id));
  const extra = new Map<string, { questionId: string; openedAt: number }>();
  for (const [id, subs] of Object.entries(p.submissions))
    if (id.startsWith(prefix) && !known.has(id) && subs.length)
      extra.set(id, {
        questionId: "",
        openedAt: Math.min(...subs.map((s) => s.at - s.elapsed)),
      });
  for (const e of events)
    if (
      e.roundId.startsWith(prefix) &&
      !known.has(e.roundId) &&
      !e.adjustment
    ) {
      const r = extra.get(e.roundId) ?? {
        questionId: "",
        openedAt: e.at - e.elapsed,
      };
      r.questionId ||= e.questionId;
      extra.set(e.roundId, r);
    }
  // The last round played is the current one, whatever the log knows.
  const last = extra.get(p.roundId);
  if (last && !last.questionId && p.questions[p.index])
    last.questionId = p.questions[p.index].id;
  for (const [id, r] of extra) list.push({ id, ...r });
  return list.sort((a, b) => a.openedAt - b.openedAt);
}

// How a player's answer reads in the report.
function answerText(q: Question | undefined, v: ReportValue): string {
  if (v === null || v === undefined) return "—";
  if (q?.kind === "match" && Array.isArray(v))
    return (
      (q.photos ?? [])
        .map((photo, i) => (v[i] ? `${photo} : ${v[i]}` : ""))
        .filter(Boolean)
        .join(", ") || "—"
    );
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "number") return formatQuestionNumber(q, v);
  return v;
}
// The right answer as text: Marlène's own answer on rounds where it is the key (questions
// flagged keyFromMarlene), otherwise the stored key.
function rightAnswer(
  p: Party,
  q: Question | undefined,
  marleneValue: ReportValue | undefined,
): string | null {
  if (!q) return null;
  if (keyFromMarlene(q) && marleneValue !== undefined && marleneValue !== null)
    return `${answerText(q, marleneValue)} (réponse de Marlène)`;
  const key = p.secrets[q.id];
  if (!key) return null;
  if (q.kind === "blind" && key.text)
    return key.artist
      ? `${key.artist} — ${key.text}`
      : (key.answers?.[0] ?? key.text);
  if (key.answers?.length) return answerText(q, key.answers);
  if (key.number !== undefined) return answerText(q, key.number);
  if (key.text !== undefined && q.kind !== "pictionary") return key.text;
  return null;
}

export function buildReport(p: Party, now = Date.now()): GameReport | null {
  const rounds = roundsOf(p);
  if (!rounds.length) return null;
  const gen = p.events.filter((e) => e.generation === p.generation);
  const name = (id: string) =>
    p.players.find((x) => x.id === id)?.nickname ?? "Invité parti";
  const media: GameReport["media"] = [];
  const reportRounds: ReportRound[] = rounds.map((r, i) => {
    const q = p.questions.find((x) => x.id === r.questionId);
    const events = gen.filter((e) => e.roundId === r.id && !e.adjustment);
    const roundEvents = gen.filter(
      (e) => e.roundId === r.id && (!e.adjustment || isModeration(e)),
    );
    const subs = p.submissions[r.id] ?? [];
    const marlene = p.players.find((x) => x.role === "marlene");
    const hers = marlene
      ? subs.find((s) => s.playerId === marlene.id && !s.moderated)
      : undefined;
    const answers: ReportAnswer[] = subs.map((s) => {
      const mine = roundEvents.filter((e) => e.playerId === s.playerId);
      const main = events.find((e) => e.id === `${r.id}:${s.playerId}`);
      if (s.drawingId) media.push({ id: s.drawingId, kind: "drawing" });
      const value =
        Array.isArray(s.value) && q?.kind === "drawing"
          ? null
          : (s.value as ReportValue);
      const typed = q?.kind === "blind" && !s.song;
      return {
        playerId: s.playerId,
        nickname: name(s.playerId),
        value,
        text: `${answerText(q, value)}${typed ? " (écrite)" : ""}`,
        ...(s.song
          ? { song: { title: s.song.title, artist: s.song.artist } }
          : {}),
        ...(s === hers && keyFromMarlene(q) ? { isKey: true } : {}),
        ...(s.drawingId ? { drawing: s.drawingId } : {}),
        at: s.at,
        elapsed: s.elapsed,
        attempts: s.attempts ?? 1,
        moderated: s.moderated,
        correct: main ? main.correct : (s.correct ?? null),
        points: mine.reduce((v, e) => v + e.delta, 0),
        reasons: mine.map((e) => e.reason),
      };
    });
    // Points without an answer (a Pictionary word validated by the host, say) still show.
    for (const e of events)
      if (!answers.some((a) => a.playerId === e.playerId))
        answers.push({
          playerId: e.playerId,
          nickname: name(e.playerId),
          value: null,
          text: "—",
          at: e.at,
          elapsed: e.elapsed,
          attempts: 0,
          moderated: false,
          correct: e.correct,
          points: e.delta,
          reasons: [e.reason],
        });
    const winnerEvent =
      q?.kind === "pictionary"
        ? events.find((e) => e.correct && e.delta > 0)
        : events.find((e) => e.reason === "Le coup de cœur de Marlène");
    const secret = q ? p.secrets[q.id] : undefined;
    const prompt =
      q?.kind === "drawing"
        ? secret?.prompt
        : q?.kind === "pictionary"
          ? secret?.text
          : undefined;
    return {
      id: r.id,
      number: i + 1,
      questionId: r.questionId,
      title: q?.title ?? "Manche non identifiée",
      kind: q?.kind ?? "unknown",
      kindLabel: q ? kindLabels[q.kind] : "Manche",
      options: q?.options ?? [],
      unit: q?.unit ?? "",
      media: q?.media ?? [],
      ...(q?.photos?.length ? { photos: q.photos } : {}),
      openedAt: r.openedAt,
      rightAnswer: rightAnswer(p, q, hers?.value as ReportValue | undefined),
      ...(prompt ? { prompt } : {}),
      answers,
      ...(winnerEvent
        ? {
            winner: {
              playerId: winnerEvent.playerId,
              nickname: name(winnerEvent.playerId),
              reason: winnerEvent.reason,
            },
          }
        : {}),
      events: roundEvents,
    };
  });
  const players: ReportPlayer[] = p.players.map((x) => {
    if (x.photo) media.push({ id: x.photo, kind: "selfie" });
    return {
      id: x.id,
      nickname: x.nickname,
      role: x.role ?? "guest",
      ...(x.photo ? { photo: x.photo } : {}),
      joinedAt: x.joinedAt,
    };
  });
  // Everyone who played ranks, including guests who signed out before the end.
  const ranking = leaderboard({
    ...p,
    players: p.players.map((x) => ({ ...x, active: true })),
  }).map((x) => ({
    playerId: x.id,
    nickname: x.nickname,
    rank: x.rank,
    score: x.score,
    correctCount: x.correctCount,
  }));
  return {
    id: reportId(p),
    version: 1,
    generation: p.generation,
    room: p.room,
    startedAt: rounds[0].openedAt,
    finishedAt: p.phase === "finished" ? (p.finishedAt ?? now) : now,
    finished: p.phase === "finished",
    finishedEarly: !!p.finishedEarly,
    builtAt: now,
    players,
    rounds: reportRounds,
    adjustments: gen
      .filter((e) => e.adjustment && !isModeration(e))
      .map((e) => ({ ...e, nickname: name(e.playerId) })),
    leaderboard: ranking,
    media: [...new Map(media.map((m) => [m.id, m])).values()],
    archived: false,
  };
}

export function summarize(r: GameReport): ReportSummary {
  return {
    id: r.id,
    generation: r.generation,
    room: r.room,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    finished: r.finished,
    players: r.players.filter((x) => x.role !== "admin").length,
    rounds: r.rounds.length,
    winners: r.leaderboard.filter((x) => x.rank === 1).map((x) => x.nickname),
  };
}

// ── The report as one self-contained HTML page ──

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const when = (ms: number) =>
  new Date(ms).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "full",
    timeStyle: "short",
  });
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const roleLabel: Record<string, string> = {
  guest: "Invité",
  marlene: "Marlène",
  admin: "Hôte",
};

export type ReportStroke = {
  color: string;
  size: number;
  points: { x: number; y: number }[];
};
// Same 1000×700 surface as the in-game canvas.
export function strokesSvg(strokes: ReportStroke[], label: string) {
  const paths = strokes
    .filter((s) => /^#[a-f0-9]{6}$/i.test(s.color) && Number.isFinite(s.size))
    .map((s) => {
      const pts = s.points.filter(
        (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
      );
      if (!pts.length) return "";
      const d =
        pts.length === 1
          ? `M${pts[0].x * 1000},${pts[0].y * 700}l.1,.1`
          : pts
              .map(
                (p, i) =>
                  `${i ? "L" : "M"}${(p.x * 1000).toFixed(1)},${(p.y * 700).toFixed(1)}`,
              )
              .join(" ");
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg class="drawing" viewBox="0 0 1000 700" role="img" aria-label="${esc(label)}">${paths}</svg>`;
}

// Media contents resolved by the caller: data URIs for selfies, strokes for drawings.
export type ReportMedia = Map<
  string,
  { dataUri?: string; strokes?: ReportStroke[] }
>;

export function renderReportHtml(r: GameReport, media: ReportMedia) {
  const photoOf = (playerId: string, size = 44) => {
    const id = r.players.find((x) => x.id === playerId)?.photo;
    const uri = id ? media.get(id)?.dataUri : undefined;
    return uri
      ? `<img class="selfie" src="${esc(uri)}" width="${size}" height="${size}" alt="">`
      : `<span class="selfie empty" style="width:${size}px;height:${size}px"></span>`;
  };
  const podium = r.leaderboard
    .filter((x) => x.rank <= 3)
    .map(
      (x) =>
        `<li class="podium-${x.rank}">${photoOf(x.playerId, 96)}<b>${x.rank}<sup>${x.rank === 1 ? "er" : "e"}</sup></b><span>${esc(x.nickname)}</span><small>${x.score} pts</small></li>`,
    )
    .join("");
  const ranking = r.leaderboard
    .map(
      (x) =>
        `<tr><td>${x.rank}</td><td class="who">${photoOf(x.playerId, 32)} ${esc(x.nickname)}</td><td>${x.score}</td><td>${x.correctCount}</td></tr>`,
    )
    .join("");
  const players = r.players
    .map(
      (x) =>
        `<li>${photoOf(x.id, 64)}<span>${esc(x.nickname)}</span><small>${esc(roleLabel[x.role] ?? x.role)}</small></li>`,
    )
    .join("");
  const rounds = r.rounds
    .map((round) => {
      const rows = round.answers
        .map((a) => {
          const strokes = a.drawing ? media.get(a.drawing)?.strokes : undefined;
          const answer = a.drawing
            ? strokes
              ? strokesSvg(strokes, `Dessin de ${a.nickname}`)
              : "<em>Dessin introuvable</em>"
            : esc(a.text ?? "—");
          const mark =
            a.correct === true ? "✓" : a.correct === false ? "✗" : "";
          return `<tr${a.moderated ? ' class="moderated"' : ""}><td class="who">${photoOf(a.playerId, 32)} ${esc(a.nickname)}</td><td class="answer">${answer}${a.song ? ' <small class="tag">recherche</small>' : ""}${a.isKey ? ' <small class="tag">la bonne réponse</small>' : ""}${a.moderated ? ' <small class="tag">modérée</small>' : ""}${a.attempts > 1 ? ` <small class="muted">(${a.attempts} essais)</small>` : ""}</td><td class="mark">${mark}</td><td class="points">${signed(a.points)}</td><td class="muted">${esc(a.reasons.join(" · "))}</td></tr>`;
        })
        .join("");
      return `<section class="round">
<h3><span class="num">${round.number}</span> ${esc(round.title)} <small class="kind">${esc(round.kindLabel)}</small></h3>
${round.options.length ? `<p class="muted">Choix : ${esc(round.options.join(" · "))}</p>` : ""}
${round.prompt ? `<p>${round.kind === "pictionary" ? "Mot à deviner" : "Thème"} : <b>${esc(round.prompt)}</b></p>` : ""}
${round.rightAnswer !== null ? `<p class="right">Bonne réponse : <b>${esc(round.rightAnswer)}</b></p>` : ""}
${round.winner ? `<p class="winner">🏆 ${esc(round.winner.nickname)} — ${esc(round.winner.reason)}</p>` : round.kind === "pictionary" ? '<p class="muted">Personne n’a trouvé le mot.</p>' : ""}
${round.media.length ? `<p class="muted small">Médias de la question : ${esc(round.media.join(", "))}</p>` : ""}
${rows ? `<table><thead><tr><th>Joueur</th><th>Réponse</th><th></th><th>Points</th><th>Détail</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Aucune réponse.</p>'}
</section>`;
    })
    .join("");
  const adjustments = r.adjustments
    .map(
      (e) =>
        `<li><b>${esc(e.nickname)}</b> ${signed(e.delta)} — ${esc(e.reason)}</li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>Partie du ${esc(when(r.startedAt))} — salle ${esc(r.room)}</title>
<style>
:root{--ink:#392938;--muted:#7a6a78;--coral:#f87979;--lilac:#efe7fb;--line:#eadfe8;--bg:#fff8f3}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.8rem;margin:0 0 4px}h2{margin:36px 0 12px;font-size:1.3rem}h3{margin:0 0 8px;font-size:1.1rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.muted{color:var(--muted)}.small{font-size:.85rem}.kind,.tag{background:var(--lilac);border-radius:99px;padding:2px 10px;font-size:.75rem;font-weight:600}
.num{background:var(--coral);color:#fff;border-radius:99px;min-width:28px;height:28px;display:inline-grid;place-items:center;font-size:.9rem}
.selfie{border-radius:50%;object-fit:cover;vertical-align:middle;display:inline-block;background:var(--lilac);flex:none}
.podium{display:flex;gap:16px;justify-content:center;align-items:flex-end;list-style:none;padding:0;margin:16px 0}
.podium li{display:flex;flex-direction:column;align-items:center;gap:4px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;min-width:140px}
.podium .podium-1{order:2;padding-bottom:36px;border-color:var(--coral)}.podium .podium-2{order:1}.podium .podium-3{order:3}
.players{display:flex;flex-wrap:wrap;gap:12px;list-style:none;padding:0}.players li{display:flex;flex-direction:column;align-items:center;width:96px;text-align:center;font-size:.9rem}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;margin-top:8px}
th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:.8rem;color:var(--muted)}
td.who{white-space:nowrap}td.points{font-weight:700;white-space:nowrap}td.mark{font-weight:700}
tr.moderated td{opacity:.55}
.round{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0;overflow-x:auto}
.right{color:#1f7a4d}.winner{font-weight:600}
.drawing{width:240px;max-width:100%;aspect-ratio:10/7;background:#fff;border:1px solid var(--line);border-radius:8px;display:block}
@media (max-width:600px){.podium{flex-wrap:wrap}.podium li{min-width:100px}}
</style></head>
<body><main>
<h1>Le quiz de Marlène — rapport de partie</h1>
<p class="muted">Salle ${esc(r.room)} · partie n° ${r.generation}<br>
Début : ${esc(when(r.startedAt))}<br>
${r.finished ? "Fin" : "Interrompue"} : ${esc(when(r.finishedAt))}${r.finishedEarly ? " (arrêtée avant la dernière manche)" : ""}</p>
<h2>Le podium</h2>
${podium ? `<ol class="podium">${podium}</ol>` : '<p class="muted">Pas de classement.</p>'}
<h2>Le classement final</h2>
<table><thead><tr><th>Rang</th><th>Joueur</th><th>Points</th><th>Bonnes réponses</th></tr></thead><tbody>${ranking}</tbody></table>
<h2>Les joueurs (${r.players.length})</h2>
<ul class="players">${players}</ul>
<h2>Manche par manche (${r.rounds.length})</h2>
${rounds}
${adjustments ? `<h2>Ajustements de l’hôte</h2><ul>${adjustments}</ul>` : ""}
<p class="muted small">Rapport généré le ${esc(when(r.builtAt))}.</p>
</main></body></html>`;
}
