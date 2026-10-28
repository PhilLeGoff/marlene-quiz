import { ArrowRight } from "lucide-react";
import { Brand, EmptyParty } from "@/components/game/art";
export default function NotFound() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Brand />
        <span className="pill butter">404 · INVITATION ÉGARÉE</span>
      </header>
      <main id="main" className="auth-card">
        <EmptyParty
          title="Ce dossier s’est égaré."
          text="La fête continue par ici. On te garde une place."
        />
        <a className="btn primary wide" href="/">
          Retour à la fête <ArrowRight size={18} />
        </a>
      </main>
    </div>
  );
}
