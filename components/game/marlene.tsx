"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Crown,
  Eye,
  Heart,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useParty } from "./use-party";
import {
  AppShell,
  Gallery,
  GameMeta,
  Loading,
  phaseLabels,
  Reveal,
} from "./shared";
import { AuthScreen } from "./auth-screen";
import { CrownBadge, EmptyParty } from "./art";
import { PrivateForm } from "./private-form";
import { DrawingCanvas } from "./canvas";
import { Modal } from "./modal";
import type { Command, Stroke } from "@/lib/game/types";
import { REVEALED } from "@/lib/game/types";
export function Marlene() {
  const c = useParty("marlene"),
    d = c.data;
  const [selectedQuestion, setSelectedQuestion] = useState(""),
    [selectedVote, setSelectedVote] = useState(""),
    [confirmVote, setConfirmVote] = useState(false),
    [consentCheck, setConsentCheck] = useState(false),
    [localStrokes, setLocalStrokes] = useState<Stroke[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    setSelectedVote("");
    setLocalStrokes([]);
  }, [d?.roundId]);
  const q =
    d?.questions?.find((q) => q.id === (selectedQuestion || d.question?.id)) ??
    d?.questions?.find((q) => q.enabled && !q.confirmed);
  const current = d?.question;
  function stream(action: string, values: Record<string, unknown> = {}) {
    queue.current = queue.current.then(() => c.command(action, values, true));
  }
  return (
    <AppShell c={c} role="marlene">
      {c.loading ? (
        <Loading />
      ) : d?.role !== "marlene" ? (
        <AuthScreen c={c} star />
      ) : (
        <>
          <div className="page-title">
            <div>
              <CrownBadge />
              <h1 style={{ marginTop: 16 }}>Ce soir, c’est toi la reine.</h1>
              <p>Tu connais les réponses. Eux, ils croient les connaître.</p>
            </div>
            <span className="pill lilac">
              <Sparkles size={15} /> {phaseLabels[d.phase]}
            </span>
          </div>
          <div className="two-columns">
            <div className="stack">
              <section className="panel star-current">
                <GameMeta data={d} />
                {!current ? (
                  <EmptyParty
                    title="Bienvenue dans ton royaume."
                    text="Profite de l’attente pour compléter tes réponses secrètes. L’hôte s’occupe du rythme."
                  />
                ) : (
                  <>
                    <h2 className="question-title">{current.title}</h2>
                    {current.kind === "pictionary" &&
                    d.phase === "pictionary_live" ? (
                      <>
                        <p className="notice" style={{ marginBottom: 15 }}>
                          Ton mot secret :{" "}
                          <strong>{d.secrets?.[current.id]?.text}</strong>. À
                          toi de le faire deviner !
                        </p>
                        <DrawingCanvas
                          value={localStrokes}
                          onChange={setLocalStrokes}
                          onStroke={(stroke) => stream("stroke", { stroke })}
                          onUndo={() =>
                            stream("undoStroke", {
                              strokeId: localStrokes.at(-1)?.id,
                            })
                          }
                          onClear={() => stream("clearStrokes")}
                        />
                        <p className="live-canvas-note">
                          <span className="live-dot" /> Ton dessin arrive en
                          direct sur les autres écrans.
                        </p>
                      </>
                    ) : current.kind === "drawing" &&
                      d.phase === "voting_open" ? (
                      <>
                        <p className="notice" style={{ marginBottom: 18 }}>
                          Les artistes sont anonymes. Choisis ton préféré, puis
                          confirme ton vote final.
                        </p>
                        <Gallery
                          data={d}
                          selected={selectedVote}
                          onSelect={setSelectedVote}
                        />
                        <button
                          className="btn lilac wide"
                          style={{ marginTop: 18 }}
                          disabled={!selectedVote || c.busy}
                          onClick={() => setConfirmVote(true)}
                        >
                          <Heart size={18} /> Confirmer mon coup de cœur (+5)
                        </button>
                      </>
                    ) : current.kind === "creative" &&
                      d.phase === "reveal" &&
                      !d.winner ? (
                      <>
                        <p className="notice">
                          La meilleure excuse mérite ton coup de cœur.
                        </p>
                        {d.submissions?.map((s, i) => (
                          <button
                            key={s.id}
                            className={`answer-option ${selectedVote === s.id ? "selected" : ""}`}
                            style={{ width: "100%", marginTop: 12 }}
                            onClick={() => setSelectedVote(s.id)}
                            aria-pressed={selectedVote === s.id}
                          >
                            <span className="answer-letter">{i + 1}</span>
                            {String(s.value)}
                          </button>
                        ))}
                        <button
                          className="btn lilac wide"
                          style={{ marginTop: 18 }}
                          disabled={!selectedVote || c.busy}
                          onClick={() => setConfirmVote(true)}
                        >
                          <Heart size={18} /> Mon coup de cœur (+{current.bonus}
                          )
                        </button>
                      </>
                    ) : REVEALED.includes(d.phase) ? (
                      <Reveal data={d} />
                    ) : (
                      <EmptyParty
                        title={
                          d.phase === "drawing_open"
                            ? "Les artistes sont au travail."
                            : "La fête suit son cours."
                        }
                        text={
                          d.phase === "drawing_open"
                            ? "Tu pourras choisir ton dessin préféré lorsque l’hôte ouvrira le vote."
                            : "Complète ta réponse à droite, puis laisse l’hôte préparer la révélation."
                        }
                      />
                    )}
                  </>
                )}
                {d.revealAllowed && d.phase === "submissions_closed" && (
                  <button
                    className="btn primary wide"
                    onClick={() => void c.command("starReveal")}
                    style={{ marginTop: 20 }}
                  >
                    <Eye size={18} /> Révéler ma réponse
                  </button>
                )}
              </section>
              <section className="sensitive-consent">
                <h3>
                  <ShieldCheck
                    size={19}
                    style={{
                      display: "inline",
                      verticalAlign: "middle",
                      marginRight: 7,
                    }}
                  />{" "}
                  Toi seule décides.
                </h3>
                <p>
                  La manche « Body count ? » est désactivée au départ. Tu peux
                  l’autoriser, passer ou retirer ton accord à tout moment. Ta
                  réponse est supprimée en passant à la suite, en fin de partie
                  ou après deux heures.
                </p>
                {d.consent ? (
                  <>
                    <p className="saved">
                      <Check size={17} /> Tu as autorisé cette manche
                      facultative.
                    </p>
                    <button
                      className="btn"
                      onClick={() => void c.command("withdraw")}
                    >
                      Retirer mon accord et effacer ma réponse
                    </button>
                  </>
                ) : (
                  <>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={consentCheck}
                        onChange={(e) => setConsentCheck(e.target.checked)}
                      />{" "}
                      J’accepte explicitement que cette manche puisse être
                      activée et que ma réponse soit révélée pendant le jeu.
                    </label>
                    <button
                      className="btn lilac"
                      style={{ marginTop: 12 }}
                      disabled={!consentCheck || c.busy}
                      onClick={() => void c.command("consent")}
                    >
                      Autoriser cette manche
                    </button>
                  </>
                )}
              </section>
            </div>
            <section className="panel">
              <h2>
                <LockKeyhole
                  size={19}
                  style={{
                    display: "inline",
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                />{" "}
                Tes petits secrets
              </h2>
              <p className="small-text muted" style={{ marginBottom: 20 }}>
                Rien ne part chez les invités avant le feu vert de l’hôte. Les
                titres des chansons restent aussi bien à l’abri.
              </p>
              <label>
                Choisir une manche
                <select
                  value={q?.id ?? ""}
                  onChange={(e) => setSelectedQuestion(e.target.value)}
                >
                  <option value="">Choisir une question</option>
                  {d.questions
                    ?.filter((q) => !q.sensitive || d.consent)
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.confirmed ? "✓" : "?"} {q.title}
                      </option>
                    ))}
                </select>
              </label>
              {q && (
                <div style={{ marginTop: 20 }}>
                  {q.note && <p className="question-note">{q.note}</p>}
                  {q.sensitive && !d.consent ? (
                    <p className="notice">
                      Tu gardes le choix de passer cette manche.
                    </p>
                  ) : (
                    <PrivateForm
                      key={`${q.id}-${d.roundId}`}
                      q={q}
                      c={c}
                      secret={d.secrets?.[q.id]}
                    />
                  )}
                </div>
              )}
            </section>
          </div>
          {confirmVote && (
            <Modal
              title="Confirmer le vote final"
              onClose={() => setConfirmVote(false)}
            >
              <span className="pill butter">
                <Crown size={15} /> LE VERDICT ROYAL
              </span>
              <h2>C’est ton dernier mot ?</h2>
              <p>
                Ton vote sera définitif. Le gagnant recevra{" "}
                {current?.kind === "drawing" ? 5 : current?.bonus} points et son
                nom sera révélé.
              </p>
              <button
                className="btn lilac wide"
                disabled={c.busy}
                onClick={async () => {
                  if (await c.command("vote", { submissionId: selectedVote }))
                    setConfirmVote(false);
                }}
              >
                <Heart size={18} /> Oui, c’est mon coup de cœur !
              </button>
            </Modal>
          )}
        </>
      )}
    </AppShell>
  );
}
