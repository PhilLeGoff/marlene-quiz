// Marlène's VIP space on her phone: the PIN pad, her selfie, no answer keys, playing a round
// like the guests, and the VIP code the host can change.
import { test, expect } from "@playwright/test";
import {
  api,
  hostSignIn,
  joinWithSelfie,
  MARLENE_PIN,
  marleneSignIn,
  PHONE,
  PHONE_SIZE,
  origin,
  resetParty,
  signOut,
  state,
  takeSelfie,
  typePin,
  unique,
} from "./helpers";

test("Marlène signs in with her PIN, never sees the answer keys, and plays a round like the guests", async ({
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
  expect((await state(starCtx.request, "marlene")).role).toBeNull();
  await marleneSignIn(mp, undefined, { selfie: false });
  // Like every guest, she needs a selfie before anything else: the reset above wiped any
  // earlier one.
  const herId = (await state(starCtx.request, "marlene")).playerId as string;
  const step = mp.getByRole("heading", { name: "Un selfie, et tu entres !" });
  await expect(step).toBeVisible(PHONE);
  await expect(mp.locator(".star-current")).toHaveCount(0);
  await expect(
    mp.getByRole("button", { name: /Plus tard|Retour à la fête/ }),
  ).toHaveCount(0);
  await mp.screenshot({
    path: "outputs/marlene-space/marlene-selfie-step.png",
  });
  // A reload doesn't get her past it.
  await mp.reload();
  await expect(step).toBeVisible(PHONE);
  await takeSelfie(mp);
  await expect(mp.getByText("Bienvenue dans ton royaume.")).toBeVisible();
  // The host removing it sends her back to the step, as it would a guest.
  const removed = await host.delete(
    `/api/avatar?as=admin&playerId=${encodeURIComponent(herId)}`,
    { headers: { Origin: origin } },
  );
  expect(removed.ok(), await removed.text()).toBe(true);
  await expect(step).toBeVisible(PHONE);
  await takeSelfie(mp);
  await expect(mp.getByText("Bienvenue dans ton royaume.")).toBeVisible();
  await expect(
    mp
      .locator(".player-bubble", { hasText: "Marlène" })
      .locator("img.avatar-photo"),
  ).toBeVisible(PHONE);
  // No secrets form: she neither sees nor sets the answer keys.
  await expect(mp.getByText("Tes petits secrets")).toHaveCount(0);
  await expect(mp.locator(".secret-form")).toHaveCount(0);
  // She plays, so she is listed with the players; her code never reaches a browser.
  const mine = await state(starCtx.request, "marlene");
  expect(mine.role).toBe("marlene");
  expect(mine.players.map((p: { id: string }) => p.id)).toContain(
    mine.playerId,
  );
  expect(JSON.stringify(mine)).not.toContain(`"${MARLENE_PIN}"`);
  expect(mine.secrets).toBeUndefined();
  expect(mine.questions).toBeUndefined();
  // She can't run the game nor set a key: that stays with the host.
  await api(starCtx.request, "marlene", "open", {}, 403);
  await api(
    starCtx.request,
    "marlene",
    "private",
    { questionId: "run5k", number: 1877 },
    403,
  );

  const guestCtx = await browser.newContext(PHONE_SIZE);
  const phone = await guestCtx.newPage();
  await joinWithSelfie(phone, unique("Curieuse"));
  // Her selfie shows next to her name on the guests' phones and on the TV.
  const tv = await (await browser.newContext()).newPage();
  await tv.goto("/present");
  for (const page of [phone, tv]) {
    const hers = page
      .locator(".player-bubble", { hasText: "Marlène" })
      .locator("img.avatar-photo");
    await expect(hers).toBeVisible(PHONE);
    await expect
      .poll(() => hers.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
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
  // The round's key never reaches her phone while it's open.
  const during = await state(starCtx.request, "marlene");
  expect(during.phase).toBe("question_open");
  expect(during.secrets).toBeUndefined();
  expect(during.answer).toBeUndefined();
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
  // With her selfie on the leaderboard, on the phones and the TV.
  for (const page of [phone, tv])
    await expect(
      page
        .locator(".leaderboard-row", { hasText: "Marlène" })
        .locator("img.avatar-photo"),
    ).toBeVisible(PHONE);

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
  for (const ctx of [hostCtx, starCtx, guestCtx, tv.context()])
    await ctx.close();
});
