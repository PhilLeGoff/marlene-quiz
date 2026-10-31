import { expect, test } from "@playwright/test";
import {
  PHONE,
  PHONE_SIZE,
  api,
  hostSignIn,
  joinWithSelfie,
  resetParty,
  signOutApi,
  state,
  unique,
} from "./helpers";

test("a new game signs every guest out and deletes their selfies; the host stays", async ({
  browser,
}) => {
  const hostCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const hp = await hostCtx.newPage();
  await hostSignIn(hp);
  const host = hostCtx.request;
  await resetParty(host);

  const names = [unique("Gaston"), unique("Odette")];
  const phones = [];
  for (const name of names) {
    const phone = await (await browser.newContext(PHONE_SIZE)).newPage();
    await joinWithSelfie(phone, name);
    phones.push(phone);
  }
  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto("/present");

  const players: { nickname: string; photo?: string }[] = (await state(host))
    .players;
  const selfies = players
    .filter((p) => names.includes(p.nickname))
    .map((p) => p.photo!);
  expect(selfies).toHaveLength(2);
  for (const id of selfies) {
    expect(id).toBeTruthy();
    // The stored file (the host may read any media) and the selfie as guests see it.
    expect((await host.get(`/api/media?id=${id}`)).status()).toBe(200);
    expect((await host.get(`/api/avatar?id=${id}`)).status()).toBe(200);
  }

  // The game ends: the podium, with everyone's score, stays until a new game.
  await api(host, "admin", "finish");
  for (const page of [...phones, tv])
    await expect(page.getByText("Marlène, on t’aime !")).toBeVisible(PHONE);
  await hp.getByRole("tab", { name: "Les invités" }).click();
  for (const name of names)
    await expect(hp.getByText(name).first()).toBeVisible();

  await hp.getByRole("button", { name: "Recommencer" }).click();
  await hp.getByRole("button", { name: "Oui, recommencer" }).click();

  // The host is still on the admin page, with nobody left.
  await expect(
    hp.getByRole("group", { name: "Commandes de la partie" }),
  ).toBeVisible();
  const after = await state(host);
  expect(after.role).toBe("admin");
  expect(after.phase).toBe("lobby");
  expect(after.players).toHaveLength(0);
  await hp.getByRole("tab", { name: "Les invités" }).click();
  for (const name of names) await expect(hp.getByText(name)).toHaveCount(0);

  // Guests land back on the join screen; the TV shows the join QR again.
  for (const phone of phones) {
    await expect(phone).toHaveURL(/\/$/, PHONE);
    await expect(phone.getByLabel("Ton petit nom")).toBeVisible();
  }
  await expect(tv.locator(".tv-join-qr")).toBeVisible(PHONE);
  for (const name of names) await expect(tv.getByText(name)).toHaveCount(0);

  // The selfies are gone, from the game and from storage.
  for (const id of selfies) {
    expect((await host.get(`/api/avatar?id=${id}`)).status()).toBe(404);
    expect((await host.get(`/api/media?id=${id}`)).status()).toBe(404);
  }

  // Joining again starts from scratch: a new selfie is needed.
  const phone = phones[0];
  await phone.getByLabel("Ton petit nom").fill(names[0]);
  await phone.getByRole("button", { name: /Rejoindre la fête/ }).click();
  await expect(phone).toHaveURL(/\/play$/);
  await expect(phone.locator('input[type="file"]')).toBeAttached(PHONE);
  await signOutApi(phone.request);
});
