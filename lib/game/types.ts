export type Role = "admin" | "marlene" | "guest" | "present";
export type Kind =
  | "choice"
  | "multi"
  | "number"
  | "text"
  | "reveal"
  | "blind"
  | "outfit"
  | "pin"
  | "photo"
  | "match"
  | "creative"
  | "pictionary"
  | "drawing";
export type Phase =
  | "lobby"
  | "next_round"
  | "question_open"
  | "submissions_closed"
  | "reveal"
  | "leaderboard"
  | "finished"
  | "waiting_for_marlene_answer"
  | "drawing_open"
  | "drawing_submissions_closed"
  | "voting_open"
  | "winner_revealed"
  | "pictionary_live"
  | "pictionary_winner";
export type Point = { x: number; y: number };
export type Stroke = {
  id: string;
  color: string;
  size: number;
  points: Point[];
};
export type Question = {
  id: string;
  source: number;
  title: string;
  kind: Kind;
  options: string[];
  generated: string[];
  enabled: boolean;
  confirmed: boolean;
  duration: number;
  tolerance: number;
  unit: string;
  note: string;
  aliases: string[];
  bonus: number;
  attempts: number;
  media: string[];
  clipStart: number;
  clipEnd: number;
  // A number round answered with a slider instead of typing, e.g. a height in cm.
  // `format: "time"` stores seconds and shows mm:ss. `pointEvery` is how far off costs
  // one point (every full 60 s for a time); without it, one point per step (per cm).
  slider?: {
    min: number;
    max: number;
    step: number;
    format?: "time";
    pointEvery?: number;
  };
  // "Marlène's answer is the key": what she submits in the round is the right answer.
  // She isn't scored on it; the stored key is only the host's fallback if she doesn't answer.
  keyFromMarlene?: boolean;
  // A "match" round: the IDs of the photos to name (files in assets/exes/, by basename).
  // The options are the names; the key's `answers[i]` names `photos[i]`.
  photos?: string[];
};
export type Secret = {
  answers?: string[];
  number?: number;
  text?: string;
  // Blind test: who sings the song whose title is `text`.
  artist?: string;
  aliases?: string[];
  prompt?: string;
  updatedAt?: number;
};
export type Participant = {
  role?: Exclude<Role, "present">;
  id: string;
  nickname: string;
  avatar: number;
  // Media ID of the player's selfie, set only by the avatar upload route.
  photo?: string;
  joinedAt: number;
  active: boolean;
};
// A song from the blind-test catalogue search.
export type Song = {
  id: string;
  title: string;
  artist: string;
  cover?: string;
};
export type Submission = {
  id: string;
  playerId: string;
  value: string | string[] | number | Stroke[];
  // Blind test: the song picked in the search (`value` is then "Artist — Title").
  song?: Song;
  at: number;
  elapsed: number;
  moderated: boolean;
  correct?: boolean;
  attempts?: number;
  drawingId?: string;
};
export type ScoreEvent = {
  id: string;
  roundId: string;
  questionId: string;
  playerId: string;
  delta: number;
  correct: boolean;
  elapsed: number;
  reason: string;
  at: number;
  adjustment: boolean;
  generation: number;
};
export type Session = {
  role: Role;
  playerId?: string;
  expires: number;
  adminProof?: string;
  marleneProof?: string;
};
export type Party = {
  finishedEarly?: boolean;
  questionPresetVersions?: Record<string, string>;
  room: string;
  phase: Phase;
  index: number;
  roundId: string;
  generation: number;
  startedAt: number;
  deadline: number;
  questions: Question[];
  secrets: Record<string, Secret>;
  players: Participant[];
  submissions: Record<string, Submission[]>;
  strokes: Stroke[];
  winner?: string;
  events: ScoreEvent[];
  sessions: Record<string, Session>;
  requests: string[];
  credentials: { admin: string; marlene: string };
  // Marlène's VIP sign-in code. Server-only: view() never copies it.
  // Missing on parties stored before it existed (see applySuppliedAnswers).
  vipPin?: string;
  revealAllowed: boolean;
  audio: { playing: boolean; at: number; offset: number };
  createdAt: number;
};
export type Actor = { role: Role; playerId?: string };
export type Command = { id: string; action: string; [key: string]: unknown };
export type RankedPlayer = Participant & {
  score: number;
  correctCount: number;
  correctTime: number;
  rank: number;
};
export type View = {
  initialized: boolean;
  role: Role | null;
  playerId?: string;
  room: string;
  version: number;
  phase: Phase;
  index: number;
  total: number;
  roundId: string;
  deadline: number;
  players: RankedPlayer[];
  question: Question | null;
  submitted: boolean;
  mySubmission?: Submission;
  submissionCount: number;
  // How many players answer the current round: the guests, plus Marlène unless she leads it.
  roundPlayers: number;
  gallery: {
    id: string;
    strokes: Stroke[];
    drawingUrl?: string;
    artist?: string;
  }[];
  strokes: Stroke[];
  winner?: string;
  result?: { delta: number; correct: boolean; reason: string };
  answer?: Secret;
  // The revealed answer is the one Marlène gave in the round.
  answerFromMarlene?: boolean;
  // Marlène's own screen only: the Pictionary word she draws, set by the host.
  word?: string;
  // A revealed "match" round: how many guests named each photo right, in `photos` order.
  matchRight?: number[];
  // Blind-test reveal: what each guest answered.
  picks?: {
    playerId: string;
    nickname: string;
    label: string;
    cover?: string;
    correct: boolean;
  }[];
  questions?: Question[];
  secrets?: Record<string, Secret>;
  submissions?: Submission[];
  events?: ScoreEvent[];
  revealAllowed?: boolean;
  audio: Party["audio"];
  realtime?: { url: string; key: string };
  serverTime: number;
  setupAvailable?: boolean;
};
export const OPEN: Phase[] = [
  "question_open",
  "drawing_open",
  "pictionary_live",
];
export const REVEALED: Phase[] = [
  "reveal",
  "leaderboard",
  "finished",
  "winner_revealed",
  "pictionary_winner",
];
// Kinds where players can tick several options. Scoring gives +1 per right tick, −1 per wrong one.
const MULTI_SELECT: Kind[] = ["multi", "outfit", "photo"];
export function isMultiSelect(kind: Kind | undefined) {
  return !!kind && MULTI_SELECT.includes(kind);
}
// Rounds Marlène leads instead of playing: she draws the Pictionary word and judges the
// drawings and the creative answers. She answers every other round like a guest.
const MARLENE_LEADS: Kind[] = ["pictionary", "drawing", "creative"];
export function marleneLeads(kind: Kind | undefined) {
  return !!kind && MARLENE_LEADS.includes(kind);
}
// Kinds whose key can be Marlène's own in-game answer. Not the rounds she leads, nor the
// blind test, the photos or the PIN bonus, whose keys aren't about what she thinks.
const MARLENE_KEY_KINDS: Kind[] = [
  "number",
  "text",
  "reveal",
  "choice",
  "multi",
  "outfit",
];
export function canTakeMarleneKey(kind: Kind | undefined) {
  return !!kind && MARLENE_KEY_KINDS.includes(kind);
}
export function keyFromMarlene(q: Question | undefined) {
  return !!q?.keyFromMarlene && canTakeMarleneKey(q.kind);
}
// Guests and Marlène can't play without a selfie (the host and the TV never need one),
// except during an open round: arriving late, they answer first and take it right after.
// `changingIn` is the phase in which a player who has one chose to change it.
export function showsSelfieStep(
  d: View | null,
  changingIn: string | null = null,
) {
  const me = d?.players.find((p) => p.id === d.playerId);
  return (
    !!d &&
    !!me &&
    (d.role === "guest" || d.role === "marlene") &&
    !OPEN.includes(d.phase) &&
    (!me.photo || changingIn === d.phase)
  );
}
export const kindLabels: Record<Kind, string> = {
  choice: "Quiz",
  multi: "Plusieurs réponses",
  number: "À un chiffre près",
  text: "Réponse libre",
  reveal: "Marlène dévoile",
  blind: "Blind test",
  outfit: "Le pyjama parfait",
  pin: "Code mystère",
  photo: "Qui est qui ?",
  match: "Qui va avec qui ?",
  creative: "Carte blanche",
  pictionary: "Pictionary",
  drawing: "Concours de dessin",
};
