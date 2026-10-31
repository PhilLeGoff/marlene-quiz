"use client";
import { useState } from "react";
import { Check, LockKeyhole, Save, SquarePen } from "lucide-react";
import type { Question, Secret } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
import { PIN_LENGTH } from "@/lib/game/vip";
import { keyFromMarlene } from "@/lib/game/types";
// The host's answer-key form. Marlène never sets keys: on the rounds whose key is her own
// in-game answer, what the host types here only counts if she doesn't answer.
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
  const [text, setText] = useState(secret?.text ?? ""),
    [num, setNum] = useState(secret?.number?.toString() ?? ""),
    [prompt, setPrompt] = useState(secret?.prompt ?? ""),
    [aliases, setAliases] = useState(secret?.aliases?.join("\n") ?? ""),
    [answers, setAnswers] = useState(secret?.answers ?? []),
    [saved, setSaved] = useState(false);
  const options =
    ["choice", "multi", "outfit", "photo"].includes(q.kind) ||
    (q.kind === "blind" && q.options.length > 0);
  const isDrawing = q.kind === "drawing";
  const isNum = q.kind === "number";
  if (q.kind === "creative")
    return (
      <section className="notice">
        Aucune bonne réponse à préparer : les invités inventent leurs excuses et
        Marlène choisit sa préférée au moment du vote.
      </section>
    );
  const fallback = keyFromMarlene(q) ? (
    <p className="notice key-note">
      La réponse que Marlène donne pendant la manche fait foi. Ce que tu saisis
      ici ne sert qu’en secours, si elle ne répond pas.
    </p>
  ) : null;
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
        {fallback}
        <p className="small-text muted">
          Rien à ressaisir : cette réponse sera utilisée automatiquement et
          restera mémorisée pour les prochaines parties.
        </p>
        <p>
          <strong>
            {secret?.answers?.join(" + ") ??
              secret?.text ??
              (secret?.number !== undefined
                ? `${secret.number} ${q.unit}`
                : secret?.prompt)}
          </strong>
        </p>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setText(secret?.text ?? "");
            setNum(secret?.number?.toString() ?? "");
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
        else if (isNum) values.number = Number(num);
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
        {isDrawing ? "Le thème du dessin" : "La réponse, en privé"}
      </h3>
      {fallback}
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
              ? "Le mot ou la phrase que Marlène dessinera"
              : q.kind === "pin"
                ? `Code fictif à ${PIN_LENGTH} chiffres`
                : "La réponse"}
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
