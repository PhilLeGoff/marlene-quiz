"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, Maximize, Monitor, Users } from "lucide-react";
import { useParty } from "./use-party";
import { Brand, EmptyParty } from "./art";
import {
  AudioPlayer,
  GameMeta,
  Gallery,
  Loading,
  PlayerBubbles,
  Ranking,
  Reveal,
  Timer,
} from "./shared";
import { DrawingCanvas } from "./canvas";
import { OPEN, REVEALED } from "@/lib/game/types";
export function Present() {
  const [room, setRoom] = useState(""),
    [input, setInput] = useState(""),
    [origin, setOrigin] = useState("");
  const c = useParty("present", room),
    d = c.data;
  useEffect(() => {
    setOrigin(location.origin);
    const r = new URLSearchParams(location.search).get("room");
    if (r) {
      setRoom(r);
      setInput(r);
    }
  }, []);
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
          {room && <span className="room-badge">{room}</span>}
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
        {!room ? (
          <div className="auth-card panel">
            <span className="pill lilac">
              <Monitor size={16} /> LE GRAND ÉCRAN
            </span>
            <h1 style={{ fontSize: 35, margin: "20px 0" }}>
              Toute la fête, en grand.
            </h1>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                setRoom(input);
                history.replaceState(null, "", `/present?room=${input}`);
              }}
            >
              <label>
                Code de la fête
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={input}
                  onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <button className="btn primary">
                Afficher la fête <ArrowRight size={18} />
              </button>
            </form>
          </div>
        ) : c.loading ? (
          <Loading />
        ) : !d?.role ? (
          <EmptyParty
            title="La salle se fait désirer."
            text="Vérifie le code de la fête. La projection se connectera automatiquement."
          />
        ) : d.phase === "lobby" ? (
          <>
            <div className="projector-join">
              <div className="qr-wrap">
                <QRCodeSVG
                  value={`${origin}/?room=${room}`}
                  size={220}
                  bgColor="#ffffff"
                  fgColor="#392938"
                  title="Scanner pour rejoindre la fête"
                />
              </div>
              <div>
                <span className="pill butter">
                  JOYEUX ANNIVERSAIRE MARLÈNE 🎂
                </span>
                <h1 className="question-title" style={{ textAlign: "left" }}>
                  Qui connaît vraiment Marlène ?
                </h1>
                <p className="muted">
                  Scanne, entre ton nom et rejoins la fête.
                </p>
                <div className="projector-code">{room}</div>
              </div>
            </div>
            <PlayerBubbles data={d} />
          </>
        ) : d.phase === "finished" || d.phase === "leaderboard" ? (
          <Ranking data={d} final={d.phase === "finished"} />
        ) : (
          <>
            <GameMeta data={d} />
            <h1 className="question-title">{d.question?.title}</h1>
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
              <>
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
                  {d.submissionCount} / {d.players.length} participations reçues
                </p>
              </>
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
