// Marlène's VIP identity, shared by the server and the browser (no server-only imports here).
export const MARLENE_NAME = "Marlène";
// Default VIP code for new parties; the host can change it in the admin settings.
export const MARLENE_PIN = "123456";
// Length of every game code: Marlène's VIP code and any "Code mystère" round.
export const PIN_LENGTH = 6;
export const isPin = (value: unknown): value is string =>
  typeof value === "string" && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(value);
// Compares names regardless of Unicode form, accents, casing and spacing.
export function nicknameKey(value: string) {
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}
const marleneKey = nicknameKey(MARLENE_NAME).replace(/[^\p{L}]/gu, "");
// True for any way of typing her name: "Marlène", "marlene", " MARLÈNE ", "Marlène !"…
// Only letters count, so spaces, punctuation, digits, emoji or invisible characters
// around or inside the name can't be used to pass as her.
export function isMarleneName(value: string) {
  return nicknameKey(value).replace(/[^\p{L}]/gu, "") === marleneKey;
}
