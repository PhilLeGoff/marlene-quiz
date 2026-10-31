"use client";
import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import type { ReportSummary } from "@/lib/game/report";
const date = (ms: number) =>
  new Date(ms).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
// Past games kept after each reset: a list, and the chosen report shown in place.
export function Archives() {
  const [list, setList] = useState<ReportSummary[] | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/reports", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setList(await r.json());
      })
      .catch(() => setError("Les archives n’ont pas pu être chargées."));
  }, []);
  const chosen = list?.find((r) => r.id === open);
  return (
    <section className="panel archives">
      <h2>Archives</h2>
      <p className="small-text muted" style={{ marginBottom: 16 }}>
        Chaque partie terminée est gardée ici, avec ses réponses, ses points,
        ses selfies et ses dessins, même après une nouvelle partie.
      </p>
      {error && <p className="notice">{error}</p>}
      {list && !list.length && (
        <p className="muted">Aucune partie archivée pour l’instant.</p>
      )}
      {!!list?.length && (
        <table className="archives-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Joueurs</th>
              <th>Gagnant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} aria-current={r.id === open || undefined}>
                <td>
                  {date(r.startedAt)}
                  {!r.finished && (
                    <small className="muted"> · interrompue</small>
                  )}
                </td>
                <td>{r.players}</td>
                <td>{r.winners.join(", ") || "—"}</td>
                <td>
                  <button
                    type="button"
                    className="btn small lilac"
                    aria-label={`Ouvrir la partie du ${date(r.startedAt)}`}
                    onClick={() => setOpen(r.id)}
                  >
                    <FileText size={16} /> Ouvrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {chosen && (
        <div className="stack" style={{ marginTop: 24 }}>
          <div className="row between">
            <h3>Partie du {date(chosen.startedAt)}</h3>
            <div className="row">
              <a
                className="btn small"
                href={`/api/reports?id=${chosen.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} /> Plein écran
              </a>
              <a
                className="btn small lilac"
                href={`/api/reports?id=${chosen.id}&download=1`}
                download
              >
                <Download size={16} /> Télécharger
              </a>
            </div>
          </div>
          <iframe
            className="archive-frame"
            title="Rapport de la partie"
            src={`/api/reports?id=${chosen.id}`}
            style={{
              width: "100%",
              height: "80vh",
              border: "1px solid var(--line, #eadfe8)",
              borderRadius: 16,
              background: "#fff",
            }}
          />
        </div>
      )}
    </section>
  );
}
