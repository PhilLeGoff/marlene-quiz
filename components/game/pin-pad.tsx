"use client";
import { useId } from "react";
import { ArrowRight, Delete } from "lucide-react";
import { PIN_LENGTH } from "@/lib/game/vip";

export function PinPad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  busy = false,
  label = `Code PIN à ${PIN_LENGTH} chiffres`,
  submitLabel = "Valider le code",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  submitLabel?: string;
}) {
  const id = useId();
  const locked = disabled || busy;
  return (
    <div className="phone-pin" aria-busy={busy}>
      <label className="phone-pin-label" htmlFor={id}>
        {label}
      </label>
      <div className="phone-pin-entry">
        <input
          id={id}
          type="password"
          inputMode="numeric"
          pattern={`[0-9]{${PIN_LENGTH}}`}
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={value}
          disabled={locked}
          onChange={(event) =>
            onChange(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!locked && value.length === PIN_LENGTH) onSubmit();
            }
          }}
        />
        <div className="phone-pin-boxes" aria-hidden="true">
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <span key={index} className={value.length > index ? "filled" : ""}>
              {value[index] ? "●" : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="phone-keypad" role="group" aria-label="Clavier numérique">
        {[
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "delete",
          "0",
          "enter",
        ].map((key) => (
          <button
            key={key}
            type="button"
            className={key === "enter" ? "pin-confirm" : ""}
            disabled={
              locked ||
              (key === "enter"
                ? value.length !== PIN_LENGTH
                : key === "delete"
                  ? !value.length
                  : value.length === PIN_LENGTH)
            }
            aria-label={
              key === "delete"
                ? "Effacer le dernier chiffre"
                : key === "enter"
                  ? submitLabel
                  : key
            }
            onClick={() => {
              if (key === "enter") onSubmit();
              else {
                onChange(
                  key === "delete"
                    ? value.slice(0, -1)
                    : (value + key).slice(0, PIN_LENGTH),
                );
              }
            }}
          >
            {key === "delete" ? (
              <Delete size={23} />
            ) : key === "enter" ? (
              <ArrowRight size={24} />
            ) : (
              key
            )}
          </button>
        ))}
      </div>
      <p className="phone-pin-help" role="status">
        {busy
          ? "Vérification du code…"
          : `${value.length} chiffre${value.length > 1 ? "s" : ""} sur ${PIN_LENGTH} · Valide avec la flèche`}
      </p>
    </div>
  );
}
