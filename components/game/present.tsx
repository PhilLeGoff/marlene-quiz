"use client";
import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Maximize, Users } from "lucide-react";
import { useParty } from "./use-party";
import { Brand, EmptyParty } from "./art";
import {
  AudioPlayer,
  GameMeta,
  QuestionHint,
  Gallery,
  Loading,
  PlayerBubbles,
  Ranking,
  Reveal,
} from "./shared";
import { DrawingCanvas } from "./canvas";
import { MarleneSlideshow, useMarlenePhotos } from "./marlene-photos";
import { OPEN, REVEALED } from "@/lib/game/types";
const noSubscribe = () => () => {};
/** What the TV shows before the game starts: a QR code big enough to scan from the sofa. */
function TvJoin({
  origin,
  title,
  text,
}: {
  origin: string;
  title: string;
  text: string;
}) {
  return (
    <div className="projector-join">
      <div className="tv-join-qr">
        <div className="qr-wrap">
          {/* The origin is only known in the browser: keep the space rather than show a wrong code. */}
          {origin && (
            <QRCodeSVG
              value={`${origin}/`}
              size={512}
              marginSize={4}
              level="M"
              bgColor="#ffffff"
              fgColor="#392938"
              title="Scanner pour rejoindre la fête"
            />
          )}
        </div>
      </div>
      <div className="tv-join-copy">
        <span className="pill butter">JOYEUX ANNIVERSAIRE MARLÈNE 🎂</span>
        <h1 className="question-title">{title}</h1>
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}
export function Present() {
  const origin = useSyncExternalStore(
    noSubscribe,
    () => location.origin,
    () => "",
  );
  const c = useParty("present"), d = c.data;
  const photos = useMarlenePhotos();
  const album =
    !!photos.length &&
    !!d &&
    OPEN.includes(d.phase) &&
    d.question?.kind !== "pictionary";
  return (
    <div className="presentation">
      <header>
        <Brand />
        <div className="row">
          <span className="small-text muted">
            <Users
              size={16}
              style={{ display: "inline", verticalAlign: "middle" }}
            />{" "}
            {d?.players?.length ?? 0} invités
          </span>
          <button
            className="icon-button"
            aria-label="Passer en plein écran"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen();
            }}
          >
            <Maximize size={19} />
          </button>
        </div>
      </header>
      <main id="main" className="presentation-main">
        {c.error && (
          <p className="error" role="alert">
            {c.error}
          </p>
        )}
        {c.loading ? (
          <Loading />
        ) : !d?.role ? (
          <TvJoin
            origin={origin}
            title="La fête se prépare…"
            text="Scanne, entre ton nom et rejoins la fête. Le grand écran s’allumera tout seul dès qu’elle sera ouverte."
          />
        ) : d.phase === "lobby" ? (
          <>
            <TvJoin
              origin={origin}
              title="Qui connaît vraiment Marlène ?"
              text="Scanne, entre ton nom et rejoins la fête."
            />
            <PlayerBubbles data={d} />
          </>
        ) : d.phase === "finished" || d.phase === "leaderboard" ? (
          <Ranking data={d} final={d.phase === "finished"} />
        ) : (
          <>
            <GameMeta data={d} />
            <h1 className="question-title">{d.question?.title}</h1>
            <QuestionHint kind={d.question?.kind} />
            {d.phase === "next_round" ? (
              <EmptyParty
                title="Le prochain dossier arrive…"
                text="Préparez vos téléphones et vos meilleures intuitions."
              />
            ) : d.phase === "waiting_for_marlene_answer" ? (
              <EmptyParty
                title="La reine prépare la surprise."
                text="Un peu de suspense, ça fait partie de la fête."
              />
            ) : REVEALED.includes(d.phase) ? (
              <Reveal data={d} />
            ) : d.phase === "voting_open" ? (
              <>
                <p
                  className="progress-caption"
                  style={{ fontSize: 20, marginBottom: 20 }}
                >
                  Le jury royal délibère. Les artistes sont encore anonymes.
                </p>
                <Gallery data={d} />
              </>
            ) : (
              // While everyone answers, the album of Marlène sits beside the question.
              // Not during Pictionary: the live drawing needs the whole screen.
              <div className={`present-stage ${album ? "album" : ""}`}>
                <div>
                  {d.question?.kind === "blind" && (
                    <AudioPlayer data={d} projector />
                  )}
                  {d.question?.kind === "pictionary" ? (
                    <div className="projection-drawing">
                      <DrawingCanvas readOnly value={d.strokes} />
                    </div>
                  ) : d.question?.kind === "drawing" ? (
                    <EmptyParty
                      title={d.answer?.prompt ?? "À vos chefs-d’œuvre !"}
                      text="Dessinez sur vos téléphones. Le talent est facultatif."
                    />
                  ) : d.question?.options.length ? (
                    <div
                      className={`answer-grid ${d.question.options.length > 6 ? "large" : d.question.options.length > 4 ? "six" : ""}`}
                    >
                      {d.question.options.map((v, i) => (
                        <div className="answer-option" key={v}>
                          <span className="answer-letter">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{v}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyParty
                      title={
                        OPEN.includes(d.phase)
                          ? "À vous de jouer !"
                          : "Les réponses sont fermées."
                      }
                      text="Tout se passe sur vos téléphones."
                    />
                  )}
                  <p className="progress-caption" style={{ fontSize: 20 }}>
                    {d.submissionCount} / {d.players.length} participations
                    reçues
                  </p>
                </div>
                {album && <MarleneSlideshow variant="tv" />}
              </div>
            )}
          </>
        )}
        {d && !c.connected && (
          <p className="reconnect">Reconnexion au direct…</p>
        )}
      </main>
    </div>
  );
}
