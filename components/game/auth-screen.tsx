"use client";
import { useState } from "react";
import { ArrowRight, Crown, LockKeyhole } from "lucide-react";
import type { PartyClient } from "./use-party";
export function AuthScreen({
  c,
  star = false,
}: {
  c: PartyClient;
  star?: boolean;
}) {
  const [password, setPassword] = useState(""),
    [starPassword, setStarPassword] = useState(""),
    [setupKey, setSetupKey] = useState("");
  const setup = !c.data?.initialized && !star;
  return (
    <div className="auth-card">
      <div className="panel">
        <span className={`pill ${star ? "lilac" : "butter"}`}>
          {star ? <Crown size={15} /> : <LockKeyhole size={15} />}{" "}
          {star ? "ACCÈS ROYAL" : "CÔTÉ COULISSES"}
        </span>
        <h1>
          {setup
            ? "On prépare la fête ?"
            : star
              ? "La reine est arrivée."
              : "À toi de mener la danse."}
        </h1>
        <p>
          {setup
            ? "Crée deux accès privés : le tien et celui de Marlène. Les invités n’auront besoin que du code de la salle."
            : star
              ? "Tes réponses, tes dessins, tes coups de cœur. Tout est prêt pour toi."
              : "Connecte-toi pour lancer les manches et faire tomber les dossiers."}
        </p>
        {star && !c.data?.initialized ? (
          <p className="notice">
            L’hôte n’a pas encore créé la fête. Reviens dans un instant.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await c.command(
                setup ? "setup" : "login",
                setup
                  ? { adminPassword: password, starPassword, setupKey }
                  : { password },
              );
              if (ok) {
                setPassword("");
                setStarPassword("");
              }
            }}
          >
            {setup && (
              <label>
                Clé d’installation{" "}
                <small>
                  Seulement si une clé a été configurée sur le serveur.
                </small>
                <input
                  type="password"
                  autoComplete="off"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                />
              </label>
            )}
            <label>
              {setup
                ? "Ton mot de passe hôte"
                : star
                  ? "Ton mot de passe Marlène"
                  : "Ton mot de passe"}
              <input
                type="password"
                name="password"
                autoComplete={setup ? "new-password" : "current-password"}
                minLength={setup ? 12 : 1}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {setup && (
                <small>12 caractères minimum. Garde-le pour toi.</small>
              )}
            </label>
            {setup && (
              <label>
                Le mot de passe de Marlène
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={starPassword}
                  onChange={(e) => setStarPassword(e.target.value)}
                />
                <small>
                  Différent du tien. À transmettre uniquement à Marlène.
                </small>
              </label>
            )}
            <button
              disabled={c.busy}
              className={`btn ${star ? "lilac" : "primary"} wide`}
            >
              {c.busy
                ? "Un instant…"
                : setup
                  ? "Créer la fête"
                  : star
                    ? "Entrer dans mon royaume"
                    : "Ouvrir les coulisses"}
              <ArrowRight size={18} />
            </button>
          </form>
        )}
        <a
          className="small-text muted"
          href="/"
          style={{ display: "block", marginTop: 22, textAlign: "center" }}
        >
          Retour à la fête
        </a>
      </div>
    </div>
  );
}
