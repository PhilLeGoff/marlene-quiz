"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Crown, Eye, Heart, LockKeyhole } from "lucide-react";
import { useParty } from "./use-party";
import {
  AppShell,
  Gallery,
  GameMeta,
  QuestionHint,
  Loading,
  PlayerBubbles,
  Ranking,
  Reveal,
} from "./shared";
import { AuthScreen } from "./auth-screen";
import { CrownBadge, EmptyParty } from "./art";
import { Answer } from "./answer";
import { PrivateForm } from "./private-form";
import { DrawingCanvas } from "./canvas";
import { Modal } from "./modal";
import type { Stroke, View } from "@/lib/game/types";
import { OPEN, REVEALED, marleneLeads } from "@/lib/game/types";
// Marlène plays like every guest, from her own screen. She only leads the rounds about
// her: she draws the Pictionary word and judges the drawings and the creative answers.
export function Marlene() {
  const c = useParty("marlene"),
    d = c.data;
  const [selectedQuestion, setSelectedQuestion] = useState(""),
    [selectedVote, setSelectedVote] = useState(""),
    [confirmVote, setConfirmVote] = useState(false),
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
  const me = d?.players.find((p) => p.id === d.playerId);
  // While a round is open her answer (or her drawing) comes first: the secrets fold away.
  const roundOpen = !!d && OPEN.includes(d.phase);
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
              <p>Tu joues avec tout le monde. Prouve que tu te connais !</p>
            </div>
            <span className="pill butter">{me?.score ?? 0} points</span>
          </div>
          <div className="two-columns">
            <section className="panel star-current">
              {d.phase === "leaderboard" || d.phase === "finished" ? (
                <Ranking data={d} final={d.phase === "finished"} />
              ) : !current ? (
                <>
                  <GameMeta data={d} />
                  <EmptyParty
                    title="Bienvenue dans ton royaume."
                    text="Ce soir, tu réponds aux questions comme tout le monde. Tu mènes seulement le Pictionary et tu choisis les meilleurs dessins et les meilleures excuses."
                  />
                  <PlayerBubbles data={d} />
                </>
              ) : (
                <>
                  <GameMeta data={d} />
                  <h2 className="question-title">{current.title}</h2>
                  <QuestionHint kind={current.kind} />
                  {current.kind === "pictionary" &&
                  d.phase === "pictionary_live" ? (
                    <>
                      <p className="notice" style={{ marginBottom: 15 }}>
                        Ton mot secret :{" "}
                        <strong>{d.secrets?.[current.id]?.text}</strong>. À toi
                        de le faire deviner !
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
                        <Heart size={18} /> Mon coup de cœur (+{current.bonus})
                      </button>
                    </>
                  ) : roundOpen && !marleneLeads(current.kind) ? (
                    <Answer key={d.roundId} data={d} c={c} />
                  ) : REVEALED.includes(d.phase) ? (
                    <Reveal data={d} />
                  ) : (
                    <EmptyParty {...waiting(d)} />
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
            <details
              // Folded while a round is open, unfolded between rounds; she can open it anytime.
              key={roundOpen ? "folded" : "unfolded"}
              className="panel secrets-panel"
              open={!roundOpen}
            >
              <summary>
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
                <ChevronDown size={20} className="chevron" aria-hidden />
              </summary>
              <p className="small-text muted" style={{ marginBottom: 20 }}>
                Les bonnes réponses sur toi. Rien ne part chez les invités avant
                le feu vert de l’hôte.
              </p>
              <label>
                Choisir une manche
                <select
                  value={q?.id ?? ""}
                  onChange={(e) => setSelectedQuestion(e.target.value)}
                >
                  <option value="">Choisir une question</option>
                  {d.questions?.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.confirmed ? "✓" : "?"} {q.title}
                    </option>
                  ))}
                </select>
              </label>
              {q && (
                <div style={{ marginTop: 20 }}>
                  {q.note &&
                    (!q.confirmed ||
                      !q.note.startsWith("Réponse à confirmer")) && (
                      <p className="question-note">{q.note}</p>
                    )}
                  <PrivateForm
                    key={`${q.id}-${d.roundId}`}
                    q={q}
                    c={c}
                    secret={d.secrets?.[q.id]}
                  />
                </div>
              )}
            </details>
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
// What her screen says while there's nothing for her to answer.
function waiting(d: View) {
  const q = d.question!;
  if (d.phase === "drawing_open")
    return {
      title: "Les artistes sont au travail.",
      text: "Tu choisiras ton dessin préféré quand l’hôte ouvrira le vote.",
    };
  if (q.kind === "creative" && d.phase === "question_open")
    return {
      title: "Les invités cherchent leurs excuses.",
      text: "Tu choisiras ta préférée au moment de la révélation.",
    };
  if (d.phase === "waiting_for_marlene_answer")
    return {
      title: "Tout le monde t’attend !",
      text:
        q.kind === "pictionary"
          ? "Choisis ton mot secret dans « Tes petits secrets » pour lancer le dessin."
          : "Choisis le thème dans « Tes petits secrets » pour lancer le concours.",
    };
  if (d.phase === "next_round")
    return {
      title: "Une autre petite révélation ?",
      text: "L’hôte prépare la prochaine manche. Tu joueras comme tout le monde.",
    };
  return {
    title: "Les jeux sont faits !",
    text: "On range les antisèches. La révélation arrive…",
  };
}
