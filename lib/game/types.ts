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
  sensitive: boolean;
  media: string[];
  clipStart: number;
  clipEnd: number;
  // A number round answered with a slider instead of typing, e.g. a height in cm.
  slider?: { min: number; max: number; step: number };
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
  consent: boolean;
  consentAt: number;
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
  consent?: boolean;
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
  creative: "Carte blanche",
  pictionary: "Pictionary",
  drawing: "Concours de dessin",
};
