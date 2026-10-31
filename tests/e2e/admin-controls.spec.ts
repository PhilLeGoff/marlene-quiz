// The host's backstage beyond running rounds: a protected sign-in, the running order,
// score adjustments, stopping the quiz early and starting a new party.
import { test, expect } from "@playwright/test";
import {
  hostSignIn,
  joinWithSelfie,
  PHONE,
  PHONE_SIZE,
  resetParty,
  signOut,
  state,
  unique,
} from "./helpers";

test("host sign-in, running order, score adjustment, early stop and a new party", async ({
  browser,
}) => {
  const hostCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const hp = await hostCtx.newPage();
  // A wrong password keeps the backstage shut.
  await hp.goto("/admin");
  await hp.getByLabel("Ton petit nom").fill(unique("Intrus"));
  await hp.getByLabel("Mot de passe administrateur").fill("pas-le-bon");
  await hp.getByRole("button", { name: "Ouvrir les coulisses" }).click();
  await expect(hp.getByRole("alert")).toContainText(
    "Mot de passe administrateur incorrect.",
  );
  await expect(hp.getByRole("tab", { name: "La régie" })).toHaveCount(0);
  await hostSignIn(hp);
  const host = hostCtx.request;
  await resetParty(host);

  const name = unique("Joséphine");
  const phoneCtx = await browser.newContext(PHONE_SIZE);
  const phone = await phoneCtx.newPage();
  await joinWithSelfie(phone, name);
  const tv = await (await browser.newContext()).newPage();
  await tv.goto("/present");
  await expect(hp.locator(".player-bubble", { hasText: name })).toBeVisible(
    PHONE,
  );
  const guests = (await state(host)).players.length;
  await expect(
    hp.locator(".stat", { hasText: "Invités dans la place" }).locator("b"),
  ).toHaveText(String(guests));

  // Running order: moving the first round down swaps it with the second.
  await hp.getByRole("tab", { name: "Les manches" }).click();
  const cards = hp.locator(".question-card h3");
  const [first, second] = [
    (await cards.nth(0).textContent())!.replace(/^1\. /, ""),
    (await cards.nth(1).textContent())!.replace(/^2\. /, ""),
  ];
  await hp
    .getByRole("button", { name: "Descendre la manche 1", exact: true })
    .click();
  await expect(cards.nth(0)).toHaveText(`1. ${second}`);
  await expect(cards.nth(1)).toHaveText(`2. ${first}`);
  await hp
    .getByRole("button", { name: "Monter la manche 2", exact: true })
    .click();
  await expect(cards.nth(0)).toHaveText(`1. ${first}`);
  await expect(
    hp.locator(".question-card", { hasText: "Body count ?" }),
  ).toContainText("Désactivée");

  // A point of justice: the guest's phone and the points book both show it.
  await hp.getByRole("tab", { name: "Les invités" }).click();
  await hp.getByLabel("L’invité").selectOption({ label: name });
  await hp.getByLabel("Points à ajouter ou retirer").fill("3");
  await hp.getByLabel("Le motif").fill("Plus beau déguisement");
  await hp.getByRole("button", { name: "Appliquer l’ajustement" }).click();
  await expect(
    hp.locator(".submission-row", { hasText: "Plus beau déguisement" }),
  ).toContainText(`${name} · +3`);
  await expect(phone.locator(".pill.butter")).toHaveText("3 points", PHONE);

  // Open the first round, then stop the quiz: the ranking shows, no answer does.
  await hp.getByRole("tab", { name: "La régie" }).click();
  await hp.getByRole("button", { name: "Lancer la fête" }).click();
  await expect(phone.getByRole("heading", { name: first })).toBeVisible(PHONE);
  await expect(tv.getByRole("heading", { name: first })).toBeVisible(PHONE);
  await hp.getByRole("button", { name: "Arrêter le quiz" }).click();
  await hp.getByRole("button", { name: "Oui, arrêter le quiz" }).click();
  for (const page of [phone, tv, hp]) {
    await expect(
      page.getByRole("heading", { name: "Marlène, on t’aime !" }),
    ).toBeVisible(PHONE);
    await expect(page.locator(".reveal-answer")).toHaveCount(0);
  }
  await expect(phone.locator(".leaderboard-row.me")).toContainText("3");
  const stopped = await (
    await phoneCtx.request.get("/api/game?as=guest")
  ).json();
  expect(stopped.phase).toBe("finished");
  expect(stopped.answer).toBeUndefined();
  await expect(hp.getByRole("button", { name: "Arrêter le quiz" })).toHaveCount(
    0,
  );

  // A new party from the settings: back to the lobby, and the guest has to join again.
  await hp.getByRole("tab", { name: "Réglages" }).click();
  await hp.getByRole("button", { name: "Nouvelle partie" }).click();
  await hp.getByRole("button", { name: "Oui, recommencer" }).click();
  await expect(hp.getByText("Tout le monde a son verre ?")).toBeVisible();
  await expect(phone.getByLabel("Ton petit nom")).toBeVisible(PHONE);
  await expect(tv.getByText("Scanne, entre ton nom")).toBeVisible(PHONE);
  await expect(hp.locator(".player-bubble", { hasText: name })).toHaveCount(
    0,
    PHONE,
  );
  // Joining again starts from zero.
  await joinWithSelfie(phone, name);
  await expect(phone.locator(".pill.butter")).toHaveText("0 points");
  await signOut(phone);
  await signOut(hp);
  await expect(hp.getByLabel("Mot de passe administrateur")).toBeVisible();
  await Promise.all([hostCtx.close(), phoneCtx.close(), tv.context().close()]);
});
