"use client";
import { EmptyParty } from "@/components/game/art";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main id="main" className="auth-card panel">
      <EmptyParty
        title="Un petit couac dans les confettis."
        text="Tes réponses déjà envoyées restent conservées. On réessaie ?"
      />
      <button className="btn primary wide" onClick={reset}>
        Réessayer
      </button>
      <a href="/" className="btn wide" style={{ marginTop: 12 }}>
        Retour à la fête
      </a>
    </main>
  );
}
