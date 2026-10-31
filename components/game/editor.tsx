"use client";
import { useState } from "react";
import { FileAudio, ImagePlus, Save, Trash2 } from "lucide-react";
import type { Kind, Question } from "@/lib/game/types";
import { canTakeMarleneKey, kindLabels } from "@/lib/game/types";
import type { PartyClient } from "./use-party";
import { Modal } from "./modal";
import { PrivateForm } from "./private-form";
import { ClipPicker } from "./clip-picker";
import { clipProblem } from "@/lib/game/clip";
export function QuestionEditor({
  q,
  c,
  onClose,
}: {
  q: Question;
  c: PartyClient;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...q }),
    [options, setOptions] = useState(q.options.join("\n")),
    [tab, setTab] = useState("question"),
    [uploading, setUploading] = useState(false),
    [media, setMedia] = useState(q.media);
  const [message, setMessage] = useState("");
  // Length of the blind-test song once the section picker has loaded it.
  const [songLength, setSongLength] = useState(0);
  async function upload(file: File) {
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/media", { method: "POST", body: form });
      const v = (await r.json()) as { error?: string; url: string };
      if (!r.ok) throw new Error(v.error);
      // A blind test plays one song: a new upload replaces it.
      setMedia((old) => (draft.kind === "blind" ? [v.url] : [...old, v.url]));
      setMessage(
        draft.kind === "blind"
          ? "Chanson importée. Choisis le passage, puis enregistre la manche."
          : "Média importé. Enregistre la question pour l’associer.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setUploading(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (draft.kind === "blind") {
      const problem = clipProblem(
        { start: draft.clipStart, end: draft.clipEnd },
        media[0] && songLength ? songLength : undefined,
      );
      if (problem) {
        setMessage(problem);
        return;
      }
    }
    const patch: Partial<Question> = {
      title: draft.title,
      note: draft.note,
      unit: draft.unit,
      enabled: draft.enabled,
      keyFromMarlene: !!draft.keyFromMarlene,
      duration: draft.duration,
      tolerance: draft.tolerance,
      bonus: draft.bonus,
      attempts: draft.attempts,
      clipStart: draft.clipStart,
      clipEnd: draft.clipEnd,
      media,
    };
    if (options !== q.options.join("\n"))
      patch.options = options
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
    if (draft.kind !== q.kind) patch.kind = draft.kind;
    if (await c.command("edit", { questionId: q.id, patch })) onClose();
  }
  const change = (name: keyof Question, value: unknown) =>
    setDraft((old) => ({ ...old, [name]: value }));
  return (
    <Modal title="Modifier la manche" onClose={onClose} wide>
      <span className="pill butter">MANCHE {q.source || "PERSO"}</span>
      <h2>Un peu de préparation.</h2>
      <div className="tabs" role="tablist" aria-label="Édition de la question">
        <button
          role="tab"
          aria-selected={tab === "question"}
          onClick={() => setTab("question")}
        >
          La question
        </button>
        <button
          role="tab"
          aria-selected={tab === "answer"}
          onClick={() => setTab("answer")}
        >
          La bonne réponse
        </button>
      </div>
      {c.error && (
        <p className="error" role="alert">
          {c.error}
        </p>
      )}
      {tab === "answer" ? (
        <PrivateForm key={q.id} q={q} c={c} secret={c.data?.secrets?.[q.id]} />
      ) : (
        <form className="stack" onSubmit={save}>
          <label>
            La question
            <textarea
              value={draft.title}
              maxLength={600}
              onChange={(e) => change("title", e.target.value)}
              required
            />
          </label>
          <div className="form-grid">
            <label>
              Type de manche
              <select
                value={draft.kind}
                onChange={(e) => change("kind", e.target.value as Kind)}
              >
                {Object.entries(kindLabels).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Temps pour répondre (secondes)
              <input
                type="number"
                min={10}
                max={3600}
                value={draft.duration}
                onChange={(e) => change("duration", Number(e.target.value))}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => change("enabled", e.target.checked)}
            />{" "}
            Inclure cette manche dans la fête
          </label>
          {canTakeMarleneKey(draft.kind) && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!draft.keyFromMarlene}
                onChange={(e) => change("keyFromMarlene", e.target.checked)}
              />
              <span>
                La réponse de Marlène fait foi
                <br />
                <small>
                  Elle répond pendant la manche et n’est pas notée ; les invités
                  sont notés par rapport à sa réponse.
                </small>
              </span>
            </label>
          )}
          {["choice", "multi", "outfit", "photo"].includes(draft.kind) && (
            <label>
              Réponses proposées{" "}
              <small>
                Une par ligne. Les propositions générées restent modifiables.
              </small>
              <textarea
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                style={{ minHeight: 180 }}
              />
            </label>
          )}
          {draft.kind === "number" && (
            <div className="form-grid">
              <label>
                Unité / période
                <input
                  value={draft.unit}
                  onChange={(e) => change("unit", e.target.value)}
                />
              </label>
              <label>
                Tolérance (+/−) <small>0 = réponse exacte</small>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draft.tolerance}
                  onChange={(e) => change("tolerance", Number(e.target.value))}
                />
              </label>
            </div>
          )}
          {draft.kind === "creative" && (
            <label>
              Bonus créatif <small>0 = pour le plaisir</small>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.bonus}
                onChange={(e) => change("bonus", Number(e.target.value))}
              />
            </label>
          )}
          {draft.kind === "pin" && (
            <label>
              Nombre de tentatives
              <input
                type="number"
                min={1}
                max={20}
                value={draft.attempts}
                onChange={(e) => change("attempts", Number(e.target.value))}
              />
            </label>
          )}
          {["blind", "photo"].includes(draft.kind) && (
            <>
              <p className="notice">
                {draft.kind === "blind"
                  ? "Importe uniquement un extrait audio dont tu disposes légalement. Aucun titre commercial n’est fourni."
                  : "Utilise des images autorisées. Aucun portrait ou montage reconnaissable sans consentement. Les options correspondent aux images dans le même ordre."}
              </p>
              <label className="file-label">
                {draft.kind === "blind" ? <FileAudio /> : <ImagePlus />}
                <span className="sr-only">Importer un média autorisé</span>
                <input
                  type="file"
                  accept={
                    draft.kind === "blind"
                      ? "audio/mpeg,audio/wav,audio/ogg,audio/mp4"
                      : "image/png,image/jpeg,image/webp"
                  }
                  disabled={uploading}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void upload(e.target.files[0]);
                  }}
                />
              </label>
              {message && (
                <p className="notice" role="status">
                  {message}
                </p>
              )}
              {media.map((url, i) => (
                <div className="row between" key={url}>
                  <span className="small-text">Média {i + 1}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Dissocier le média ${i + 1}`}
                    onClick={() => setMedia(media.filter((v) => v !== url))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {draft.kind === "blind" && (
                <ClipPicker
                  src={media[0]}
                  clip={{ start: draft.clipStart, end: draft.clipEnd }}
                  onChange={({ start, end }) =>
                    setDraft((old) => ({
                      ...old,
                      clipStart: start,
                      clipEnd: end,
                    }))
                  }
                  onDuration={setSongLength}
                />
              )}
            </>
          )}
          <label>
            Note de préparation
            <textarea
              value={draft.note}
              onChange={(e) => change("note", e.target.value)}
            />
          </label>
          {q.generated.length > 0 && (
            <p className="notice">
              Propositions générées à vérifier : {q.generated.join(", ")}.
            </p>
          )}
          <button className="btn primary" disabled={c.busy || uploading}>
            <Save size={17} /> Enregistrer la manche
          </button>
        </form>
      )}
    </Modal>
  );
}
