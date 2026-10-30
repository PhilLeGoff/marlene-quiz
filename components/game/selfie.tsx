"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw, Trash2 } from "lucide-react";
import type { View } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
import { Avatar } from "./art";
import { photoUrl } from "./shared";
const SIZE = 512;
const skipKey = (playerId: string) => `marlene-selfie-later:${playerId}`;
export function selfieSkipped(playerId: string) {
  try {
    return localStorage.getItem(skipKey(playerId)) === "1";
  } catch {
    return false;
  }
}
function rememberSkip(playerId: string) {
  try {
    localStorage.setItem(skipKey(playerId), "1");
  } catch {}
}
// Centre-crops to a square and scales down, so a phone uploads ~60 Ko instead of a 4 Mo photo.
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error())),
      "image/jpeg",
      0.85,
    ),
  );
}
export function SelfieStep({
  data,
  c,
  onDone,
}: {
  data: View;
  c: PartyClient;
  onDone: () => void;
}) {
  const me = data.players.find((p) => p.id === data.playerId);
  const input = useRef<HTMLInputElement>(null),
    previewUrl = useRef("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => () => URL.revokeObjectURL(previewUrl.current), []);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const blob = await squareJpeg(file);
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      setPhoto({ blob, url: previewUrl.current });
    } catch {
      setError("Impossible de lire cette photo. Essaie avec une autre.");
    }
  }
  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/avatar", {
        method,
        ...(method === "POST"
          ? { headers: { "Content-Type": "image/jpeg" }, body: photo!.blob }
          : {}),
      });
      if (!r.ok)
        throw new Error(
          ((await r.json().catch(() => ({}))) as { error?: string }).error,
        );
      await c.refresh();
      return true;
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Un petit couac. Réessaie.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function later() {
    if (me && !me.photo) rememberSkip(me.id);
    onDone();
  }
  if (!me) return null;
  return (
    <div className="panel selfie-step">
      <span className="pill butter">DERNIÈRE PETITE ÉTAPE</span>
      <h1>Un selfie pour la postérité ?</h1>
      <p className="muted">
        Ta tête s’affiche à côté de ton nom, sur les téléphones et sur le grand
        écran. C’est plus drôle quand on voit qui gagne.
      </p>
      <div className="selfie-frame">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="Aperçu de ton selfie" />
        ) : (
          <Avatar index={me.avatar} photo={photoUrl(data, me)} size={180} />
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        // Opened by the buttons below, so screen readers don't get a duplicate control.
        tabIndex={-1}
        aria-hidden="true"
        onChange={pick}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="stack">
        {photo ? (
          <>
            <button
              className="btn primary wide"
              disabled={busy}
              onClick={async () => {
                if (await send("POST")) onDone();
              }}
            >
              {busy ? "On imprime ta photo…" : "C’est moi !"}{" "}
              <Check size={18} />
            </button>
            <button
              className="btn wide"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              Reprendre <RotateCcw size={18} />
            </button>
          </>
        ) : (
          <button
            className="btn primary wide"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {me.photo ? "Prendre un autre selfie" : "Prendre mon selfie"}{" "}
            <Camera size={18} />
          </button>
        )}
        {me.photo && !photo && (
          <button
            className="btn danger wide"
            disabled={busy}
            onClick={() => void send("DELETE")}
          >
            Retirer ma photo <Trash2 size={18} />
          </button>
        )}
      </div>
      <button className="selfie-later" disabled={busy} onClick={later}>
        {me.photo ? "Retour à la fête" : "Plus tard"}
      </button>
    </div>
  );
}
