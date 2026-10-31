"use client";
import { useState } from "react";
import { Check, LockKeyhole, Send } from "lucide-react";
import type { Stroke, View } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
import { DrawingCanvas, DrawingPreview } from "./canvas";
import { Outfit } from "./shared";
import { PinPad } from "./pin-pad";
import { PIN_LENGTH } from "@/lib/game/vip";
import { MarleneSlideshow } from "./marlene-photos";
import { formatGap, formatNumber, formatTime, isTime } from "@/lib/game/time";
import { MatchAnswer } from "./match";
import { MySong, SongSearch } from "./song-search";
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
        {q.kind === "blind" && <MySong data={data} />}
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
        <MarleneSlideshow />
      </div>
    );
  if (expired)
    return (
      <>
        <p className="notice">
          Driiiing ! Le temps est écoulé. L’hôte prépare la suite.
        </p>
        <MarleneSlideshow />
      </>
    );
  if (q.kind === "match")
    return <MatchAnswer q={q} busy={c.busy} onSubmit={(v) => void submit(v)} />;
  if (q.kind === "blind") return <SongSearch c={c} />;
  // On the rounds whose key is Marlène's own answer, everyone knows hers is the one that counts.
  const reference = !!q.keyFromMarlene && data.role === "marlene";
  const keyNote = q.keyFromMarlene ? (
    <p className="notice key-note">
      {reference
        ? "Ta réponse sera la bonne réponse : les invités seront notés par rapport à elle. Pas de points pour toi sur cette manche."
        : "C’est la réponse de Marlène qui fera foi."}
    </p>
  ) : null;
  const single = q.kind === "choice";
  const select = (v: string) =>
    setSelected((old) =>
      single ? [v] : old.includes(v) ? old.filter((x) => x !== v) : [...old, v],
    );
  if (["choice", "multi", "outfit", "photo"].includes(q.kind))
    return (
      <div>
        {keyNote}
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
        {!reference && (
          <p className="answer-helper">
            {single
              ? "Une seule réponse. Fais confiance à ton instinct."
              : "Coche tout ce qui colle : +1 par bonne réponse, −1 par mauvaise."}
          </p>
        )}
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
          label={`Le code mystère à ${PIN_LENGTH} chiffres`}
          submitLabel="Essayer ce code"
        />
        <p className="attempts" role="status">
          {data.mySubmission?.correct
            ? "Bien joué ! Coffre déverrouillé."
            : `${attempts} / ${q.attempts} tentatives utilisées${attempts ? " · Ce n’est pas encore ça." : ""}`}
        </p>
        {(attempts >= q.attempts || !!data.mySubmission?.correct) && (
          <MarleneSlideshow />
        )}
      </div>
    );
  if (q.kind === "number" && q.slider) {
    const { min, max, step } = q.slider;
    const value =
      text === "" ? Math.round((min + max) / 2 / step) * step : Number(text);
    const time = isTime(q);
    const show = (n: number) =>
      time ? (
        formatTime(n)
      ) : (
        <>
          {n} <small>{q.unit}</small>
        </>
      );
    const per = q.slider.pointEvery ?? step;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
        className="stack"
      >
        {keyNote}
        <label className="slider-answer">
          Ton estimation
          <output aria-hidden="true">{show(value)}</output>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label="Ton estimation"
            aria-valuetext={time ? formatGap(value) : `${value} ${q.unit}`}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="slider-bounds" aria-hidden="true">
            <span>{formatNumber(q, min)}</span>
            <span>{formatNumber(q, max)}</span>
          </span>
        </label>
        {!reference && (
          <p className="answer-helper">
            Pile poil : +5 points.{" "}
            {time
              ? per === 60
                ? "Chaque minute d’écart"
                : `Chaque tranche de ${formatGap(per)} d’écart`
              : `Chaque ${per === 1 ? "" : `${per} `}${q.unit} d’écart`}{" "}
            en retire un, et ça peut descendre sous zéro.
          </p>
        )}
        <button className="btn primary" disabled={c.busy}>
          {c.busy ? "Envoi…" : "Envoyer ma réponse"} <Send size={18} />
        </button>
      </form>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(q.kind === "number" ? Number(text) : text);
      }}
      className="stack"
    >
      {keyNote}
      <label>
        {q.kind === "number"
          ? `Ton estimation (${q.unit})`
          : q.kind === "pictionary"
            ? "Alors, c’est quoi ce dessin ?"
            : "Ta réponse"}
        {q.kind === "number" ? (
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
    </form>
  );
}
