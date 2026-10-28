"use client";
import "./globals.css";
export default function GlobalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body>
        <main id="main" className="auth-card panel">
          <h1>Les confettis ont fait un détour.</h1>
          <p style={{ margin: "20px 0" }}>
            Un petit souci nous empêche d’afficher la fête. Tu peux réessayer.
          </p>
          <button className="btn primary wide" onClick={reset}>
            Réessayer
          </button>
          <a href="/" className="btn wide" style={{ marginTop: 12 }}>
            Retour à la fête
          </a>
        </main>
      </body>
    </html>
  );
}
