"use client";
import { useState } from "react";
import { ArrowRight, Crown, Users } from "lucide-react";
import type { PartyClient } from "./use-party";
import { PinPad } from "./pin-pad";
export function AuthScreen({
  c,
  star = false,
}: {
  c: PartyClient;
  star?: boolean;
}) {
  const [nickname, setNickname] = useState(""),
    [password, setPassword] = useState(""),
    [pin, setPin] = useState("");
  return (
    <div className="auth-card">
      <div className="panel">
        <span className={`pill ${star ? "lilac" : "butter"}`}>
          {star ? <Crown size={15} /> : <Users size={15} />}{" "}
          {star ? "ESPACE MARLÈNE" : "CÔTÉ COULISSES"}
        </span>
        <h1>{star ? "La reine est arrivée." : "À toi de mener la danse."}</h1>
        <p>
          {star
            ? "Ton royaume t’attend. Entre ton code à 6 chiffres pour retrouver ton espace privé."
            : "Entre ton nom et le mot de passe de l’administration pour ouvrir les coulisses."}
        </p>
        {star ? (
          <PinPad
            value={pin}
            onChange={setPin}
            busy={c.busy}
            label="Ton code VIP"
            submitLabel="Entrer dans mon royaume"
            onSubmit={() => {
              void c.command("join", { pin }).then((ok) => {
                if (!ok) setPin("");
              });
            }}
          />
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await c.command("join", {
                nickname,
                password,
              });
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
            <label>
              Mot de passe administrateur
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={c.busy} className="btn primary wide">
              {c.busy ? "Un instant…" : "Ouvrir les coulisses"}
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
