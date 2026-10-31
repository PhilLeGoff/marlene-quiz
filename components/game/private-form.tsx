"use client";
import { useState } from "react";
import { Check, LockKeyhole, Save, SquarePen } from "lucide-react";
import type { Question, Secret } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
import { PIN_LENGTH } from "@/lib/game/vip";
import { MatchKeyFields } from "./match";
import { formatNumber, formatTime, isTime, parseTime } from "@/lib/game/time";
import { keyFromMarlene } from "@/lib/game/types";
// The host's answer-key form. Marlène never sets keys: on the rounds whose key is her own
// in-game answer, what the host types here only counts if she doesn't answer.
import { songLabel, splitAnswer } from "@/lib/game/song";
// A blind-test key saved before the artist had its own field kept it in "Artist — Title".
const artistOf = (secret?: Secret) =>
  secret?.artist ??
  (secret?.answers?.[0] ? splitAnswer(secret.answers[0]).artist : "") ??
  "";
const titleOf = (q: Question, secret?: Secret) =>
  secret?.text ??
  (q.kind === "blind" && secret?.answers?.[0]
    ? splitAnswer(secret.answers[0]).title
    : "");
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
  const isBlind = q.kind === "blind";
  const [text, setText] = useState(titleOf(q, secret)),
    [artist, setArtist] = useState(artistOf(secret)),
    [num, setNum] = useState(shown(secret?.number)),
    [prompt, setPrompt] = useState(secret?.prompt ?? ""),
    [aliases, setAliases] = useState(secret?.aliases?.join("\n") ?? ""),
    [answers, setAnswers] = useState(secret?.answers ?? []),
    [saved, setSaved] = useState(false);
  const options = ["choice", "multi", "outfit", "photo"].includes(q.kind);
  const isMatch = q.kind === "match";
  // A matching key: one distinct name per photo.
  const matchReady =
    answers.length === (q.photos ?? []).length &&
    answers.every(Boolean) &&
    new Set(answers).size === answers.length;
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
            {isMatch
              ? secret?.answers
                  ?.map((name, i) => `Photo ${i + 1} : ${name}`)
                  .join(" · ")
              : ((isBlind ? songLabel(secret) : undefined) ??
                secret?.answers?.join(" + ") ??
                secret?.text ??
                (secret?.number !== undefined
                  ? formatNumber(q, secret.number)
                  : secret?.prompt))}
          </strong>
        </p>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setText(titleOf(q, secret));
            setArtist(artistOf(secret));
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
        if (options || isMatch) values.answers = answers;
        else if (isNum) values.number = time ? parseTime(num) : Number(num);
        else if (isDrawing) values.prompt = prompt;
        else {
          values.text = text;
          if (isBlind) values.artist = artist.trim();
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
      {isMatch ? (
        <>
          <MatchKeyFields
            q={q}
            value={answers}
            onChange={(next) => {
              setSaved(false);
              setAnswers(next);
            }}
          />
          {!matchReady && answers.some(Boolean) && (
            <p className="small-text muted">
              Donne un prénom différent à chaque photo.
            </p>
          )}
        </>
      ) : options ? (
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
              ? "Le mot ou la phrase que Marlène dessinera"
              : isBlind
                ? "Titre de la chanson"
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
          {isBlind && (
            <label>
              Artiste{" "}
              <small>
                Facultatif. S’il est rempli, une chanson choisie dans la
                recherche doit aussi être du bon artiste.
              </small>
              <input
                maxLength={200}
                value={artist}
                onChange={(e) => {
                  setSaved(false);
                  setArtist(e.target.value);
                }}
                autoComplete="off"
              />
            </label>
          )}
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
        disabled={
          c.busy || (options && !answers.length) || (isMatch && !matchReady)
        }
      >
        <Save size={16} />{" "}
        {isDrawing ? "Lancer ce thème" : "Enregistrer en privé"}
      </button>
    </form>
  );
}
