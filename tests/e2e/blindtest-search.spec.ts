// Blind test answered with the song search: one guest picks the right song, one picks
// another, one can't find it and types an alias the host added in the editor. The e2e
// server answers searches from a fixed list (SONG_SEARCH_FIXTURE), never Deezer or iTunes.
import { test, expect } from "@playwright/test";
import {
  api,
  closeAndReveal,
  hostSignIn,
  joinWithSelfie,
  PHONE,
  PHONE_SIZE,
  pickSong,
  projectorState,
  resetParty,
  sendTypedSong,
  signOut,
  songBox,
  state,
  unique,
  upload,
  wav,
} from "./helpers";

test("guests find the blind-test song in a search box and are scored on what they pick", async ({
  browser,
}) => {
  test.setTimeout(5 * 60_000);
  const hostCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const hp = await hostCtx.newPage();
  await hostSignIn(hp);
  const host = hostCtx.request;
  let d = await resetParty(host);
  const original = structuredClone(d.secrets.q6a);
  const ids: string[] = d.questions.map((q: { id: string }) => q.id);
  await api(host, "admin", "reorder", {
    ids: ["q6a", ...ids.filter((x) => x !== "q6a")],
  });
  const clip = await upload(host, "test-tone.wav", "audio/wav", wav());
  await api(host, "admin", "edit", {
    questionId: "q6a",
    patch: {
      media: [clip],
      clipStart: 0,
      clipEnd: 1,
      duration: 600,
      enabled: true,
    },
  });
  const title = d.questions.find((q: { id: string }) => q.id === "q6a").title;

  // The host adjusts the key in the editor: title and artist, plus an extra accepted answer.
  await hp.getByRole("tab", { name: "Les manches" }).click();
  await hp.getByRole("button", { name: `Modifier ${title}` }).click();
  const editor = hp.getByRole("dialog");
  await editor.getByRole("tab", { name: "La bonne réponse" }).click();
  const form = editor.locator(".secret-form");
  await expect(form).toContainText("Noir Désir — Marlène");
  await form.getByRole("button", { name: "Modifier la réponse" }).click();
  await expect(form.getByLabel("Titre de la chanson")).toHaveValue("Marlène");
  await expect(form.getByLabel(/^Artiste/)).toHaveValue("Noir Désir");
  // No multiple-choice options to tick any more.
  await expect(form.getByRole("radio")).toHaveCount(0);
  await form
    .getByLabel(/Autres réponses acceptées/)
    .fill("Noir Désir Marlène\nLa chanson du grand Bertrand");
  await form.getByRole("button", { name: "Enregistrer en privé" }).click();
  await expect(form.getByText("Réponse déjà enregistrée")).toBeVisible();
  await expect(form).toContainText("Noir Désir — Marlène");
  await hp.keyboard.press("Escape");
  d = await state(host);
  expect(d.secrets.q6a).toMatchObject({
    text: "Marlène",
    artist: "Noir Désir",
  });

  const tv = await (
    await browser.newContext({ viewport: { width: 1600, height: 900 } })
  ).newPage();
  await tv.goto("/present");
  const names = [unique("Alice"), unique("Bob"), unique("Chloé")];
  const phones = [];
  for (const name of names) {
    const page = await (await browser.newContext(PHONE_SIZE)).newPage();
    await joinWithSelfie(page, name);
    phones.push(page);
  }
  const [alice, bob, chloe] = phones;

  await api(host, "admin", "open");
  for (const page of phones) await expect(songBox(page)).toBeVisible(PHONE);
  await expect(alice.locator(".answer-option")).toHaveCount(0);
  const open = await projectorState(tv.context().request);
  expect(open.question.options).toEqual([]);
  expect(open.answer).toBeUndefined();
  expect(JSON.stringify(open)).not.toContain("Bertrand");

  // Too short: no search yet.
  await songBox(alice).fill("m");
  await expect(alice.getByText("Tape au moins 2 lettres")).toBeVisible();
  // Suggestions arrive as Alice types; the right one is by Noir Désir, not 17 Hippies.
  await songBox(alice).fill("marlène noir");
  await expect(alice.getByRole("option")).toHaveCount(2, PHONE);
  await songBox(alice).fill("marlène");
  await expect(alice.getByRole("option", { name: /17 Hippies/ })).toBeVisible(
    PHONE,
  );
  await alice
    .getByRole("option")
    .filter({ hasText: "Noir Désir" })
    .filter({ hasText: /^Marlène\s*Noir Désir$/ })
    .click();
  await expect(alice.locator(".song-picked")).toContainText("Noir Désir");
  await alice.getByRole("button", { name: "Valider cette chanson" }).click();
  await expect(
    alice.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible(PHONE);
  await expect(alice.locator(".song-picked.mine")).toContainText("Marlène");
  await expect(tv.getByText(/^1 \/ \d+ participations reçues$/)).toBeVisible(
    PHONE,
  );

  // Bob picks another Noir Désir song.
  await pickSong(bob, "noir desir", /Le vent nous portera/);
  await expect(
    bob.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible(PHONE);

  // Chloé's answer isn't in the catalogue: she sends what she typed, an alias of the key.
  await songBox(chloe).fill("La chanson du grand Bertrand");
  await expect(chloe.getByText("Aucune chanson trouvée.")).toBeVisible(PHONE);
  await sendTypedSong(chloe, "La chanson du grand Bertrand");
  // The last answer closes the round, which the server marks and reveals by itself.

  const live = await closeAndReveal(host);
  expect(live.phase).toBe("reveal");
  const byName = Object.fromEntries(
    live.players.map((p: { id: string; nickname: string }) => [
      p.nickname,
      p.id,
    ]),
  );
  const delta = (name: string) =>
    live.events.find((e: { playerId: string }) => e.playerId === byName[name])
      ?.delta;
  expect(names.map(delta)).toEqual([1, -1, 1]);

  // Reveal on the phones and the TV: the right song and what everyone answered.
  for (const page of [...phones, tv])
    await expect(page.locator(".reveal-answer").first()).toContainText(
      "Noir Désir — Marlène",
      PHONE,
    );
  await expect(alice.locator(".round-result strong")).toHaveText(
    "+1 point",
    PHONE,
  );
  await expect(bob.locator(".round-result strong")).toHaveText(
    "-1 point",
    PHONE,
  );
  await expect(chloe.locator(".round-result strong")).toHaveText(
    "+1 point",
    PHONE,
  );
  const picks = tv.locator(".song-picks li");
  await expect(picks).toHaveCount(3, PHONE);
  await expect(picks.filter({ hasText: names[0] })).toHaveClass(/right/);
  await expect(picks.filter({ hasText: names[0] })).toContainText(
    "Noir Désir — Marlène",
  );
  await expect(picks.filter({ hasText: names[1] })).toHaveClass(/wrong/);
  await expect(picks.filter({ hasText: names[1] })).toContainText(
    "Le vent nous portera",
  );
  await expect(picks.filter({ hasText: names[2] })).toContainText(
    "La chanson du grand Bertrand",
  );
  await expect(bob.locator(".song-picks li.me")).toContainText(names[1]);

  // Leave the stored key as the other specs expect it, and sign the guests out.
  await api(host, "admin", "next");
  await api(host, "admin", "private", { questionId: "q6a", ...original });
  for (const page of phones) await signOut(page);
});
