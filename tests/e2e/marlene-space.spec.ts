// Marlène's VIP space on her phone: the PIN pad, her private answers, playing a round like
// the guests, and the VIP code the host can change.
import { test, expect } from "@playwright/test";
import {
  api,
  hostSignIn,
  joinWithSelfie,
  MARLENE_PIN,
  marleneSignIn,
  PHONE,
  PHONE_SIZE,
  projectorState,
  resetParty,
  signOut,
  state,
  typePin,
  unique,
} from "./helpers";

test("Marlène signs in with her PIN, keeps her answers private, and plays a round like the guests", async ({
  browser,
}) => {
  const hostCtx = await browser.newContext();
  const hp = await hostCtx.newPage();
  await hostSignIn(hp);
  const host = hostCtx.request;
  await resetParty(host);

  const starCtx = await browser.newContext(PHONE_SIZE);
  const mp = await starCtx.newPage();
  // A wrong code keeps her on the pad, with nothing of her space shown.
  await mp.goto("/marlene");
  await expect(mp.getByLabel("Ton petit nom")).toHaveCount(0);
  // Same length as her code, every digit different.
  const shifted = (by: number) =>
    MARLENE_PIN.replace(/\d/g, (x) => String((Number(x) + by) % 10));
  const wrong = shifted(5);
  await typePin(mp, wrong, "Entrer dans mon royaume");
  await expect(mp.getByRole("alert")).toContainText("Code PIN incorrect");
  await expect(mp.getByText("Tes petits secrets")).toHaveCount(0);
  expect((await state(starCtx.request, "marlene")).role).toBeNull();
  await marleneSignIn(mp);
  await expect(
    mp.getByRole("heading", { name: "Tes petits secrets" }),
  ).toBeVisible();
  // She plays, so she is listed with the players; her code never reaches a browser.
  const mine = await state(starCtx.request, "marlene");
  expect(mine.role).toBe("marlene");
  expect(mine.players.map((p: { id: string }) => p.id)).toContain(
    mine.playerId,
  );
  expect(JSON.stringify(mine)).not.toContain(`"${MARLENE_PIN}"`);
  // She can't run the game: that stays with the host.
  await api(starCtx.request, "marlene", "open", {}, 403);

  const guestCtx = await browser.newContext(PHONE_SIZE);
  const phone = await guestCtx.newPage();
  await joinWithSelfie(phone, unique("Curieuse"));

  // Her answer to the screen-time question, typed in her space, stays out of sight.
  const secret = 317;
  await mp.getByLabel("Choisir une manche").selectOption("q9");
  const form = mp.locator(".secret-form");
  const edit = form.getByRole("button", { name: "Modifier la réponse" });
  if (await edit.isVisible()) await edit.click();
  await form.getByLabel(/La bonne valeur/).fill(String(secret));
  await form.getByRole("button", { name: "Enregistrer en privé" }).click();
  await expect(form.getByText("Réponse déjà enregistrée")).toBeVisible();
  await expect(form).toContainText(`${secret} minutes / jour`);
  // Reloading her phone keeps her signed in and the answer saved.
  await mp.reload();
  await expect(
    mp.getByRole("heading", { name: "Ce soir, c’est toi la reine." }),
  ).toBeVisible();
  await mp.getByLabel("Choisir une manche").selectOption("q9");
  await expect(form).toContainText(`${secret} minutes / jour`);
  expect((await state(host)).secrets.q9.number).toBe(secret);
  for (const view of [
    await state(guestCtx.request, "guest"),
    await projectorState(guestCtx.request),
  ]) {
    expect(view.secrets).toBeUndefined();
    // As a JSON number: random IDs (player, room) may contain the digits.
    expect(JSON.stringify(view)).not.toMatch(
      new RegExp(`[:,\\[]${secret}[,}\\]]`),
    );
  }

  // No consent panel: the host simply turns the body count on, or skips it.
  await expect(mp.getByText(/consentement|J’accepte/)).toHaveCount(0);
  await expect(mp.getByRole("button", { name: /Cacher/ })).toHaveCount(0);

  // A normal round: she answers from her screen and the round waits for her too.
  await api(host, "admin", "edit", {
    questionId: "q4",
    patch: { enabled: true, duration: 600 },
  });
  const ids: string[] = (await state(host)).questions.map(
    (q: { id: string }) => q.id,
  );
  await api(host, "admin", "reorder", {
    ids: ["q4", ...ids.filter((x) => x !== "q4")],
  });
  await api(host, "admin", "open");
  await expect(mp.locator(".secrets-panel")).not.toHaveAttribute("open", {
    timeout: 30_000,
  });
  const horse = mp.locator(".answer-option", { hasText: "Son cheval" });
  await horse.click(PHONE);
  await mp.getByRole("button", { name: /Valider mon choix/ }).click();
  await expect(
    mp.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible();
  expect((await state(host)).phase).toBe("question_open");
  await phone.locator(".answer-option", { hasText: "Son chat" }).click(PHONE);
  await phone.getByRole("button", { name: /Valider mon choix/ }).click();
  // The guest's answer was the last one: the round reveals itself and scores her.
  await expect(mp.locator(".round-result strong")).toHaveText(
    "+1 point",
    PHONE,
  );
  await expect(mp.locator(".page-title .pill")).toHaveText("1 points");
  await api(host, "admin", "leaderboard");
  await expect(mp.locator(".leaderboard-row.me")).toContainText(
    "Marlène · toi",
    PHONE,
  );
  await expect(phone.locator(".leaderboard-row").first()).toContainText(
    "Marlène",
    PHONE,
  );

  // The host changes her VIP code: her phone is signed out, the old code stops working.
  const replacement = shifted(3);
  await hp.getByRole("tab", { name: "Réglages" }).click();
  await hp.getByLabel(/Nouveau code à \d chiffres/).fill(replacement);
  await hp.getByRole("button", { name: "Changer le code VIP" }).click();
  await expect(hp.getByText("Nouveau code enregistré.")).toBeVisible();
  await expect(
    mp.getByRole("button", { name: "Entrer dans mon royaume" }),
  ).toBeVisible(PHONE);
  await typePin(mp, MARLENE_PIN, "Entrer dans mon royaume");
  await expect(mp.getByRole("alert")).toContainText("Code PIN incorrect");
  await typePin(mp, replacement, "Entrer dans mon royaume");
  await expect(
    mp.getByRole("heading", { name: "Ce soir, c’est toi la reine." }),
  ).toBeVisible();
  // Put the default back for the specs that follow, then sign her out.
  await api(host, "admin", "vipPin", { pin: MARLENE_PIN });
  await expect(
    mp.getByRole("button", { name: "Entrer dans mon royaume" }),
  ).toBeVisible(PHONE);
  await marleneSignIn(mp);
  await signOut(mp);
  await expect(mp).toHaveURL(/\/marlene$/);

  await signOut(phone);
  for (const ctx of [hostCtx, starCtx, guestCtx]) await ctx.close();
});
