import { test, expect } from "@playwright/test";
import {
  api,
  closeAndReveal,
  hostContext,
  joinWithSelfie,
  PHONE,
  PHONE_SIZE,
  resetParty,
  signOutApi,
  state,
  unique,
} from "./helpers";
// Marlène's best 5 km: guests pick mm:ss on a slider (15 s steps), the server keeps seconds,
// and every minute off costs a point.
test("guests answer Marlène’s best 5 km time with a mm:ss slider", async ({
  browser,
}) => {
  const host = (await hostContext(browser)).request;
  const d = await resetParty(host);
  const ids = d.questions.map((q: { id: string }) => q.id);
  expect(ids).not.toContain("q9");
  await api(host, "admin", "reorder", {
    ids: ["run5k", ...ids.filter((x: string) => x !== "run5k")],
  });
  await api(host, "admin", "edit", {
    questionId: "run5k",
    patch: { enabled: true, duration: 600 },
  });
  // Marlène's time, 27:45, as her form stores it.
  await api(host, "admin", "private", { questionId: "run5k", number: 1665 });

  const phoneCtx = await browser.newContext(PHONE_SIZE);
  const phone = await phoneCtx.newPage();
  await joinWithSelfie(phone, unique("Coureuse"));
  await api(host, "admin", "open");
  await expect(
    phone.getByRole("heading", {
      name: "Quel est le meilleur temps de Marlène sur 5 km ?",
    }),
  ).toBeVisible(PHONE);
  const slider = phone.getByRole("slider", { name: /Ton estimation/ });
  await expect(slider).toBeVisible(PHONE);
  // Starts mid-range at 37:30, bounded by 15:00 and 60:00.
  await expect(slider).toHaveValue("2250");
  await expect(phone.locator(".slider-answer output")).toHaveText("37:30");
  await expect(phone.locator(".slider-bounds")).toHaveText(/15:00\s*60:00/);
  await expect(phone.getByText("Chaque minute d’écart")).toBeVisible();
  await slider.focus();
  for (let i = 0; i < 35; i++) await phone.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue(String(2250 - 35 * 15));
  await expect(phone.locator(".slider-answer output")).toHaveText("28:45");
  await expect(slider).toHaveAttribute("aria-valuetext", "28 min 45 s");
  await phone.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  // Stored in seconds. With the key known and the only guest done, the round may
  // already have closed and revealed itself.
  await expect
    .poll(async () => (await state(host)).submissions?.[0]?.value, PHONE)
    .toBe(1725);

  await closeAndReveal(host);
  await expect(phone.locator(".reveal-answer")).toContainText("27:45", PHONE);
  const result = phone.locator(".round-result");
  await expect(result.locator("strong")).toHaveText("+4 points", PHONE);
  await expect(result).toContainText("1 min d’écart");
  // A guest left signed in would keep later specs' rounds from closing by themselves.
  await signOutApi(phoneCtx.request);
});
