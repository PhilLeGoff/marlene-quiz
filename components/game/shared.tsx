"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Crown,
  LogOut,
  Music2,
  Trophy,
  Users,
  WifiOff,
} from "lucide-react";
import { Brand, Avatar, Confetti } from "./art";
import type { PartyClient } from "./use-party";
import type { Question, Role, Stroke, View } from "@/lib/game/types";
import { kindLabels, REVEALED } from "@/lib/game/types";
import { DrawingCanvas, DrawingPreview } from "./canvas";
export const phaseLabels: Record<string, string> = {
  lobby: "Les invités arrivent",
  question_open: "À vous de jouer",
  submissions_closed: "Réponses fermées",
  reveal: "La vérité éclate",
  leaderboard: "Le classement",
  next_round: "Prochaine manche",
  finished: "La gloire éternelle",
  waiting_for_marlene_answer: "Marlène prépare la surprise",
  drawing_open: "À vos chefs-d’œuvre",
  drawing_submissions_closed: "Pinceaux posés",
  voting_open: "Le verdict de Marlène",
  winner_revealed: "On a notre artiste",
  pictionary_live: "Mais qu’est-ce qu’elle dessine ?",
  pictionary_winner: "Le mot a été trouvé !",
};
export function AppShell({
  c,
  children,
  role,
}: {
  c: PartyClient;
  children: React.ReactNode;
  role: Role;
}) {
  return (
    <div className={role === "marlene" ? "star-shell" : ""}>
      <div className={`app-shell${role === "admin" ? " admin-shell" : ""}`}>
        <header className="app-header">
          <Brand />
          <div className="app-header-actions">
            <span className={`connection ${c.connected ? "" : "offline"}`}>
              {c.connected ? (
                <span className="live-dot" />
              ) : (
                <WifiOff size={14} />
              )}{" "}
              {c.connected ? "En direct" : "Reconnexion…"}
            </span>
            {c.data?.role && role !== "present" && (
              <button
                className="icon-button"
                aria-label="Se déconnecter"
                onClick={async () => {
                  if (await c.command("logout"))
                    location.assign(role === "guest" ? "/" : `/${role}`);
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </header>
        <main id="main">
          {!c.connected && (
            <p className="reconnect" role="status">
              La connexion fait une petite pause. Tes réponses sont conservées ;
              on te reconnecte automatiquement.
            </p>
          )}
          {c.error && (
            <p className="error sticky-error" role="alert">
              {c.error}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <div className="spinner" />
      On prépare les confettis…
    </div>
  );
}
export function Timer({ data }: { data: View }) {
  const [now, setNow] = useState(Date.now());
  const offset = useRef(data.serverTime - Date.now());
  useEffect(() => {
    offset.current = data.serverTime - Date.now();
  }, [data.serverTime]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!data.deadline) return null;
  const sec = Math.max(
    0,
    Math.ceil((data.deadline - now - offset.current) / 1000),
  );
  return (
    <div
      className={`timer ${sec < 10 ? "urgent" : ""}`}
      aria-label={`${sec} secondes restantes`}
    >
      <Clock3 size={20} aria-hidden="true" />
      {sec}
      <span className="small-text">s</span>
    </div>
  );
}
export function GameMeta({ data }: { data: View }) {
  return (
    <div className="game-meta">
      <span className="pill lilac">
        {data.question ? kindLabels[data.question.kind] : "La fête"}
      </span>
      <span className="small-text muted">{phaseLabels[data.phase]}</span>
      <Timer data={data} />
    </div>
  );
}
export function PlayerBubbles({ data }: { data: View }) {
  return (
    <div className="player-bubbles">
      {data.players.map((p) => (
        <div className="player-bubble" key={p.id}>
          <Avatar index={p.avatar} size={48} />
          <span>{p.nickname}</span>
        </div>
      ))}
    </div>
  );
}
export function Ranking({
  data,
  final = false,
}: {
  data: View;
  final?: boolean;
}) {
  return (
    <div>
      {final && (
        <>
          <Confetti />
          <div className="page-title">
            <div>
              <span className="pill butter">
                <Trophy size={15} /> LA GLOIRE ÉTERNELLE
              </span>
              <h1 style={{ marginTop: 16 }}>Marlène, on t’aime !</h1>
              <p>Le classement passe. Les dossiers restent.</p>
            </div>
          </div>
          <div className="podium">
            {[1, 0, 2].map((i) => {
              const p = data.players[i];
              return p ? (
                <div
                  key={p.id}
                  className={`podium-place ${i === 0 ? "gold" : i === 2 ? "bronze" : ""}`}
                >
                  <Avatar index={p.avatar} size={i === 0 ? 70 : 55} />
                  <div className="podium-name">{p.nickname}</div>
                  <div className="podium-block">
                    {p.rank}
                    <small>{p.score} points</small>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </>
      )}
      {!final && (
        <h2 style={{ marginBottom: 20 }}>Le classement des légendes</h2>
      )}
      <div className="leaderboard">
        {data.players.map((p) => (
          <div
            key={p.id}
            className={`leaderboard-row ${p.id === data.playerId ? "me" : ""}`}
          >
            <span className="rank">{p.rank}</span>
            <Avatar index={p.avatar} />
            <span className="player-name">
              {p.nickname}
              {p.id === data.playerId ? " · toi" : ""}
            </span>
            {p.rank === 1 && <Crown size={20} aria-label="Première place" />}
            <span className="player-points">
              {p.score} <small>pts</small>
            </span>
          </div>
        ))}
      </div>
      {!data.players.length && (
        <p className="muted">Les légendes n’ont pas encore rejoint la fête.</p>
      )}
    </div>
  );
}
export function Reveal({ data }: { data: View }) {
  const q = data.question;
  const answer = data.answer;
  const winner = data.players.find((p) => p.id === data.winner);
  const me = data.players.find((p) => p.id === data.playerId);
  return (
    <div>
      {winner && (
        <div className="reveal-answer">
          <p>LA GLOIRE REVIENT À</p>
          <h2>
            {winner.nickname} <span aria-hidden="true">✦</span>
          </h2>
          <div className="score-change">
            +{q?.kind === "creative" ? q.bonus : 5} points !
          </div>
        </div>
      )}
      {answer &&
        (answer.text || answer.number !== undefined || answer.answers) && (
          <div className="reveal-answer">
            <p>ROULEMENT DE TAMBOUR…</p>
            <h2>
              {answer.answers?.join(" + ") ??
                answer.text ??
                `${answer.number} ${q?.unit ?? ""}`}
            </h2>
          </div>
        )}
      {q?.kind === "outfit" && <Outfit selected={answer?.answers ?? []} />}
      <Gallery data={data} />
      {data.result && (
        <div
          className={`round-result ${data.result.delta >= 0 ? "positive" : "negative"}`}
          role="status"
        >
          <strong>
            {data.result.delta > 0 ? "+" : ""}
            {data.result.delta} point
            {Math.abs(data.result.delta) !== 1 ? "s" : ""}
          </strong>
          <span>{data.result.reason}</span>
        </div>
      )}
      {me && (
        <p className="progress-caption">
          Ton total : <strong>{me.score} points</strong>.{" "}
          {me.score < 0
            ? "Tu nous fais une remontada ?"
            : "La légende est en marche."}
        </p>
      )}
    </div>
  );
}
export function Gallery({
  data,
  onSelect,
  selected,
}: {
  data: View;
  onSelect?: (id: string) => void;
  selected?: string;
}) {
  if (!data.gallery.length) return null;
  return (
    <div className="gallery">
      {data.gallery.map((item, i) =>
        onSelect ? (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`gallery-item ${selected === item.id ? "selected" : ""}`}
            aria-pressed={selected === item.id}
          >
            <DrawingPreview url={item.drawingUrl} fallback={item.strokes} />
            <span>
              Chef-d’œuvre n°{i + 1}
              {selected === item.id ? " · Mon coup de cœur" : ""}
            </span>
          </button>
        ) : (
          <div key={item.id} className="gallery-item">
            <DrawingPreview url={item.drawingUrl} fallback={item.strokes} />
            <span>{item.artist ?? `Chef-d’œuvre n°${i + 1}`}</span>
          </div>
        ),
      )}
    </div>
  );
}
export function Outfit({ selected }: { selected: string[] }) {
  return (
    <div className="outfit-display">
      <svg
        viewBox="0 0 160 240"
        role="img"
        aria-label={`Tenue : ${selected.join(", ") || "aucun vêtement sélectionné"}`}
      >
        <ellipse cx="80" cy="227" rx="50" ry="8" fill="#e1d3e7" />
        <path
          d="M53 93q27-13 54 0l-6 70H59z"
          fill="#f7d6c4"
          stroke="#604552"
          strokeWidth="2"
        />
        <path
          d="M60 157l-5 58h16l10-53 9 53h16l-5-58"
          fill="#f7d6c4"
          stroke="#604552"
          strokeWidth="2"
        />
        <circle
          cx="80"
          cy="55"
          r="30"
          fill="#f7d6c4"
          stroke="#604552"
          strokeWidth="2"
        />
        <path
          d="M50 57q-7-40 25-36 38-9 39 40l-17-20-16 6-18-8z"
          fill="#65444b"
        />
        {selected.includes("Bonnet de nuit") && (
          <g fill="#d9c9f4" stroke="#604552" strokeWidth="2">
            <path d="M49 41Q60 8 106 17L120 41Q92 28 49 41Z" />
            <circle cx="121" cy="42" r="7" fill="#fffaf2" />
          </g>
        )}
        <path
          d="M69 56v3m21-3v3m-17 9q7 6 14 0"
          fill="none"
          stroke="#604552"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M53 95l-16 56m69-56 17 56"
          stroke="#604552"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path
          d="M53 95l-16 56m69-56 17 56"
          stroke="#f7d6c4"
          strokeWidth="11"
          strokeLinecap="round"
        />
        {selected.includes("Pyjama intégral") && (
          <g fill="#a9cbb6" stroke="#604552" strokeWidth="2">
            <path d="M53 89L35 143L49 149L60 116L55 210H73L81 160L89 210H107L101 116L114 149L127 143L107 89L92 86Q80 101 68 86Z" />
            <path d="M81 103V161" fill="none" />
            <circle cx="86" cy="117" r="2" fill="#604552" />
            <circle cx="86" cy="132" r="2" fill="#604552" />
          </g>
        )}
        {selected.includes("T-shirt") && (
          <path
            d="M53 90l-14 27 16 9 5-13-1 34h42l-1-34 6 13 16-9-15-27-15-3q-12 17-24 0z"
            fill="#cbb7e7"
            stroke="#604552"
            strokeWidth="2"
          />
        )}
        {selected.includes("Short") && (
          <path
            d="M59 146h42l4 29H83l-3-12-3 12H55z"
            fill="#a9cbb6"
            stroke="#604552"
            strokeWidth="2"
          />
        )}
        {selected.includes("Chaussettes") && (
          <g fill="#fff1b3" stroke="#604552" strokeWidth="2">
            <path d="M53 199h19v22H46q-8-5 3-10h4z" />
            <path d="M88 199h19v12h4q11 5 3 10H88z" />
          </g>
        )}
        <path d="M120 45l4 8 9-1-6 7 3 8-8-4-7 5 1-9-7-5 9-1z" fill="#ffdf86" />
      </svg>
    </div>
  );
}
export function AudioPlayer({
  data,
  projector = false,
}: {
  data: View;
  projector?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  const q = data.question;
  useEffect(() => {
    const audio = ref.current;
    if (!audio || !q) return;
    if (data.audio.playing) {
      audio.currentTime = Math.max(
        q.clipStart,
        Math.min(
          q.clipEnd,
          data.audio.offset + (data.serverTime - data.audio.at) / 1000,
        ),
      );
      void audio.play().catch(() => setBlocked(true));
    } else audio.pause();
  }, [data.audio.playing, data.audio.at, q?.id]);
  if (!q?.media[0] || q.kind !== "blind") return null;
  const src = q.media[0] + (projector ? `&room=${data.room}` : "");
  return (
    <div className="audio-player">
      <div className="row">
        <Music2 size={20} />
        <strong>Ouvre grand les oreilles.</strong>
      </div>
      <audio
        ref={ref}
        src={src}
        controls
        preload="metadata"
        onTimeUpdate={() => {
          if (ref.current && ref.current.currentTime >= q.clipEnd)
            ref.current.pause();
        }}
      />
      {blocked && (
        <p>Appuie sur lecture pour autoriser le son sur cet écran.</p>
      )}
    </div>
  );
}
