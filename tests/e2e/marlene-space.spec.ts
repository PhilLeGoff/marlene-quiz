// Marlène's VIP space on her phone: the PIN pad, her private answers, consent for the
// intimate round, and the VIP code the host can change.
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

test("Marlène signs in with her PIN, keeps her answers private, and controls her consent", async ({
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
  // She is never listed as a player and her code never reaches a browser.
  const mine = await state(starCtx.request, "marlene");
  expect(mine.role).toBe("marlene");
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
    expect(JSON.stringify(view)).not.toContain(String(secret));
  }

  // The intimate round: off until she agrees, and her answer goes when she withdraws.
  const intimate = (await state(host)).questions.find(
    (q: { sensitive: boolean }) => q.sensitive,
  );
  expect(intimate.enabled).toBe(false);
  await api(
    host,
    "admin",
    "edit",
    { questionId: intimate.id, patch: { enabled: true } },
    400,
  );
  await expect(mp.locator("option", { hasText: intimate.title })).toHaveCount(
    0,
  );
  const agree = mp.getByRole("button", { name: "Autoriser cette manche" });
  await expect(agree).toBeDisabled();
  await mp.getByLabel(/J’accepte explicitement/).check();
  await agree.click();
  await expect(
    mp.getByText("Tu as autorisé cette manche facultative."),
  ).toBeVisible();
  await api(host, "admin", "edit", {
    questionId: intimate.id,
    patch: { enabled: true },
  });
  await mp.getByLabel("Choisir une manche").selectOption(intimate.id);
  await form.getByLabel(/La bonne valeur/).fill("7");
  await form.getByRole("button", { name: "Enregistrer en privé" }).click();
  await expect(form.getByText("Réponse déjà enregistrée")).toBeVisible();
  // The host can't type it for her.
  await api(
    host,
    "admin",
    "private",
    { questionId: intimate.id, number: 8 },
    403,
  );
  expect((await state(host)).secrets[intimate.id].number).toBe(7);
  await mp
    .getByRole("button", { name: "Retirer mon accord et effacer ma réponse" })
    .click();
  await expect(agree).toBeVisible();
  const after = await state(host);
  expect(after.consent).toBe(false);
  expect(after.secrets[intimate.id]).toBeUndefined();
  expect(
    after.questions.find((q: { id: string }) => q.id === intimate.id).enabled,
  ).toBe(false);

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
