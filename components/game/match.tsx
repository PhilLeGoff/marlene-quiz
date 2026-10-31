/// <reference types="vite/client" />
"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { Question, View } from "@/lib/game/types";
// The photos of matching rounds, picked up at build time from assets/exes/ and hashed
// by Vite. A question names them by basename ("ex-1"), so no URL gives a name away.
const files = import.meta.glob(
  "/assets/exes/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
const PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [
    path
      .split("/")
      .pop()!
      .replace(/\.[^.]+$/, ""),
    url,
  ]),
);
export const matchPhotoUrl = (id: string): string | undefined => PHOTOS[id];
function Photo({ id, n }: { id: string; n: number }) {
  const src = matchPhotoUrl(id);
  return (
    <div className="match-photo">
      {/* Static, already sized files; next/image would add nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={`Photo ${n}`} draggable={false} />}
      <span className="match-number" aria-hidden="true">
        {n}
      </span>
    </div>
  );
}
/**
 * A guest names each photo by tapping one of the names under it. A name goes with one
 * photo only: picking it under another photo moves it there; tapping it again clears it.
 */
export function MatchAnswer({
  q,
  busy,
  onSubmit,
}: {
  q: Question;
  busy: boolean;
  onSubmit: (picks: string[]) => void;
}) {
  const photos = q.photos ?? [];
  const [picks, setPicks] = useState<string[]>(() => photos.map(() => ""));
  const pick = (i: number, name: string) =>
    setPicks((old) =>
      old.map((v, j) =>
        j === i ? (v === name ? "" : name) : v === name ? "" : v,
      ),
    );
  return (
    <div>
      <div className="match-answer">
        {photos.map((id, i) => (
          <div
            className="match-card"
            role="group"
            aria-label={`Photo ${i + 1}`}
            key={id}
          >
            <Photo id={id} n={i + 1} />
            <div className="match-chips">
              {q.options.map((name) => {
                const at = picks.indexOf(name);
                const mine = at === i,
                  elsewhere = at >= 0 && !mine;
                return (
                  <button
                    type="button"
                    key={name}
                    className={`match-chip ${mine ? "selected" : ""} ${elsewhere ? "used" : ""}`}
                    aria-pressed={mine}
                    disabled={busy}
                    onClick={() => pick(i, name)}
                  >
                    {mine && <Check size={15} aria-hidden="true" />}
                    <span>{name}</span>
                    {elsewhere && <small>photo {at + 1}</small>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="match-helper">
        Un prénom par photo, et chacun ne sert qu’une fois.
      </p>
      <button
        className="btn primary answer-submit"
        disabled={busy || picks.every((v) => !v)}
        onClick={() => onSubmit(picks)}
      >
        Valider mes associations <Check size={18} />
      </button>
    </div>
  );
}
/** The TV while the round is open: the photos, big, and the names apart from them. */
export function MatchBoard({ q }: { q: Question }) {
  return (
    <>
      <div className="match-board">
        {(q.photos ?? []).map((id, i) => (
          <figure className="match-tile" key={id}>
            <Photo id={id} n={i + 1} />
          </figure>
        ))}
      </div>
      <ul className="match-names" aria-label="Les prénoms à associer">
        {q.options.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </>
  );
}
/** The answer: each photo with its name, how many guests found it and, on a phone, your pick. */
export function MatchReveal({ data }: { data: View }) {
  const q = data.question;
  const key = data.answer?.answers ?? [];
  const mine = Array.isArray(data.mySubmission?.value)
    ? (data.mySubmission.value as string[])
    : undefined;
  const total = data.submissionCount;
  return (
    <div className="match-board reveal">
      {(q?.photos ?? []).map((id, i) => {
        const right = data.matchRight?.[i] ?? 0;
        const ok = !!mine && mine[i] === key[i];
        return (
          <figure className="match-tile" key={id}>
            <Photo id={id} n={i + 1} />
            <figcaption>
              <strong className="match-key">{key[i]}</strong>
              <span className="match-count">
                {right
                  ? `${right} invité${right > 1 ? "s" : ""} sur ${total} ${right > 1 ? "ont" : "a"} trouvé`
                  : "Personne n’a trouvé"}
              </span>
              {mine && (
                <span className={`match-mine ${ok ? "right" : "wrong"}`}>
                  {ok ? (
                    <Check size={15} aria-label="Bonne réponse" />
                  ) : (
                    <X size={15} aria-label="Raté" />
                  )}
                  Toi : {mine[i] || "rien"}
                </span>
              )}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
/** The host's (and Marlène's) private key: which name goes with each photo. */
export function MatchKeyFields({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="match-key-fields">
      {(q.photos ?? []).map((id, i) => (
        <label key={id} className="match-key-row">
          <Photo id={id} n={i + 1} />
          <span>
            Photo {i + 1}
            <select
              aria-label={`Prénom de la photo ${i + 1}`}
              value={value[i] ?? ""}
              required
              onChange={(e) =>
                onChange(
                  (q.photos ?? []).map((_, j) =>
                    j === i ? e.target.value : (value[j] ?? ""),
                  ),
                )
              }
            >
              <option value="">Choisir un prénom</option>
              {q.options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </span>
        </label>
      ))}
    </div>
  );
}
