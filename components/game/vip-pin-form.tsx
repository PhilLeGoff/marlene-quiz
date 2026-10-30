"use client";
import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import type { PartyClient } from "./use-party";
import { PIN_LENGTH } from "@/lib/game/vip";
// The host can replace Marlène's VIP code. The current code is never sent to the browser.
export function VipPinForm({ c }: { c: PartyClient }) {
  const [pin, setPin] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await c.command("vipPin", { pin })) {
          setPin("");
          setSaved(true);
        }
      }}
    >
      <label>
        Nouveau code à {PIN_LENGTH} chiffres
        <input
          type="password"
          name="vip-pin"
          inputMode="numeric"
          pattern={`[0-9]{${PIN_LENGTH}}`}
          minLength={PIN_LENGTH}
          maxLength={PIN_LENGTH}
          required
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setSaved(false);
            setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH));
          }}
        />
      </label>
      {saved && (
        <p className="saved" role="status">
          <Check size={16} /> Nouveau code enregistré. Marlène devra le saisir
          sur ses appareils.
        </p>
      )}
      <button className="btn lilac" disabled={c.busy}>
        <KeyRound size={16} /> Changer le code VIP
      </button>
    </form>
  );
}
