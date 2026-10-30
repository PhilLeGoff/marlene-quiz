"use client";
import { useState } from "react";
import { Check, LockKeyhole, Send } from "lucide-react";
import type { Stroke, View } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
import { DrawingCanvas, DrawingPreview } from "./canvas";
import { Outfit } from "./shared";
import { PinPad } from "./pin-pad";
export function Answer({ data, c }: { data: View; c: PartyClient }) {
  const q = data.question!;
  const [selected, setSelected] = useState<string[]>([]),
    [text, setText] = useState(""),
    [strokes, setStrokes] = useState<Stroke[]>([]);
  const expired = !!data.deadline && data.deadline <= data.serverTime;
  const repeat = q.kind === "pictionary" || q.kind === "pin";
  const attempts = data.mySubmission?.attempts ?? 0;
  async function submit(value: unknown) {
    const ok = await c.command("submit", { value });
    if (ok && repeat) setText("");
  }
  if (data.submitted && !repeat)
    return (
      <div className="answer-received" role="status">
        <Check size={38} />
        <h2>C’est dans la boîte !</h2>
        <p>Ta réponse est bien au chaud. Place au suspense.</p>
        {q.kind === "drawing" && (
          <DrawingPreview
            url={
              data.mySubmission?.drawingId
                ? `/api/drawing?id=${data.mySubmission.drawingId}`
                : undefined
            }
            fallback={data.mySubmission?.value as Stroke[]}
          />
        )}
      </div>
    );
  if (expired)
    return (
      <p className="notice">
        Driiiing ! Le temps est écoulé. L’hôte prépare la suite.
      </p>
    );
  const single = q.kind === "choice" || q.kind === "blind";
  const select = (v: string) =>
    setSelected((old) =>
      single ? [v] : old.includes(v) ? old.filter((x) => x !== v) : [...old, v],
    );
  if (
    ["choice", "multi", "outfit", "photo"].includes(q.kind) ||
    (q.kind === "blind" && q.options.length > 0)
  )
    return (
      <div>
        {q.kind === "outfit" && <Outfit selected={selected} />}
        <div
          className={`answer-grid ${q.options.length > 6 ? "large" : q.options.length > 4 ? "six" : ""}`}
        >
          {q.options.map((v, i) => (
            <button
              key={v}
              disabled={c.busy}
              className={`answer-option ${selected.includes(v) ? "selected" : ""}`}
              aria-pressed={selected.includes(v)}
              onClick={() => select(v)}
            >
              <span className="answer-letter">
                {selected.includes(v) ? (
                  <Check size={16} />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              {q.kind === "photo" && q.media[i] && (
                <img src={q.media[i]} alt={`Image à identifier ${i + 1}`} />
              )}
              <span>{v}</span>
            </button>
          ))}
        </div>
        <p className="answer-helper">
          {single
            ? "Une seule réponse. Fais confiance à ton instinct."
            : "Plusieurs réponses possibles : +1 par bonne réponse cochée, −1 par mauvaise."}
        </p>
        <button
          className="btn primary answer-submit"
          disabled={(!selected.length && q.kind !== "outfit") || c.busy}
          onClick={() => void submit(selected)}
        >
          Valider mon {q.kind === "outfit" ? "pyjama" : "choix"}{" "}
          <Check size={18} />
        </button>
      </div>
    );
  if (q.kind === "drawing")
    return (
      <div>
        <DrawingCanvas value={strokes} onChange={setStrokes} />
        <button
          className="btn primary answer-submit"
          disabled={!strokes.length || c.busy}
          onClick={() => void submit(strokes)}
        >
          Envoyer mon chef-d’œuvre <Send size={17} />
        </button>
        <p className="answer-helper">
          Ton dessin sera présenté sans ton nom. Picasso n’a qu’à bien se tenir.
        </p>
      </div>
    );
  if (q.kind === "pin")
    return (
      <div>
        <p className="notice">
          <LockKeyhole
            size={17}
            style={{ display: "inline", verticalAlign: "middle" }}
          />{" "}
          Un code inventé pour la fête. Aucun vrai code de téléphone.
        </p>
        <PinPad
          value={text}
          onChange={setText}
          onSubmit={() => void submit(text)}
          busy={c.busy}
          disabled={
            expired || attempts >= q.attempts || !!data.mySubmission?.correct
          }
          label="Le code mystère à 6 chiffres"
          submitLabel="Essayer ce code"
        />
        <p className="attempts" role="status">
          {data.mySubmission?.correct
            ? "Bien joué ! Coffre déverrouillé."
            : `${attempts} / ${q.attempts} tentatives utilisées${attempts ? " · Ce n’est pas encore ça." : ""}`}
        </p>
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(q.kind === "number" || q.sensitive ? Number(text) : text);
      }}
      className="stack"
    >
      <label>
        {q.kind === "number" || q.sensitive
          ? `Ton estimation (${q.unit})`
          : q.kind === "pictionary"
            ? "Alors, c’est quoi ce dessin ?"
            : "Ta réponse"}
        {q.kind === "number" || q.sensitive ? (
          <input
            className="number-answer"
            type="number"
            inputMode="decimal"
            step="any"
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="?"
          />
        ) : q.kind === "pictionary" ? (
          <input
            autoComplete="off"
            required
            maxLength={100}
            placeholder="Je tente ma chance…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <textarea
            required
            maxLength={500}
            placeholder={
              q.kind === "creative"
                ? "Ton imagination entre en scène…"
                : "Balance ton meilleur pronostic…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </label>
      {q.kind === "pictionary" && attempts > 0 && (
        <p className="notice" role="status">
          « {String(data.mySubmission?.value)} » : pas encore ! Essaie encore.
        </p>
      )}
      <button className="btn primary" disabled={!text.trim() || c.busy}>
        {c.busy
          ? "Envoi…"
          : q.kind === "pictionary"
            ? "C’est mon dernier mot !"
            : "Envoyer ma réponse"}{" "}
        <Send size={18} />
      </button>
      {q.sensitive && (
        <p className="answer-helper">
          Tu peux simplement passer, sans aucun point perdu.
        </p>
      )}
    </form>
  );
}
