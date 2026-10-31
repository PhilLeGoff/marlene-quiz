// The exes round: guests name each dog-merged photo of Marlène's exes on their phone,
// the TV shows the photos without names, and the reveal gives each photo its name and
// how many guests found it.
import { test, expect, type Page } from "@playwright/test";
import {
  api,
  hostSignIn,
  joinWithSelfie,
  PHONE,
  PHONE_SIZE,
  projectorState,
  resetParty,
  signOut,
  state,
  unique,
} from "./helpers";

const ID = "q18";
const NAMES = ["Aloïs", "Guillaume", "Renaud", "Valentin"];
const KEY = ["Guillaume", "Aloïs", "Valentin", "Renaud"]; // photo 1 → 4
const shots = (name: string) => `outputs/exes-match/${name}.png`;
const photo = (page: Page, n: number) =>
  page.getByRole("group", { name: `Photo ${n}`, exact: true });
const chip = (page: Page, n: number, name: string) =>
  photo(page, n).getByRole("button", { name: new RegExp(`^${name}`) });

test("guests match the exes to their dog photos, then the reveal names them", async ({
  browser,
}) => {
  test.setTimeout(5 * 60_000);
  const hostCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const hp = await hostCtx.newPage();
  await hostSignIn(hp);
  const host = hostCtx.request;
  let d = await resetParty(host);
  const order: string[] = d.questions.map((q: { id: string }) => q.id);
  expect(order.indexOf(ID)).toBe(order.indexOf("q6c") + 1);
  // Start with the exes round, with the seeded names and pairs.
  await api(host, "admin", "reorder", {
    ids: [ID, ...order.filter((id) => id !== ID)],
  });
  await api(host, "admin", "edit", {
    questionId: ID,
    patch: { enabled: true, duration: 600, options: NAMES },
  });
  await api(host, "admin", "private", { questionId: ID, answers: KEY });
  d = await state(host);
  const title = d.questions.find((q: { id: string }) => q.id === ID).title;
  expect(title).toBe("Associe chaque ex de Marlène à son double canin");

  const tvCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const tv = await tvCtx.newPage();
  await tv.goto("/present");
  const aliceCtx = await browser.newContext(PHONE_SIZE),
    bobCtx = await browser.newContext(PHONE_SIZE);
  const alice = await aliceCtx.newPage(),
    bob = await bobCtx.newPage();
  await joinWithSelfie(alice, unique("Alice"));
  await joinWithSelfie(bob, unique("Bob"));

  await api(host, "admin", "open");
  for (const page of [alice, bob, tv]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible(PHONE);
    await expect(page.locator(".question-hint")).toHaveText(
      "+1 par bonne association, 0 si c’est faux ou vide",
    );
  }
  // The TV shows the four photos, loaded, and the names apart, but no pairs.
  const tiles = tv.locator(".match-board .match-tile img");
  await expect(tiles).toHaveCount(4);
  for (const img of await tiles.all())
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  await expect(tv.locator(".match-names li")).toHaveText(NAMES);
  await expect(tv.locator(".match-key")).toHaveCount(0);
  // Photo URLs are hashed files with neutral names.
  for (const src of await tiles.evaluateAll((els) =>
    els.map((el) => (el as HTMLImageElement).getAttribute("src") ?? ""),
  )) {
    expect(src).toMatch(/ex-\d/);
    for (const name of NAMES) expect(src).not.toContain(name);
  }
  await tv.screenshot({ path: shots("tv-open") });
  // No pairs reach a guest or the TV before the reveal.
  for (const view of [
    await state(aliceCtx.request, "guest"),
    await projectorState(tvCtx.request),
  ]) {
    expect(view.answer).toBeUndefined();
    expect(view.secrets).toBeUndefined();
    expect(view.matchRight).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(KEY.join('","'));
  }

  // Alice: a name picked for a second photo moves there; she ends with all four right.
  const submit = (page: Page) =>
    page.getByRole("button", { name: "Valider mes associations" });
  await expect(submit(alice)).toBeDisabled();
  await chip(alice, 1, "Aloïs").click();
  await expect(chip(alice, 1, "Aloïs")).toHaveAttribute("aria-pressed", "true");
  await chip(alice, 2, "Aloïs").click();
  await expect(chip(alice, 2, "Aloïs")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(alice, 1, "Aloïs")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(chip(alice, 1, "Aloïs")).toContainText("photo 2");
  await chip(alice, 1, "Guillaume").click();
  await alice.screenshot({ path: shots("phone-answering") });
  await chip(alice, 3, "Valentin").click();
  await chip(alice, 4, "Renaud").click();
  await submit(alice).click();
  await expect(
    alice.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible(PHONE);

  // Bob: one right, one wrong, two left empty. The round then closes by itself.
  await chip(bob, 1, "Guillaume").click();
  await chip(bob, 2, "Renaud").click();
  await submit(bob).click();
  await expect
    .poll(async () => (await state(host)).phase, PHONE)
    .toBe("reveal");

  // The reveal: every photo with its name and how many found it.
  for (const page of [alice, bob, tv])
    await expect(page.locator(".match-key")).toHaveText(KEY, PHONE);
  await expect(tv.locator(".match-count")).toHaveText([
    "2 invités sur 2 ont trouvé",
    "1 invité sur 2 a trouvé",
    "1 invité sur 2 a trouvé",
    "1 invité sur 2 a trouvé",
  ]);
  const result = (page: Page) => page.locator(".round-result");
  await expect(result(alice).locator("strong")).toHaveText("+4 points", PHONE);
  await expect(result(alice)).toContainText("4 bonnes associations sur 4");
  await expect(result(bob).locator("strong")).toHaveText("+1 point", PHONE);
  await expect(result(bob)).toContainText("1 bonne association sur 4");
  await expect(bob.locator(".match-mine")).toHaveText([
    "Toi : Guillaume",
    "Toi : Renaud",
    "Toi : rien",
    "Toi : rien",
  ]);
  await expect(bob.locator(".match-mine.right")).toHaveCount(1);
  const live = await state(host);
  const points = Object.fromEntries(
    live.events
      .filter((e: { roundId: string }) => e.roundId === live.roundId)
      .map((e: { playerId: string; delta: number }) => [e.playerId, e.delta]),
  );
  expect(Object.values(points).sort()).toEqual([1, 4]);
  await tv.screenshot({ path: shots("tv-reveal") });
  await bob.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await bob.screenshot({ path: shots("phone-reveal"), fullPage: true });

  // The host's editor: the names on one tab, which name goes with each photo on the other.
  await hp.getByRole("tab", { name: "Les manches" }).click();
  await hp.getByRole("button", { name: `Modifier ${title}` }).click();
  await expect(hp.getByLabel(/Prénoms à associer/)).toHaveValue(
    NAMES.join("\n"),
  );
  await hp.screenshot({ path: shots("admin-names") });
  await hp.getByRole("tab", { name: "La bonne réponse" }).click();
  await expect(hp.locator(".secret-form")).toContainText(
    "Photo 1 : Guillaume · Photo 2 : Aloïs",
  );
  await hp.getByRole("button", { name: "Modifier la réponse" }).click();
  for (const [i, name] of KEY.entries())
    await expect(hp.getByLabel(`Prénom de la photo ${i + 1}`)).toHaveValue(
      name,
    );
  await hp.screenshot({ path: shots("admin-editor") });

  // Back to the party's order for the specs that follow.
  await api(host, "admin", "next");
  for (const page of [alice, bob]) await signOut(page);
  await resetParty(host);
  await api(host, "admin", "reorder", { ids: order });
});
