// One whole party, played through the real screens, with every perspective open at once:
// two guest phones (one at 390×844), Marlène's phone (she plays too), the projector
// (/present) and the host's backstage (/admin). Each round checks what every screen shows, and that no answer
// key reaches a guest or the TV before the reveal.
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  api,
  CLOSED_PHASES,
  hostSignIn,
  joinWithSelfie,
  marleneSignIn,
  OPEN_PHASES,
  PHONE,
  PHONE_SIZE,
  projectorState,
  resetParty,
  scribble,
  signOut,
  state,
  unique,
  upload,
  wav,
} from "./helpers";

// The seeded running order; a question missing from the party is simply not played.
const ORDER = [
  "q1",
  "q2",
  "q3",
  "q4",
  "q5",
  "q6a",
  "q6b",
  "q6c",
  "q7",
  "q9",
  "q10",
  "q11",
  "q12",
  "q13",
  "q14",
  "q15",
  "q16",
  "q17",
];
// Answers Marlène types herself in her space during this test, so they start empty.
const TYPED_BY_MARLENE = ["q5", "q9", "q14", "q16", "q17"];
const KEYS = {
  height: 168,
  screenTime: 240,
  bodyCount: 3,
  dream: "Faire le tour du monde",
  word: "Éléphant rose",
  theme: "Marlène à 80 ans",
};

