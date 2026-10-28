"use client";
import { useState } from "react";
import { Check, LockKeyhole, Save } from "lucide-react";
import type { Question, Secret } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
export function PrivateForm({
  q,
  c,
  secret,
}: {
  q: Question;
  c: PartyClient;
  secret?: Secret;
}) {
  const [text, setText] = useState(secret?.text ?? ""),
    [num, setNum] = useState(secret?.number?.toString() ?? ""),
    [prompt, setPrompt] = useState(secret?.prompt ?? ""),
    [aliases, setAliases] = useState(secret?.aliases?.join("\n") ?? ""),
    [answers, setAnswers] = useState(secret?.answers ?? []),
    [saved, setSaved] = useState(false);
  const options = ["choice", "multi", "outfit", "photo"].includes(q.kind);
  const isDrawing = q.kind === "drawing";
  const isNum = q.kind === "number" || q.sensitive;
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
                type={q.kind === "choice" ? "radio" : "checkbox"}
                name={`key-${q.id}`}
                checked={answers.includes(v)}
                onChange={() => {
                  setSaved(false);
                  setAnswers((old) =>
                    q.kind === "choice"
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
              ? "Ton mot ou ta phrase secrète"
              : q.kind === "pin"
                ? "Un code fictif (4 à 8 chiffres)"
                : "Ta réponse"}
            <input
              required
              type={q.kind === "pin" ? "password" : "text"}
              maxLength={500}
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
