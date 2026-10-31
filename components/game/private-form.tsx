"use client";
import { useState } from "react";
import { Check, LockKeyhole, Save, SquarePen } from "lucide-react";
import type { Question, Secret } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
import { PIN_LENGTH } from "@/lib/game/vip";
import { formatNumber, formatTime, isTime, parseTime } from "@/lib/game/time";
export function PrivateForm({
  q,
  c,
  secret,
}: {
  q: Question;
  c: PartyClient;
  secret?: Secret;
}) {
  const [editing, setEditing] = useState(false);
  // A time key (the 5 km) is typed as mm:ss and stored in seconds.
  const time = isTime(q);
  const shown = (n?: number) =>
    n === undefined ? "" : time ? formatTime(n) : n.toString();
  const [text, setText] = useState(secret?.text ?? ""),
    [num, setNum] = useState(shown(secret?.number)),
    [prompt, setPrompt] = useState(secret?.prompt ?? ""),
    [aliases, setAliases] = useState(secret?.aliases?.join("\n") ?? ""),
    [answers, setAnswers] = useState(secret?.answers ?? []),
    [saved, setSaved] = useState(false);
  const options =
    ["choice", "multi", "outfit", "photo"].includes(q.kind) ||
    (q.kind === "blind" && q.options.length > 0);
  const isDrawing = q.kind === "drawing";
  const isNum = q.kind === "number" || q.sensitive;
  if (q.kind === "creative")
    return (
      <section className="notice">
        Aucune bonne réponse à préparer : les invités inventent leurs excuses et
        Marlène choisit sa préférée au moment du vote.
      </section>
    );
  const prepared =
    (q.confirmed || saved) &&
    (secret?.number !== undefined ||
      !!secret?.text ||
      !!secret?.answers?.length ||
      !!secret?.prompt);
  if (prepared && !editing)
    return (
      <section className="secret-form">
        <h3>
          <Check
            size={18}
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginRight: 8,
            }}
          />
          Réponse déjà enregistrée
        </h3>
        <p className="small-text muted">
          Rien à ressaisir : cette réponse sera utilisée automatiquement et
          restera mémorisée pour les prochaines parties.
        </p>
        <p>
          <strong>
            {secret?.answers?.join(" + ") ??
              secret?.text ??
              (secret?.number !== undefined
                ? formatNumber(q, secret.number)
                : secret?.prompt)}
          </strong>
        </p>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setText(secret?.text ?? "");
            setNum(shown(secret?.number));
            setPrompt(secret?.prompt ?? "");
            setAnswers(secret?.answers ?? []);
            setAliases(secret?.aliases?.join("\n") ?? "");
            setEditing(true);
          }}
        >
          <SquarePen size={16} />
          Modifier la réponse
        </button>
      </section>
    );
  return (
    <form
      className="secret-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const values: Record<string, unknown> = { questionId: q.id };
        if (options) values.answers = answers;
        else if (isNum) values.number = time ? parseTime(num) : Number(num);
        else if (isDrawing) values.prompt = prompt;
        else {
          values.text = text;
          values.aliases = aliases
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean);
        }
        const ok = await c.command("private", values);
        setSaved(ok);
        if (ok) setEditing(false);
      }}
    >
      <h3>
        <LockKeyhole
          size={17}
          style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }}
        />
        {isDrawing ? "Ton thème de dessin" : "La réponse, en privé"}
      </h3>
      <p className="small-text muted">
        {isDrawing
          ? "Le thème sera visible dès l’ouverture du défi."
          : "Les invités ne verront rien avant la révélation autorisée par l’hôte."}
      </p>
      {options ? (
        <div className="check-options">
          {q.options.map((v) => (
            <label key={v} className="checkbox-label">
              <input
                type={
                  q.kind === "choice" || q.kind === "blind"
                    ? "radio"
                    : "checkbox"
                }
                name={`key-${q.id}`}
                checked={answers.includes(v)}
                onChange={() => {
                  setSaved(false);
                  setAnswers((old) =>
                    q.kind === "choice" || q.kind === "blind"
                      ? [v]
                      : old.includes(v)
                        ? old.filter((x) => x !== v)
                        : [...old, v],
                  );
                }}
              />
              {v}
            </label>
          ))}
        </div>
      ) : isNum && time ? (
        <label>
          Le bon temps <small>Minutes et secondes, par exemple 27:30</small>
          <input
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="27:30"
            value={num}
            onChange={(e) => {
              setSaved(false);
              setNum(e.target.value);
              e.target.setCustomValidity(
                parseTime(e.target.value) === null
                  ? "Écris le temps en minutes et secondes, par exemple 27:30."
                  : "",
              );
            }}
          />
        </label>
      ) : isNum ? (
        <label>
          La bonne valeur ({q.unit})
          <input
            type="number"
            step="any"
            required
            value={num}
            onChange={(e) => {
              setSaved(false);
              setNum(e.target.value);
            }}
          />
        </label>
      ) : isDrawing ? (
        <label>
          Le thème du concours
          <input
            maxLength={200}
            required
            value={prompt}
            onChange={(e) => {
              setSaved(false);
              setPrompt(e.target.value);
            }}
            placeholder="Ex. Marlène à 80 ans, toujours en soirée"
          />
        </label>
      ) : (
        <>
          <label>
            {q.kind === "pictionary"
              ? "Ton mot ou ta phrase secrète"
              : q.kind === "pin"
                ? `Code fictif à ${PIN_LENGTH} chiffres`
                : "Ta réponse"}
            <input
              required
              type={q.kind === "pin" ? "password" : "text"}
              inputMode={q.kind === "pin" ? "numeric" : undefined}
              pattern={q.kind === "pin" ? `[0-9]{${PIN_LENGTH}}` : undefined}
              minLength={q.kind === "pin" ? PIN_LENGTH : undefined}
              maxLength={q.kind === "pin" ? PIN_LENGTH : 500}
              value={text}
              onChange={(e) => {
                setSaved(false);
                setText(e.target.value);
              }}
              autoComplete="off"
            />
          </label>
          {["text", "blind", "pictionary"].includes(q.kind) && (
            <label>
              Autres réponses acceptées{" "}
              <small>
                Une par ligne. Les accents et la ponctuation sont ignorés.
              </small>
              <textarea
                value={aliases}
                onChange={(e) => {
                  setSaved(false);
                  setAliases(e.target.value);
                }}
              />
            </label>
          )}
        </>
      )}
      {saved && (
        <p className="saved" role="status">
          <Check size={16} /> C’est enregistré, bien à l’abri.
        </p>
      )}
      <button
        className="btn lilac"
        disabled={c.busy || (options && !answers.length)}
      >
        <Save size={16} />{" "}
        {isDrawing ? "Lancer ce thème" : "Enregistrer en privé"}
      </button>
    </form>
  );
}
