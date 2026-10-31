"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Camera, Check, Crown, Users } from "lucide-react";
import { useParty } from "./use-party";
import {
  AppShell,
  AudioPlayer,
  GameMeta,
  QuestionHint,
  Loading,
  PlayerBubbles,
  Ranking,
  Reveal,
} from "./shared";
import { CakeArt, EmptyParty } from "./art";
import { Answer } from "./answer";
import { DrawingCanvas } from "./canvas";
import { SelfieStep } from "./selfie";
import { MarleneSlideshow } from "./marlene-photos";
import { OPEN, REVEALED } from "@/lib/game/types";
export function Play() {
  const c = useParty(),
    d = c.data;
  const [hint, setHint] = useState(false);
  // Set while a guest who already has a photo changes it from the lobby; a phase change
  // (the host opening a round) closes it.
  const [changingIn, setChangingIn] = useState<string | null>(null);
  const me = d?.players.find((p) => p.id === d.playerId);
  // A guest can't play without a selfie (the host, Marlène and the TV never need one),
  // except during an open round: a late arrival answers first and takes it right after.
  const showSelfie =
    !!me &&
    d!.role === "guest" &&
    !OPEN.includes(d!.phase) &&
    (!me.photo || changingIn === d!.phase);
  useEffect(() => {
    if (d?.initialized && d.role !== "guest") setHint(true);
  }, [d?.initialized, d?.role]);
  // No sign-in (the host started a new game, or the finished one was cleaned up): back to
  // the join screen to enter a name again.
  const signedOut = !!d?.initialized && !d.role;
  useEffect(() => {
    if (signedOut) location.replace("/");
  }, [signedOut]);
  return (
    <AppShell c={c} role="guest">
      {c.loading ? (
        <Loading />
      ) : !d?.initialized || !d.role ? (
        <div className="auth-card">
          <EmptyParty
            title="La fête est par ici."
            text="Entre ton petit nom pour nous rejoindre."
          />
          <a className="btn primary wide" href="/">
            Rejoindre la fête <ArrowRight size={18} />
          </a>
        </div>
      ) : showSelfie ? (
        <div className="guest-main">
          <SelfieStep data={d} c={c} onDone={() => setChangingIn(null)} />
        </div>
      ) : (
        <div className="guest-main">
          <div className="row between" style={{ marginBottom: 22 }}>
            <span className="small-text">
              Salut{" "}
              <strong>
                {d.players.find((p) => p.id === d.playerId)?.nickname}
              </strong>{" "}
              !
            </span>
            <span className="pill butter">
              {d.players.find((p) => p.id === d.playerId)?.score ?? 0} points
            </span>
          </div>
          {d.phase === "lobby" ? (
            <div className="panel">
              <EmptyParty
                title="Tu es sur la liste !"
                text="Installe-toi, fais chauffer tes souvenirs. L’hôte va bientôt lancer la fête."
              />
              <div className="row" style={{ justifyContent: "center" }}>
                <Users size={17} />
                <span className="small-text">
                  {d.players.length} invité{d.players.length > 1 ? "s" : ""}{" "}
                  dans la place
                </span>
              </div>
              <PlayerBubbles data={d} />
              <div className="row" style={{ justifyContent: "center" }}>
                <button
                  className="btn small"
                  style={{ marginTop: 22 }}
                  onClick={() => setChangingIn(d.phase)}
                >
                  <Camera size={16} />
                  Changer ma photo
                </button>
              </div>
              <MarleneSlideshow />
            </div>
          ) : d.phase === "leaderboard" || d.phase === "finished" ? (
            <Ranking data={d} final={d.phase === "finished"} />
          ) : (
            <div className="panel">
              <GameMeta data={d} />
              <h1 className="question-title">{d.question?.title}</h1>
              <QuestionHint kind={d.question?.kind} />
              {d.phase === "next_round" ? (
                <>
                  <EmptyParty
                    title="Une autre petite révélation ?"
                    text="L’hôte prépare la prochaine manche. Reste dans le coin."
                  />
                  <MarleneSlideshow />
                </>
              ) : d.phase === "waiting_for_marlene_answer" ? (
                <>
                  <EmptyParty
                    title="Marlène prépare la surprise…"
                    text="Un peu de patience. La reine a un plan."
                  />
                  <MarleneSlideshow />
                </>
              ) : OPEN.includes(d.phase) ? (
                <>
                  {d.question?.kind === "drawing" && d.answer?.prompt && (
                    <div className="notice" style={{ marginBottom: 15 }}>
                      Le thème : <strong>{d.answer.prompt}</strong>
                    </div>
                  )}
                  {d.question?.kind === "pictionary" && (
                    <>
                      <DrawingCanvas readOnly value={d.strokes} />
                      <p className="live-canvas-note">
                        <span className="live-dot" /> Marlène dessine en direct
                      </p>
                    </>
                  )}
                  <Answer key={d.roundId} data={d} c={c} />
                </>
              ) : REVEALED.includes(d.phase) ? (
                <Reveal data={d} />
              ) : d.phase === "voting_open" ? (
                <>
                  <EmptyParty
                    title="Le moment du verdict."
                    text="Marlène choisit son coup de cœur. Les artistes restent anonymes jusqu’au vote."
                  />
                  <Reveal data={d} />
                </>
              ) : (
                <>
                  <EmptyParty
                    title="Les jeux sont faits !"
                    text="On range les antisèches. La révélation arrive…"
                  />
                  <MarleneSlideshow />
                </>
              )}
            </div>
          )}
          <p className="progress-caption">
            {d.phase !== "lobby" &&
              `${d.submissionCount} / ${d.players.length} participations · `}
            Une fête. Une reine. Zéro pression.
          </p>
        </div>
      )}
    </AppShell>
  );
}