test("a whole party from the guest phones, Marlène’s space, the TV and the host", async ({
  browser,
}) => {
  test.setTimeout(15 * 60_000);
  const shots = (name: string) => `outputs/full-game/${name}.png`;

  // ── Host signs in and sets the party up ────────────────────────────────────────────
  const hostCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const hp = await hostCtx.newPage();
  await hostSignIn(hp);
  const host = hostCtx.request;
  let d = await resetParty(host);
  const rank = (id: string) =>
    ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length;
  await api(host, "admin", "reorder", {
    ids: d.questions
      .map((q: { id: string }) => q.id)
      .sort((a: string, b: string) => rank(a) - rank(b)),
  });
  const clip = await upload(host, "test-tone.wav", "audio/wav", wav());
  for (const q of d.questions) {
    const patch: Record<string, unknown> = {
      // The host turns the body count on like any round; the photo round needs real photos.
      enabled: ORDER.includes(q.id) && q.kind !== "photo",
      // Long enough that a slow machine never runs a round out of time.
      duration: 600,
    };
    if (q.kind === "blind") {
      patch.media = [clip];
      patch.clipStart = 0; // blindtest-clip.spec may have moved the section past 1 s
      patch.clipEnd = 1;
    }
    if (TYPED_BY_MARLENE.includes(q.id)) patch.options = []; // clears the stored key
    await api(host, "admin", "edit", { questionId: q.id, patch });
  }
  d = await state(host);
  const has = (id: string) =>
    d.questions.some((q: { id: string }) => q.id === id);
  const title = (id: string) =>
    d.questions.find((q: { id: string }) => q.id === id).title as string;

  // ── The TV, Marlène and two guests arrive ──────────────────────────────────────────
  const tvCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const tv = await tvCtx.newPage();
  await tv.goto("/present");
  await expect(tv.locator(".qr-wrap svg")).toBeVisible();
  await expect(
    tv.getByText("Scanne, entre ton nom et rejoins la fête."),
  ).toBeVisible();

  const starCtx = await browser.newContext(PHONE_SIZE);
  const mp = await starCtx.newPage();
  // She types her name on the home page like a guest and lands on her PIN pad.
  await marleneSignIn(mp, "marlene");
  await expect(mp.getByText("Bienvenue dans ton royaume.")).toBeVisible();
  const MARLENE = "Marlène";

  const aliceName = unique("Alice"),
    bobName = unique("Bob");
  const aliceCtx = await browser.newContext(PHONE_SIZE),
    bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage(),
    bob = await bobCtx.newPage();
  await joinWithSelfie(alice, aliceName);
  await joinWithSelfie(bob, bobName);
  // Marlène plays too: she is counted with the two guests.
  const guests = (await state(host)).players.length as number;
  expect(guests, "both phones and Marlène are counted").toBe(3);
  const phones = [alice, bob];
  const screens = [alice, bob, tv, hp];

  // Lobby: everyone sees both guests and Marlène; the host sees the head count.
  for (const page of screens)
    for (const name of [aliceName, bobName, MARLENE])
      await expect(
        page.locator(".player-bubble", { hasText: name }),
      ).toBeVisible(PHONE);
  await expect(tv.locator("header")).toContainText(`${guests} invités`);
  await expect(
    hp.locator(".stat", { hasText: "Invités dans la place" }).locator("b"),
  ).toHaveText(String(guests), PHONE);
  await expect(alice.getByText(`${guests} invités dans la place`)).toBeVisible(
    PHONE,
  );
  await expect(hp.getByText("Tout le monde a son verre ?")).toBeVisible();
  await tv.screenshot({ path: shots("tv-lobby") });
  await alice.screenshot({ path: shots("phone-lobby") });

  // ── Marlène prepares her secrets ───────────────────────────────────────────────────
  const bodyCount = has("q11") ? "q11" : undefined;
  async function keepSecret(
    id: string,
    fill: (form: Locator) => Promise<void>,
    shown: string,
  ) {
    await mp.getByLabel("Choisir une manche").selectOption(id);
    const form = mp.locator(".secret-form");
    const edit = form.getByRole("button", { name: "Modifier la réponse" });
    if (await edit.isVisible()) await edit.click();
    await fill(form);
    await form
      .getByRole("button", { name: /Enregistrer en privé|Lancer ce thème/ })
      .click();
    await expect(form.getByText("Réponse déjà enregistrée")).toBeVisible();
    await expect(form).toContainText(shown);
  }
  const value = (label: string | RegExp, text: string) => (form: Locator) =>
    form.getByLabel(label, { exact: typeof label === "string" }).fill(text);
  await keepSecret(
    "q5",
    value(/La bonne valeur/, String(KEYS.height)),
    `${KEYS.height} cm`,
  );
  await keepSecret(
    "q9",
    value(/La bonne valeur/, String(KEYS.screenTime)),
    String(KEYS.screenTime),
  );
  if (bodyCount)
    await keepSecret(
      bodyCount,
      value("Ta réponse", String(KEYS.bodyCount)),
      String(KEYS.bodyCount),
    );
  await keepSecret("q14", value("Ta réponse", KEYS.dream), KEYS.dream);
  await keepSecret(
    "q16",
    value("Ton mot ou ta phrase secrète", KEYS.word),
    KEYS.word,
  );
  await mp.screenshot({ path: shots("marlene-secrets"), fullPage: true });
  // None of it reaches a guest or the TV.
  for (const view of [
    await state(aliceCtx.request, "guest"),
    await projectorState(tvCtx.request),
  ]) {
    expect(view.secrets).toBeUndefined();
    expect(view.answer).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(KEYS.dream);
    expect(JSON.stringify(view)).not.toContain(KEYS.word);
  }

  // ── Round helpers ──────────────────────────────────────────────────────────────────
  const phaseLabel: Record<string, string> = {
    question_open: "À vous de jouer",
    pictionary_live: "Mais qu’est-ce qu’elle dessine ?",
    waiting_for_marlene_answer: "Marlène prépare la surprise",
    drawing_open: "À vos chefs-d’œuvre",
  };
  // Host opens the round; every screen shows its title and that answers are open.
  async function open(id: string, expectedPhase = "question_open") {
    await hp
      .getByRole("button", { name: /Lancer la fête|Ouvrir la manche/ })
      .click();
    const heading = { name: title(id), exact: true };
    for (const page of [...screens, mp]) {
      await expect(page.getByRole("heading", heading)).toBeVisible(PHONE);
      await expect(page.locator(".game-meta").first()).toContainText(
        phaseLabel[expectedPhase],
        PHONE,
      );
    }
    if (expectedPhase !== "waiting_for_marlene_answer") {
      await expect(tv.locator(".timer")).toHaveAttribute(
        "aria-label",
        /\d+ secondes restantes/,
      );
      await expect(alice.locator(".timer")).toBeVisible();
    }
    await keysStayHidden(id);
  }
  // While a round is open, guests and the TV get no key, no alias, nobody else's answer.
  async function keysStayHidden(id: string) {
    const kind = d.questions.find((q: { id: string }) => q.id === id).kind;
    for (const view of [
      await state(aliceCtx.request, "guest"),
      await state(bobCtx.request, "guest"),
      await projectorState(tvCtx.request),
    ]) {
      expect(OPEN_PHASES).toContain(view.phase);
      expect(view.secrets).toBeUndefined();
      expect(view.submissions).toBeUndefined();
      expect(view.events).toBeUndefined();
      expect(view.question.aliases).toEqual([]);
      if (kind === "drawing")
        expect(Object.keys(view.answer ?? {})).not.toContain("text");
      else expect(view.answer).toBeUndefined();
      const json = JSON.stringify(view);
      for (const key of [KEYS.dream, KEYS.word])
        expect(json).not.toContain(key);
    }
    for (const page of [alice, bob, tv])
      await expect(page.locator(".reveal-answer")).toHaveCount(0);
  }
  const option = (page: Page, text: string) =>
    page
      .locator(".answer-option")
      .filter({ has: page.getByText(text, { exact: true }) });
  async function pick(page: Page, options: string[]) {
    for (const text of options) await option(page, text).click(PHONE);
    await page
      .getByRole("button", { name: /Valider mon (choix|pyjama)/ })
      .click();
  }
  const submitted = (page: Page) =>
    expect
      .poll(
        async () =>
          (
            await state(
              page.context().request,
              page === mp ? "marlene" : "guest",
            )
          ).submitted,
        PHONE,
      )
      .toBe(true);
  // The first answer of a round: the phone confirms it and every count goes to 1.
  // Marlène sits out the rounds she leads, so they count one player less.
  async function firstAnswerShows(page: Page, players = guests) {
    await expect(
      page.getByRole("heading", { name: "C’est dans la boîte !" }),
    ).toBeVisible(PHONE);
    await expect(
      hp
        .locator(".stat", { hasText: "Participations de la manche" })
        .locator("b"),
    ).toHaveText(`1 / ${players}`, PHONE);
    await expect(
      tv.getByText(`1 / ${players} participations reçues`),
    ).toBeVisible(PHONE);
  }
  const phase = async () => (await state(host)).phase as string;
  // Closes and reveals from the host's buttons, unless the round already did it itself.
  async function settle() {
    let live = await state(host);
    if (OPEN_PHASES.includes(live.phase)) {
      await hp.getByRole("button", { name: "Fermer les réponses" }).click();
      await expect
        .poll(async () => (await state(host)).phase)
        .not.toBe(live.phase);
      live = await state(host);
    }
    if (CLOSED_PHASES.includes(live.phase)) {
      await hp
        .getByRole("button", {
          name:
            live.phase === "drawing_submissions_closed"
              ? "Ouvrir le vote"
              : "Révéler la réponse",
        })
        .click();
      await expect
        .poll(async () => (await state(host)).phase)
        .not.toBe(live.phase);
      live = await state(host);
    }
    return live;
  }
  const result = (page: Page) => page.locator(".round-result");
  async function revealed(answer: string) {
    for (const page of [alice, bob, tv, hp])
      await expect(page.locator(".reveal-answer").first()).toContainText(
        answer,
        PHONE,
      );
  }
  async function next() {
    await hp.getByRole("button", { name: "Manche suivante" }).click();
    await expect
      .poll(async () => (await state(host)).phase)
      .toMatch(/next_round|finished/);
  }

  // ── Multi-select rounds: score direction only (per-option scoring may change) ──────
  await open("q1");
  await pick(alice, ["Philippe", "Simone"]);
  await firstAnswerShows(alice);
  // Reconnecting keeps the answer.
  await alice.reload();
  await expect(
    alice.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible(PHONE);
  await alice.screenshot({ path: shots("phone-answer-received") });
  await pick(bob, ["Gaspard"]);
  await submitted(bob);
  // Both guests are in, but the round waits for Marlène, who answers from her phone.
  await expect(tv.getByText(`2 / ${guests} participations reçues`)).toBeVisible(
    PHONE,
  );
  await tv.screenshot({ path: shots("tv-waiting-for-marlene") });
  expect(await phase()).toBe("question_open");
  await expect(mp.locator(".secrets-panel")).not.toHaveAttribute("open");
  await option(mp, "Philippe").click(PHONE);
  await mp.screenshot({ path: shots("marlene-answering") });
  await mp.getByRole("button", { name: /Valider mon choix/ }).click();
  // Her answer was the last one: the round closes and reveals itself.
  await expect.poll(phase, PHONE).toBe("reveal");
  await revealed("Philippe + Simone");
  await expect(result(alice)).toHaveClass(/positive/, PHONE);
  await expect(result(bob)).toHaveClass(/negative/, PHONE);
  await expect(result(mp).locator("strong")).toHaveText("+1 point", PHONE);
  await alice.screenshot({ path: shots("phone-reveal") });
  await next();

  for (const [id, right, wrong] of [
    ["q2", ["France", "Canada", "Indonésie", "Australie"], ["Japon"]],
    [
      "q3",
      ["Elle a fait pipi", "Elle a sauté du balcon en culotte"],
      ["Elle a vomi sur le tapis"],
    ],
  ] as const) {
    await open(id);
    await expect(tv.locator(".answer-option")).toHaveCount(
      d.questions.find((q: { id: string }) => q.id === id).options.length,
    );
    await pick(alice, [...right]);
    await submitted(alice);
    await pick(bob, [...wrong]);
    await submitted(bob);
    await settle();
    await revealed(right.join(" + "));
    await expect(result(alice)).toHaveClass(/positive/, PHONE);
    await expect(result(bob)).toHaveClass(/negative/, PHONE);
    await next();
  }

  // ── Single choice: exact ±1, then the leaderboard on every screen ──────────────────
  await open("q4");
  await tv.screenshot({ path: shots("tv-question-open") });
  await hp.screenshot({ path: shots("admin-question-open") });
  await pick(alice, ["Son cheval"]);
  await firstAnswerShows(alice);
  await pick(bob, ["Son chat"]);
  await submitted(bob);
  await pick(mp, ["Son cheval"]);
  await expect.poll(phase, PHONE).toBe("reveal");
  await revealed("Son cheval");
  await expect(result(alice).locator("strong")).toHaveText("+1 point", PHONE);
  await expect(result(bob).locator("strong")).toHaveText("-1 point", PHONE);
  await bob.reload();
  await expect(result(bob).locator("strong")).toHaveText("-1 point", PHONE);
  await tv.screenshot({ path: shots("tv-reveal") });
  await hp.getByRole("button", { name: "Voir le classement" }).click();
  for (const page of [alice, bob, tv, hp, mp])
    await expect(
      page.getByRole("heading", { name: "Le classement des légendes" }),
    ).toBeVisible(PHONE);
  await expect(alice.locator(".leaderboard-row.me")).toContainText(
    `${aliceName} · toi`,
  );
  await expect(mp.locator(".leaderboard-row.me")).toContainText(
    `${MARLENE} · toi`,
  );
  await expect(mp.locator(".leaderboard-row.me")).toContainText("2 pts");
  await expect(
    tv.locator(".leaderboard-row", { hasText: MARLENE }),
  ).toBeVisible();
  await expect(bob.locator(".leaderboard-row.me")).toContainText(
    `${bobName} · toi`,
  );
  await expect(tv.locator(".leaderboard-row").first()).toContainText(aliceName);
  await tv.screenshot({ path: shots("tv-leaderboard") });
  await next();

  // ── Height slider: Marlène's private number; direction only ─────────────────────────
  await open("q5");
  const aliceSlider = alice.getByRole("slider", { name: /Ton estimation/ });
  await expect(aliceSlider).toBeVisible(PHONE);
  await aliceSlider.focus();
  const centre = Number(await aliceSlider.inputValue());
  for (let i = 0; i < Math.abs(centre - KEYS.height); i++)
    await alice.keyboard.press(
      centre > KEYS.height ? "ArrowLeft" : "ArrowRight",
    );
  await expect(aliceSlider).toHaveValue(String(KEYS.height));
  await alice.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await firstAnswerShows(alice);
  const bobSlider = bob.getByRole("slider", { name: /Ton estimation/ });
  await bobSlider.focus();
  await bob.keyboard.press("Home");
  await bob.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await submitted(bob);
  // Marlène guesses her own height like everyone, one centimetre short.
  const starSlider = mp.getByRole("slider", { name: /Ton estimation/ });
  await starSlider.focus();
  const middle = Number(await starSlider.inputValue());
  for (let i = 0; i < Math.abs(middle - (KEYS.height - 1)); i++)
    await mp.keyboard.press(
      middle > KEYS.height - 1 ? "ArrowLeft" : "ArrowRight",
    );
  await mp.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await expect.poll(phase, PHONE).toBe("reveal");
  await revealed(`${KEYS.height} cm`);
  await expect(result(alice)).toHaveClass(/positive/, PHONE);
  await expect(result(bob)).toHaveClass(/negative/, PHONE);
  await expect(result(mp).locator("strong")).toHaveText("+4 points", PHONE);
  await expect(result(mp)).toContainText("1 cm d’écart");
  await mp.screenshot({ path: shots("marlene-result") });
  await next();

  // ── Blind tests: the host plays the clip on the TV ─────────────────────────────────
  for (const id of ["q6a", "q6b", "q6c"].filter(has)) {
    const key = d.secrets[id].answers[0] as string;
    const wrong = d.questions
      .find((q: { id: string }) => q.id === id)
      .options.find((o: string) => o !== key) as string;
    await open(id);
    await hp.getByRole("button", { name: "Jouer / rejouer l’extrait" }).click();
    await expect(tv.locator(".audio-player")).toContainText(
      "Ouvre grand les oreilles.",
      PHONE,
    );
    await expect(tv.locator(".audio-player audio")).toHaveAttribute(
      "src",
      /\/api\/media\?id=/,
    );
    expect((await projectorState(tvCtx.request)).audio.playing).toBe(true);
    await pick(alice, [key]);
    await submitted(alice);
    await pick(bob, [wrong]);
    await submitted(bob);
    await settle();
    await revealed(key);
    await expect(result(alice).locator("strong")).toHaveText("+1 point", PHONE);
    await expect(result(bob).locator("strong")).toHaveText("-1 point", PHONE);
    await next();
  }

  // ── Bedtime must-have: a single choice, so no "several answers" hint ─────────────
  await open("q7");
  await expect(alice.locator(".question-hint")).toHaveCount(0);
  await pick(alice, ["Des chaussettes"]);
  await expect(
    alice.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible(PHONE);
  await pick(bob, ["Son doudou"]);
  await submitted(bob);
  await settle();
  await revealed("Des chaussettes");
  await expect(result(alice).locator("strong")).toHaveText("+1 point", PHONE);
  await expect(result(bob).locator("strong")).toHaveText("-1 point", PHONE);
  await next();

  // ── Screen time: Bob doesn't answer, so the host closes it ────────────────────────
  await open("q9");
  await alice.locator("input.number-answer").fill(String(KEYS.screenTime));
  await alice.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await firstAnswerShows(alice);
  expect((await state(host)).phase).toBe("question_open");
  await settle();
  await revealed(String(KEYS.screenTime));
  await expect(result(alice)).toHaveClass(/positive/, PHONE);
  await expect(result(bob)).toHaveCount(0);
  await next();

  // ── Dream job: the host adds 30 seconds ───────────────────────────────────────────
  await open("q10");
  await hp.getByRole("button", { name: "Encore 30 secondes" }).click();
  await expect
    .poll(
      async () =>
        Number(
          (await tv.locator(".timer").getAttribute("aria-label"))?.split(
            " ",
          )[0],
        ),
      PHONE,
    )
    .toBeLessThanOrEqual(30);
  await api(host, "admin", "timer", { seconds: 600 }); // and back to plenty
  await pick(alice, ["Prof de plongée"]);
  await submitted(alice);
  await pick(bob, ["Influenceuse"]);
  await submitted(bob);
  await settle();
  await revealed("Prof de plongée");
  await next();

  // ── Body count: a normal round; Marlène answers it and triggers her own reveal ────
  if (bodyCount) {
    await open(bodyCount);
    await alice.getByLabel("Ta réponse").fill("5");
    await alice.getByRole("button", { name: /Envoyer ma réponse/ }).click();
    await firstAnswerShows(alice);
    const own = mp.locator(".star-current");
    await own.getByLabel("Ta réponse").fill(String(KEYS.bodyCount));
    await mp.screenshot({ path: shots("marlene-answering-body-count") });
    await own.getByRole("button", { name: /Envoyer ma réponse/ }).click();
    await submitted(mp);
    // Bob passes, so the host closes it.
    await hp.getByRole("button", { name: "Fermer les réponses" }).click();
    await expect(
      mp.getByRole("button", { name: "Révéler ma réponse" }),
    ).toHaveCount(0);
    // The box follows the server's state, so it ticks once the host's command lands.
    const allow = hp.getByLabel("Autoriser Marlène à déclencher la révélation");
    await allow.click();
    await expect(allow).toBeChecked();
    await mp.getByRole("button", { name: "Révéler ma réponse" }).click(PHONE);
    await revealed(String(KEYS.bodyCount));
    // A "Marlène dévoile" round: no points until the host validates a guess.
    await expect(result(alice)).toHaveCount(0);
    await next();
  }

  // ── Red flag: moderation takes Bob's point back ───────────────────────────────────
  {
    const key = d.secrets.q13.answers[0] as string;
    await open("q13");
    await pick(alice, [key]);
    await submitted(alice);
    await pick(bob, [key]);
    await submitted(bob);
    await settle();
    await expect(result(bob).locator("strong")).toHaveText("+1 point", PHONE);
    const bobRow = hp.locator(".submission-row", { hasText: bobName });
    await bobRow.getByRole("button", { name: "Retirer" }).click();
    await expect(bobRow).toContainText("Retirée");
    await expect(result(bob)).toContainText(
      "Participation retirée par l’hôte",
      PHONE,
    );
    await expect(result(bob).locator("strong")).toHaveText("0 points");
    await expect(result(alice).locator("strong")).toHaveText("+1 point");
    await next();
  }

  // ── Marlène reveals, guests guess in free text, the host grades ───────────────────
  await open("q14");
  await expect(tv.locator("body")).not.toContainText(KEYS.dream);
  await alice.getByLabel("Ta réponse").fill("Acheter une île");
  await alice.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await firstAnswerShows(alice);
  await bob.getByLabel("Ta réponse").fill("faire le tour du monde !");
  await bob.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await submitted(bob);
  await settle();
  await revealed(KEYS.dream);
  await hp
    .locator(".submission-row", { hasText: bobName })
    .getByRole("button", { name: "Valider +1" })
    .click();
  await hp
    .locator(".submission-row", { hasText: aliceName })
    .getByRole("button", { name: "Refuser −1" })
    .click();
  await expect(result(bob).locator("strong")).toHaveText("+1 point", PHONE);
  await expect(result(bob)).toContainText("Réponse validée par l’hôte");
  await expect(result(alice).locator("strong")).toHaveText("-1 point", PHONE);
  await hp.screenshot({ path: shots("admin-grading"), fullPage: true });
  await next();

  // ── Creative excuses: Marlène picks her favourite, without names ──────────────────
  const aliceExcuse = "J’ai piscine avec mon hamster",
    bobExcuse = "Mon chat a mangé mon agenda";
  await open("q15");
  // She judges this one, so she doesn't answer it and the round doesn't wait for her.
  await expect(
    mp.getByRole("heading", { name: "Les invités cherchent leurs excuses." }),
  ).toBeVisible(PHONE);
  await api(starCtx.request, "marlene", "submit", { value: "Non" }, 403);
  await alice.getByLabel("Ta réponse").fill(aliceExcuse);
  await alice.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await submitted(alice);
  await bob.getByLabel("Ta réponse").fill(bobExcuse);
  await bob.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  await submitted(bob);
  await expect.poll(phase, PHONE).toBe("submissions_closed");
  await settle();
  const starView = await state(starCtx.request, "marlene");
  expect(starView.submissions).toHaveLength(2);
  for (const s of starView.submissions) expect(s.playerId).toBe("");
  await expect(mp.locator(".star-current")).not.toContainText(aliceName);
  await mp.locator(".answer-option", { hasText: aliceExcuse }).click(PHONE);
  await mp.getByRole("button", { name: /Mon coup de cœur/ }).click();
  await mp
    .getByRole("button", { name: "Oui, c’est mon coup de cœur !" })
    .click();
  for (const page of [alice, bob, tv])
    await expect(page.locator(".reveal-answer").first()).toContainText(
      aliceName,
      PHONE,
    );
  await expect(result(alice).locator("strong")).toHaveText("+5 points", PHONE);
  await next();

  // ── Pictionary: Marlène draws live, the first right guess wins ────────────────────
  await open("q16", "pictionary_live");
  await expect(mp.getByText(`Ton mot secret : ${KEYS.word}`)).toBeVisible();
  for (const page of [alice, bob, tv])
    await expect(page.locator("body")).not.toContainText(KEYS.word);
  await scribble(mp);
  await expect(tv.locator(".projection-drawing svg path").first()).toBeAttached(
    PHONE,
  );
  await expect(
    alice.locator(".drawing-surface.readonly svg path").first(),
  ).toBeAttached(PHONE);
  await tv.screenshot({ path: shots("tv-pictionary") });
  await bob.getByLabel("Alors, c’est quoi ce dessin ?").fill("Une girafe");
  await bob.getByRole("button", { name: /C’est mon dernier mot/ }).click();
  await expect(bob.getByText("« Une girafe » : pas encore !")).toBeVisible(
    PHONE,
  );
  await alice.getByLabel("Alors, c’est quoi ce dessin ?").fill("elephant ROSE");
  await alice.getByRole("button", { name: /C’est mon dernier mot/ }).click();
  for (const page of [alice, bob, tv]) {
    await expect(page.locator(".reveal-answer").first()).toContainText(
      aliceName,
      PHONE,
    );
    await expect(page.locator(".reveal-answer").last()).toContainText(
      KEYS.word,
    );
  }
  await expect(result(alice).locator("strong")).toHaveText("+5 points", PHONE);
  await next();

  // ── Drawing contest: Marlène sets the theme live, then votes anonymously ──────────
  await open("q17", "waiting_for_marlene_answer");
  await expect(
    alice.getByRole("heading", { name: "Marlène prépare la surprise…" }),
  ).toBeVisible();
  await expect(tv.getByText("La reine prépare la surprise.")).toBeVisible();
  await expect(
    mp.getByRole("heading", { name: "Tout le monde t’attend !" }),
  ).toBeVisible();
  await mp.getByLabel("Choisir une manche").selectOption("q17");
  await mp.getByLabel("Le thème du concours").fill(KEYS.theme);
  await mp.getByRole("button", { name: /Lancer ce thème/ }).click();
  // The round opens: her secrets fold away while the guests draw.
  await expect(
    mp.getByRole("heading", { name: "Les artistes sont au travail." }),
  ).toBeVisible(PHONE);
  await expect(mp.locator(".secrets-panel")).not.toHaveAttribute("open");
  await expect(alice.getByText(`Le thème : ${KEYS.theme}`)).toBeVisible(PHONE);
  await expect(tv.getByRole("heading", { name: KEYS.theme })).toBeVisible(
    PHONE,
  );
  await keysStayHidden("q17");
  await scribble(alice);
  await alice.getByRole("button", { name: "Envoyer mon chef-d’œuvre" }).click();
  await firstAnswerShows(alice, guests - 1);
  await alice.screenshot({ path: shots("phone-drawing-sent") });
  await scribble(bob);
  await bob.getByRole("button", { name: "Envoyer mon chef-d’œuvre" }).click();
  await submitted(bob);
  await expect(hp.locator(".submission-preview")).toHaveCount(2, PHONE);
  await settle();
  await expect(
    tv.getByText("Le jury royal délibère. Les artistes sont encore anonymes."),
  ).toBeVisible(PHONE);
  await expect(tv.locator(".gallery-item")).toHaveCount(2);
  for (const page of [tv, mp])
    for (const name of [aliceName, bobName])
      await expect(page.locator(".gallery")).not.toContainText(name);
  // Alice sent first, so hers is n°1.
  await mp.getByRole("button", { name: /Chef-d’œuvre n°1/ }).click(PHONE);
  await mp.getByRole("button", { name: /Confirmer mon coup de cœur/ }).click();
  await mp
    .getByRole("button", { name: "Oui, c’est mon coup de cœur !" })
    .click();
  for (const page of [alice, bob, tv])
    await expect(page.locator(".reveal-answer").first()).toContainText(
      aliceName,
      PHONE,
    );
  await expect(tv.locator(".gallery")).toContainText(aliceName);
  await expect(tv.locator(".gallery")).toContainText(bobName);
  await expect(result(alice).locator("strong")).toHaveText("+5 points", PHONE);
  await tv.screenshot({ path: shots("tv-drawing-winner") });

  // ── Final leaderboard and podium ──────────────────────────────────────────────────
  await hp.getByRole("button", { name: "Voir le classement" }).click();
  await expect(
    tv.getByRole("heading", { name: "Le classement des légendes" }),
  ).toBeVisible(PHONE);
  await next();
  expect((await state(host)).phase).toBe("finished");
  const ranking = (await state(host)).players as {
    nickname: string;
    score: number;
  }[];
  const ours = ranking.filter((p) => [aliceName, bobName].includes(p.nickname));
  expect(ours.map((p) => p.nickname)).toEqual([aliceName, bobName]);
  expect(ours[0].score).toBeGreaterThan(ours[1].score);
  // Three players, so Marlène is on the podium too.
  expect(ranking.map((p) => p.nickname)).toContain(MARLENE);
  for (const page of [alice, bob, tv, hp, mp]) {
    await expect(
      page.getByRole("heading", { name: "Marlène, on t’aime !" }),
    ).toBeVisible(PHONE);
    await expect(page.locator(".podium-place.gold")).toContainText(
      ranking[0].nickname,
    );
    await expect(
      page.locator(".podium-place", { hasText: MARLENE }),
    ).toBeVisible();
  }
  await expect(alice.locator(".leaderboard-row.me")).toContainText(
    `${ours[0].score}`,
  );
  await expect(mp.locator(".leaderboard-row.me")).toContainText(
    `${MARLENE} · toi`,
  );
  await tv.screenshot({ path: shots("tv-podium") });
  await alice.screenshot({ path: shots("phone-podium"), fullPage: true });
  await mp.screenshot({ path: shots("marlene-podium") });

  // ── The host starts over: everyone is back in the lobby with zero points ──────────
  await hp.getByRole("button", { name: "Recommencer" }).click();
  await expect(
    hp.getByRole("heading", { name: "On recommence à zéro ?" }),
  ).toBeVisible();
  await hp.getByRole("button", { name: "Oui, recommencer" }).click();
  await expect(hp.getByText("Tout le monde a son verre ?")).toBeVisible();
  for (const page of phones) {
    await expect(
      page.getByRole("heading", { name: "Tu es sur la liste !" }),
    ).toBeVisible(PHONE);
    await expect(page.locator(".pill.butter")).toHaveText("0 points");
  }
  await expect(tv.locator(".qr-wrap svg")).toBeVisible(PHONE);
  await expect(mp.getByText("Bienvenue dans ton royaume.")).toBeVisible(PHONE);

  // Signed-in players keep later specs' rounds open, Marlène included.
  for (const page of [...phones, mp]) await signOut(page);
  for (const ctx of [hostCtx, tvCtx, starCtx, aliceCtx, bobCtx])
    await ctx.close();
});
