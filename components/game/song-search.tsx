"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Music2, PencilLine, Search, Send, X } from "lucide-react";
import type { Song, View } from "@/lib/game/types";
import type { PartyClient } from "./use-party";

const MIN_CHARS = 2,
  DEBOUNCE_MS = 250;
type Status = "idle" | "loading" | "done" | "failed";

// Small square cover, or a note when the catalogue has none.
export function Cover({ src, size = 44 }: { src?: string; size?: number }) {
  return src ? (
    <img
      className="song-cover"
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  ) : (
    <span
      className="song-cover empty"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Music2 size={size / 2.2} />
    </span>
  );
}

// Blind test: the guest types, picks the song among live suggestions, then sends it.
// What they typed can be sent as is when the song can't be found (or the search is down).
export function SongSearch({ c }: { c: PartyClient }) {
  const [query, setQuery] = useState(""),
    // The last answer from /api/songs, for the text it was asked about.
    [found, setFound] = useState<{ q: string; songs: Song[]; ok: boolean }>(),
    [active, setActive] = useState(-1),
    [picked, setPicked] = useState<Song | null>(null);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const typed = query.trim();
  const searching = !picked && typed.length >= MIN_CHARS;
  useEffect(() => {
    if (!searching) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/songs?q=${encodeURIComponent(typed)}`, {
          signal: abort.signal,
        });
        const v = (await r.json()) as { songs?: Song[] };
        setFound({ q: typed, songs: v.songs ?? [], ok: r.ok });
      } catch {
        if (abort.signal.aborted) return;
        setFound({ q: typed, songs: [], ok: false });
      }
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [typed, searching]);
  // While the next answer is on its way, the previous suggestions stay on screen.
  const songs = searching ? (found?.songs ?? []) : [];
  const status: Status = !searching
    ? "idle"
    : found?.q !== typed
      ? "loading"
      : found.ok
        ? "done"
        : "failed";

  async function send(song: Song | null) {
    await c.command(
      "submit",
      song
        ? { value: `${song.artist} — ${song.title}`, song }
        : { value: typed },
    );
  }
  if (picked)
    return (
      <div className="song-search">
        <div className="song-picked" aria-live="polite">
          <Cover src={picked.cover} size={64} />
          <span className="song-text">
            <strong>{picked.title}</strong>
            <span>{picked.artist}</span>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Changer de chanson"
            onClick={() => {
              setPicked(null);
              setTimeout(() => input.current?.focus());
            }}
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="btn primary answer-submit"
          disabled={c.busy}
          onClick={() => void send(picked)}
        >
          {c.busy ? "Envoi…" : "Valider cette chanson"} <Check size={18} />
        </button>
      </div>
    );
  const open = typed.length >= MIN_CHARS;
  const free = open && status !== "loading" && status !== "idle";
  return (
    <div className="song-search">
      <label className="song-field">
        <span>Quelle est cette chanson ?</span>
        <span className="song-input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-expanded={open && songs.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              active >= 0 ? `${listId}-${active}` : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={80}
            placeholder="Un titre, un artiste…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && songs.length) {
                e.preventDefault();
                setActive((i) => (i + 1) % songs.length);
              } else if (e.key === "ArrowUp" && songs.length) {
                e.preventDefault();
                setActive((i) => (i <= 0 ? songs.length - 1 : i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (active >= 0 && songs[active]) setPicked(songs[active]);
              }
            }}
          />
        </span>
      </label>
      <p className="song-status" role="status">
        {!open
          ? "Tape au moins 2 lettres, puis choisis dans la liste."
          : status === "loading"
            ? "Je cherche…"
            : status === "failed"
              ? "La recherche ne répond pas. Envoie ta réponse telle quelle."
              : status === "done" && !songs.length
                ? "Aucune chanson trouvée."
                : songs.length
                  ? `${songs.length} chanson${songs.length > 1 ? "s" : ""}`
                  : ""}
      </p>
      {open && songs.length > 0 && (
        <ul
          className="song-list"
          id={listId}
          role="listbox"
          aria-label="Chansons"
        >
          {songs.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onClick={() => setPicked(s)}
            >
              <Cover src={s.cover} />
              <span className="song-text">
                <strong>{s.title}</strong>
                <span>{s.artist}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {free && (
        <button
          type="button"
          className="btn small song-free"
          disabled={c.busy}
          onClick={() => void send(null)}
        >
          <PencilLine size={16} /> Envoyer « {typed} » tel quel
          <Send size={15} />
        </button>
      )}
    </div>
  );
}

// After sending: the song the guest chose, on their own phone.
export function MySong({ data }: { data: View }) {
  const sub = data.mySubmission;
  if (!sub || typeof sub.value !== "string") return null;
  return (
    <div className="song-picked mine">
      <Cover src={sub.song?.cover} size={52} />
      <span className="song-text">
        <strong>{sub.song?.title ?? sub.value}</strong>
        {sub.song && <span>{sub.song.artist}</span>}
      </span>
    </div>
  );
}

// Both catalogues serve bigger covers at the same address with another size in it.
const largeCover = (url: string) =>
  url.replace("/56x56-", "/250x250-").replace("/60x60bb.", "/250x250bb.");
// The reveal: the right song, then what everyone answered.
export function SongReveal({ data }: { data: View }) {
  const picks = data.picks ?? [];
  const cover = picks.find((p) => p.correct && p.cover)?.cover;
  return (
    <>
      {cover && (
        <div className="song-reveal-cover">
          <Cover src={largeCover(cover)} size={120} />
        </div>
      )}
      {picks.length > 0 && (
        <ul className="song-picks" aria-label="Les réponses des invités">
          {picks.map((p) => (
            <li
              key={p.playerId}
              className={`${p.correct ? "right" : "wrong"}${p.playerId === data.playerId ? " me" : ""}`}
            >
              <Cover src={p.cover} size={36} />
              <span className="song-text">
                <strong>
                  {p.nickname}
                  {p.playerId === data.playerId ? " · toi" : ""}
                </strong>
                <span>{p.label}</span>
              </span>
              <span className="song-verdict">
                {p.correct ? "+1" : "−1"}
                <span className="sr-only">
                  {p.correct ? " bonne réponse" : " mauvaise réponse"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
