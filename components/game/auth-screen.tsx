"use client";
import { useState } from "react";
import { ArrowRight, Crown, Users } from "lucide-react";
import type { PartyClient } from "./use-party";
export function AuthScreen({
  c,
  star = false,
}: {
  c: PartyClient;
  star?: boolean;
}) {
  const [nickname, setNickname] = useState("");
  return (
    <div className="auth-card">
      <div className="panel">
        <span className={`pill ${star ? "lilac" : "butter"}`}>
          {star ? <Crown size={15} /> : <Users size={15} />}{" "}
          {star ? "ESPACE MARLÈNE" : "CÔTÉ COULISSES"}
        </span>
        <h1>{star ? "La reine est arrivée." : "À toi de mener la danse."}</h1>
        <p>
          Entre ton nom et rejoins la fête. Si ce nom est déjà pris, choisis-en
          un autre.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await c.command("join", { nickname });
          }}
        >
          <label>
            Ton petit nom
            <input
              name="nickname"
              autoComplete="nickname"
              required
              minLength={1}
              maxLength={24}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <button
            disabled={c.busy}
            className={`btn ${star ? "lilac" : "primary"} wide`}
          >
            {c.busy
              ? "Un instant…"
              : star
                ? "Entrer dans mon royaume"
                : "Ouvrir les coulisses"}
            <ArrowRight size={18} />
          </button>
        </form>
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
