"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  CircleStop,
  Clipboard,
  Eye,
  Flag,
  ListOrdered,
  Monitor,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipForward,
  SquarePen,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { useParty } from "./use-party";
import {
  AppShell,
  AudioPlayer,
  GameMeta,
  QuestionHint,
  Loading,
  phaseLabels,
  photoUrl,
  PlayerBubbles,
  Ranking,
  Reveal,
} from "./shared";
import { AuthScreen } from "./auth-screen";
import { Avatar, EmptyParty } from "./art";
import { QuestionEditor } from "./editor";
import { PrivateForm } from "./private-form";
import { VipPinForm } from "./vip-pin-form";
import { MARLENE_PIN } from "@/lib/game/vip";
import { Modal } from "./modal";
import { DrawingCanvas, DrawingPreview } from "./canvas";
import type { Question, View } from "@/lib/game/types";
import { kindLabels, OPEN, REVEALED } from "@/lib/game/types";
// On "her answer is the key" rounds, Marlène's answer is the reference, not a guess to grade.
function isReference(d: View, playerId: string) {
  return (
    !!d.question?.keyFromMarlene &&
    d.players.find((p) => p.id === playerId)?.role === "marlene"
  );
}
import { formatTime, isTime } from "@/lib/game/time";
export function Admin() {
  const c = useParty("admin"),
    d = c.data;
  const [tab, setTab] = useState("live"),
    [edit, setEdit] = useState<Question | null>(null),
    [reset, setReset] = useState(false),
    [resetting, setResetting] = useState(false),
    [stopQuiz, setStopQuiz] = useState(false),
    [stopping, setStopping] = useState(false),
    [copied, setCopied] = useState(false),
    [adjustId, setAdjustId] = useState(""),
    [delta, setDelta] = useState(1),
    [reason, setReason] = useState(""),
    [deleteQ, setDeleteQ] = useState<Question | null>(null);
  async function copy() {
    await navigator.clipboard.writeText(`${location.origin}/`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  async function move(q: Question, direction: number) {
    if (!d?.questions) return;
    const list = d.questions.map((q) => q.id),
      i = list.indexOf(q.id),
      j = i + direction;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await c.command("reorder", { ids: list });
  }
  const question = d?.question;
  function openReset() {
    c.setError("");
    setStopQuiz(false);
    setReset(true);
  }
  return (
    <AppShell c={c} role="admin">
      {c.loading ? (
        <Loading />
      ) : d?.role !== "admin" ? (
        <AuthScreen c={c} />
      ) : (
        <>
          <div className="page-title">
            <div>
              <span className="pill coral">LES COULISSES DE LA FÊTE</span>
              <h1 style={{ marginTop: 12 }}>À toi de mener la danse.</h1>
              <p>
                Les invités jouent. Marlène règne. Tu gardes la télécommande.
              </p>
            </div>
            <div className="row">
              <div
                className="admin-game-controls"
                role="group"
                aria-label="Commandes de la partie"
              >
                <button
                  type="button"
                  className="btn lilac small"
                  onClick={openReset}
                >
                  <RotateCcw size={17} /> Recommencer
                </button>
                {d.phase !== "finished" && (
                  <button
                    type="button"
                    className="btn danger small admin-stop-button"
                    onClick={() => {
                      c.setError("");
                      setReset(false);
                      setStopQuiz(true);
                    }}
                  >
                    <CircleStop size={18} /> Arrêter le quiz
                  </button>
                )}
              </div>
              <button className="btn small" onClick={() => void copy()}>
                {copied ? <Check size={16} /> : <Clipboard size={16} />}{" "}
                {copied ? "Lien copié !" : "Inviter les copains"}
              </button>
              <a
                className="btn small lilac"
                href="/present"
                target="_blank"
                rel="noreferrer"
              >
                <Monitor size={16} /> Grand écran
              </a>
            </div>
          </div>
          <div className="status-strip">
            <div className="stat">
              <b>{d.players.length}</b>
              <span>Invités dans la place</span>
            </div>
            <div className="stat">
              <b>
                {d.submissionCount} / {d.roundPlayers}
              </b>
              <span>Participations de la manche</span>
            </div>
            <div className="stat">
              <b>{d.questions?.filter((q) => q.enabled).length}</b>
              <span>Manches au programme</span>
            </div>
          </div>
          <div className="tabs" role="tablist" aria-label="Sections de l’hôte">
            {[
              ["live", "La régie"],
              ["questions", "Les manches"],
              ["players", "Les invités"],
              ["settings", "Réglages"],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "live" && (
            <div className="admin-columns">
              <div className="stack">
                <section className="panel control-current">
                  <GameMeta data={d} />
                  {d.phase === "lobby" ? (
                    <>
                      <EmptyParty
                        title="Tout le monde a son verre ?"
                        text="Vérifie les réponses à confirmer dans Les manches, puis lance la première question."
                      />
                      <PlayerBubbles data={d} />
                    </>
                  ) : d.phase === "finished" ? (
                    <Ranking data={d} final />
                  ) : (
                    <>
                      <h2 className="question-title">{question?.title}</h2>
                      <QuestionHint kind={question?.kind} />
                      {d.phase === "leaderboard" ? (
                        <Ranking data={d} />
                      ) : REVEALED.includes(d.phase) ? (
                        <Reveal data={d} />
                      ) : (
                        <>
                          <p className="notice">
                            {phaseLabels[d.phase]} · {d.submissionCount}{" "}
                            participations.{" "}
                            {question?.keyFromMarlene
                              ? "La réponse de Marlène fera foi."
                              : question && !question.confirmed
                                ? "La bonne réponse reste à confirmer."
                                : ""}
                            {OPEN.includes(d.phase) &&
                              !["pictionary", "pin"].includes(
                                question?.kind ?? "",
                              ) &&
                              " La manche se ferme toute seule quand tout le monde a répondu."}
                          </p>
                          {question?.kind === "blind" && (
                            <AudioPlayer data={d} />
                          )}
                        </>
                      )}
                    </>
                  )}
                  <div className="host-actions">
                    {["lobby", "next_round"].includes(d.phase) && (
                      <button
                        className="btn primary"
                        disabled={c.busy}
                        onClick={() => void c.command("open")}
                      >
                        <Play size={18} />{" "}
                        {d.phase === "lobby"
                          ? "Lancer la fête"
                          : "Ouvrir la manche"}
                      </button>
                    )}
                    {(OPEN.includes(d.phase) ||
                      d.phase === "waiting_for_marlene_answer") && (
                      <>
                        <button
                          className="btn dark"
                          onClick={() => void c.command("close")}
                          disabled={c.busy}
                        >
                          <CircleStop size={17} /> Fermer les réponses
                        </button>
                        <button
                          className="btn small"
                          onClick={() =>
                            void c.command("timer", { seconds: 30 })
                          }
                          disabled={c.busy || !d.deadline}
                        >
                          Encore 30 secondes
                        </button>
                      </>
                    )}
                    {[
                      "submissions_closed",
                      "drawing_submissions_closed",
                    ].includes(d.phase) && (
                      <button
                        className="btn primary"
                        disabled={c.busy}
                        onClick={() => void c.command("reveal")}
                      >
                        <Eye size={18} />{" "}
                        {question?.kind === "drawing"
                          ? "Ouvrir le vote"
                          : "Révéler la réponse"}
                      </button>
                    )}
                    {REVEALED.includes(d.phase) &&
                      !["leaderboard", "finished"].includes(d.phase) && (
                        <button
                          className="btn lilac"
                          disabled={c.busy}
                          onClick={() => void c.command("leaderboard")}
                        >
                          <Trophy size={18} /> Voir le classement
                        </button>
                      )}
                    {[
                      "leaderboard",
                      "reveal",
                      "winner_revealed",
                      "pictionary_winner",
                      "submissions_closed",
                      "voting_open",
                    ].includes(d.phase) && (
                      <button
                        className="btn"
                        disabled={c.busy}
                        onClick={() => void c.command("next")}
                      >
                        <SkipForward size={18} />{" "}
                        {["submissions_closed", "voting_open"].includes(d.phase)
                          ? "Passer sans attribuer de points"
                          : "Manche suivante"}
                      </button>
                    )}
                  </div>
                  {question?.kind === "blind" && OPEN.includes(d.phase) && (
                    <div className="row" style={{ marginTop: 17 }}>
                      <button
                        className="btn lilac small"
                        onClick={() =>
                          void c.command("audio", { playing: true })
                        }
                      >
                        <Play size={16} /> Jouer / rejouer l’extrait
                      </button>
                      <button
                        className="btn small"
                        onClick={() =>
                          void c.command("audio", { playing: false })
                        }
                      >
                        <Pause size={16} /> Couper le son
                      </button>
                    </div>
                  )}
                </section>
                {question && !REVEALED.includes(d.phase) && (
                  <section className="panel">
                    <h2>Le petit secret de la manche</h2>
                    <PrivateForm
                      key={`${question.id}-${d.roundId}`}
                      q={d.questions!.find((q) => q.id === question.id)!}
                      c={c}
                      secret={d.secrets?.[question.id]}
                    />
                    <div className="divider" />
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!d.revealAllowed}
                        onChange={(e) =>
                          void c.command("allowReveal", {
                            allowed: e.target.checked,
                          })
                        }
                      />{" "}
                      Autoriser Marlène à déclencher la révélation
                    </label>
                  </section>
                )}
              </div>
              <section className="panel">
                <h2>Qui a rendu sa copie ?</h2>
                {!d.submissions?.length ? (
                  <EmptyParty
                    title="Le suspense est entier."
                    text="Les participations apparaîtront ici en direct."
                  />
                ) : (
                  d.submissions.map((sub) => (
                    <div className="submission-row" key={sub.id}>
                      <div className="row between">
                        <strong>
                          {d.players.find((p) => p.id === sub.playerId)
                            ?.nickname ?? "Invité"}
                          {isReference(d, sub.playerId) && " · la référence"}
                        </strong>
                        <span className="muted">
                          {(sub.elapsed / 1000).toFixed(1)} s
                          {sub.moderated ? " · Retirée" : ""}
                        </span>
                      </div>
                      {sub.drawingId ? (
                        <div className="submission-preview">
                          <DrawingPreview
                            url={`/api/drawing?id=${sub.drawingId}`}
                          />
                        </div>
                      ) : (
                        <div className="submission-value">
                          {Array.isArray(sub.value) &&
                          sub.value[0] &&
                          typeof sub.value[0] === "object"
                            ? "Un chef-d’œuvre attend son verdict."
                            : Array.isArray(sub.value) &&
                                question?.kind === "match"
                              ? sub.value
                                  .map((v, i) => `${i + 1} : ${v || "—"}`)
                                  .join(" · ")
                              : Array.isArray(sub.value)
                                ? sub.value.join(", ")
                                : typeof sub.value === "number" &&
                                    isTime(question)
                                  ? formatTime(sub.value)
                                  : String(sub.value)}
                        </div>
                      )}
                      {!sub.moderated && (
                        <div className="row">
                          {["text", "reveal"].includes(question?.kind ?? "") &&
                            !isReference(d, sub.playerId) &&
                            ["reveal", "leaderboard"].includes(d.phase) && (
                              <>
                                <button
                                  className="btn small mint"
                                  onClick={() =>
                                    void c.command("grade", {
                                      submissionId: sub.id,
                                      correct: true,
                                    })
                                  }
                                >
                                  Valider +1
                                </button>
                                <button
                                  className="btn small"
                                  onClick={() =>
                                    void c.command("grade", {
                                      submissionId: sub.id,
                                      correct: false,
                                    })
                                  }
                                >
                                  Refuser −1
                                </button>
                              </>
                            )}
                          {question?.kind === "pictionary" && !d.winner && (
                            <button
                              className="btn small mint"
                              onClick={() =>
                                void c.command("adjudicate", {
                                  submissionId: sub.id,
                                })
                              }
                            >
                              Accepter ce mot +5
                            </button>
                          )}
                          <button
                            className="btn small"
                            onClick={() =>
                              void c.command("moderate", {
                                submissionId: sub.id,
                              })
                            }
                          >
                            <Flag size={13} /> Retirer
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </section>
            </div>
          )}
          {tab === "questions" && (
            <section className="panel">
              <div className="row between" style={{ marginBottom: 20 }}>
                <div>
                  <h2>Le menu des petits dossiers</h2>
                  <p className="small-text muted">
                    Les clés non confirmées ne seront jamais devinées. Modifie
                    et vérifie chaque manche.
                  </p>
                </div>
                <button
                  className="btn primary small"
                  disabled={!["lobby", "finished"].includes(d.phase)}
                  onClick={() => void c.command("add")}
                >
                  <Plus size={16} /> Ajouter
                </button>
              </div>
              {d.questions?.map((q, i) => (
                <article
                  key={q.id}
                  className={`question-card ${d.question?.id === q.id ? "active" : ""} ${q.enabled ? "" : "disabled"}`}
                >
                  <div className="question-card-head">
                    <div>
                      <h3>
                        {i + 1}. {q.title}
                      </h3>
                      <div className="question-card-meta">
                        <span>{kindLabels[q.kind]}</span>
                        <span>· {q.duration} s</span>
                        <span>
                          {!q.enabled
                            ? "Désactivée"
                            : q.confirmed
                              ? "✓ Réponse confirmée"
                              : "À confirmer"}
                        </span>
                        {q.generated.length > 0 && (
                          <span>Propositions générées</span>
                        )}
                      </div>
                    </div>
                    <div className="question-card-buttons">
                      <button
                        className="icon-button"
                        aria-label={`Monter la manche ${i + 1}`}
                        disabled={
                          i === 0 || !["lobby", "finished"].includes(d.phase)
                        }
                        onClick={() => void move(q, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Descendre la manche ${i + 1}`}
                        disabled={
                          i === d.questions!.length - 1 ||
                          !["lobby", "finished"].includes(d.phase)
                        }
                        onClick={() => void move(q, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Modifier ${q.title}`}
                        onClick={() => {
                          c.setError("");
                          setEdit(q);
                        }}
                      >
                        <SquarePen size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Supprimer ${q.title}`}
                        disabled={
                          !["lobby", "finished"].includes(d.phase) ||
                          d.questions!.length <= 1
                        }
                        onClick={() => setDeleteQ(q)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
          {tab === "players" && (
            <div className="two-columns">
              <section className="panel">
                <Ranking data={d} />
                {d.players.some((p) => p.photo) && (
                  <div className="stack" style={{ marginTop: 30 }}>
                    <h2>Les selfies</h2>
                    <p className="small-text muted">
                      Une photo de trop ? Retire-la : l’invité devra en
                      reprendre une pour continuer.
                    </p>
                    {d.players
                      .filter((p) => p.photo)
                      .map((p) => (
                        <div className="row between" key={p.id}>
                          <span className="row">
                            <Avatar index={p.avatar} photo={photoUrl(d, p)} />
                            <strong>{p.nickname}</strong>
                          </span>
                          <button
                            className="btn danger small"
                            aria-label={`Retirer la photo de ${p.nickname}`}
                            onClick={async () => {
                              c.setError("");
                              const r = await fetch(
                                `/api/avatar?as=admin&playerId=${encodeURIComponent(p.id)}`,
                                { method: "DELETE" },
                              );
                              if (!r.ok)
                                c.setError("La photo n’a pas pu être retirée.");
                              await c.refresh();
                            }}
                          >
                            <Trash2 size={16} /> Retirer
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>Un point de justice</h2>
                <p className="small-text muted" style={{ marginBottom: 20 }}>
                  Chaque ajustement est conservé dans l’historique, sans effacer
                  les scores précédents.
                </p>
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await c.command("adjust", {
                        playerId: adjustId,
                        delta,
                        reason,
                      })
                    ) {
                      setReason("");
                    }
                  }}
                >
                  <label>
                    L’invité
                    <select
                      value={adjustId}
                      required
                      onChange={(e) => setAdjustId(e.target.value)}
                    >
                      <option value="">Choisir une légende</option>
                      {d.players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Points à ajouter ou retirer
                    <input
                      type="number"
                      min={-100}
                      max={100}
                      value={delta}
                      onChange={(e) => setDelta(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Le motif
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      maxLength={200}
                      placeholder="Ex. Réponse équivalente acceptée"
                    />
                  </label>
                  <button className="btn lilac" disabled={c.busy}>
                    <ShieldCheck size={17} /> Appliquer l’ajustement
                  </button>
                </form>
                <div className="divider" />
                <h3>Le livre des points</h3>
                {d.events
                  ?.slice(-20)
                  .reverse()
                  .map((e) => (
                    <div className="submission-row" key={e.id}>
                      <strong>
                        {d.players.find((p) => p.id === e.playerId)?.nickname}
                      </strong>{" "}
                      · {e.delta > 0 ? "+" : ""}
                      {e.delta}
                      <p className="small-text muted">{e.reason}</p>
                    </div>
                  ))}
              </section>
            </div>
          )}
          {tab === "settings" && (
            <div className="two-columns">
              <section className="panel">
                <h2>La fête, en quelques chiffres</h2>
                <p className="notice">
                  Bonne réponse : +1 · Mauvaise : −1 · Pas de réponse : 0.
                  Réponses multiples : +1 par case juste, −1 par case fausse.
                  Dessin gagnant et premier mot trouvé : +5. Les scores négatifs
                  sont possibles.
                </p>
                <div className="divider" />
                <h3>Accès des invités</h3>
                <p className="small-text muted">
                  Partage le lien de la fête. Chaque personne entre son nom,
                  sans mot de passe ni code à saisir. Un nom déjà utilisé par
                  une autre personne est refusé.
                </p>
                <div className="divider" />
                <h3>Questions facultatives</h3>
                <p className="small-text muted">
                  Le défi photo et « Body count ? » sont désactivés au départ.
                  Active-les dans Les manches si Marlène est d’accord, ou
                  passe-les.
                </p>
                <div className="divider" />
                <h3>Code VIP de Marlène</h3>
                <p className="small-text muted" style={{ marginBottom: 14 }}>
                  Marlène entre ce code pour ouvrir son espace (par défaut{" "}
                  {MARLENE_PIN}). Le code actuel n’est jamais affiché ici.
                </p>
                <VipPinForm c={c} />
              </section>
              <section className="danger-zone">
                <h3>On remet les compteurs à zéro ?</h3>
                <p className="small-text muted" style={{ marginBottom: 18 }}>
                  Une nouvelle partie garde les questions et les invités. Les
                  anciens points restent dans l’historique, mais ne comptent
                  plus au classement.
                </p>
                <button className="btn danger" onClick={openReset}>
                  <RotateCcw size={17} /> Nouvelle partie
                </button>
              </section>
            </div>
          )}
          {edit && (
            <QuestionEditor q={edit} c={c} onClose={() => setEdit(null)} />
          )}{" "}
          {deleteQ && (
            <Modal
              title="Supprimer une manche"
              onClose={() => setDeleteQ(null)}
            >
              <h2>On enlève ce dossier ?</h2>
              <p>{deleteQ.title}</p>
              <button
                className="btn danger"
                onClick={async () => {
                  if (await c.command("delete", { questionId: deleteQ.id }))
                    setDeleteQ(null);
                }}
              >
                Supprimer la manche
              </button>
            </Modal>
          )}
          {stopQuiz && (
            <Modal title="Arrêter le quiz" onClose={() => setStopQuiz(false)}>
              <h2>On arrête le quiz ?</h2>
              <p>
                Les réponses, le chrono et le son seront arrêtés. Le classement
                actuel sera affiché à tout le monde. Les réponses non encore
                notées ne rapporteront aucun point.
              </p>
              {c.error && (
                <p className="error" role="alert">
                  {c.error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={stopping}
                  onClick={() => setStopQuiz(false)}
                >
                  Continuer le quiz
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={stopping}
                  onClick={async () => {
                    setStopping(true);
                    try {
                      if (await c.command("finish")) {
                        setStopQuiz(false);
                        setTab("live");
                      }
                    } finally {
                      setStopping(false);
                    }
                  }}
                >
                  <CircleStop size={17} />{" "}
                  {stopping ? "Arrêt en cours…" : "Oui, arrêter le quiz"}
                </button>
              </div>
            </Modal>
          )}
          {reset && (
            <Modal
              title="Réinitialiser la partie"
              onClose={() => setReset(false)}
            >
              <h2>On recommence à zéro ?</h2>
              <p>
                Les points, le classement, les participations et les dessins
                seront remis à zéro. Tout le monde reviendra au salon, sans
                devoir se reconnecter. Les questions et leurs bonnes réponses
                enregistrées seront conservées.
              </p>
              {c.error && (
                <p className="error" role="alert">
                  {c.error}
                </p>
              )}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setResetting(true);
                  try {
                    if (await c.command("reset", { confirm: d.room })) {
                      setReset(false);
                      setStopQuiz(false);
                      setEdit(null);
                      setDeleteQ(null);
                      setTab("live");
                    }
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={resetting}
                    onClick={() => setReset(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="btn lilac"
                    disabled={resetting}
                  >
                    <RotateCcw size={17} />{" "}
                    {resetting ? "Remise à zéro…" : "Oui, recommencer"}
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </AppShell>
  );
}
