import { test, expect, type Page } from "@playwright/test";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";

// 90 s of generated sound (8 kHz, 16-bit mono): a beeping tone whose loudness
// rises and falls, so the waveform has a shape. Never a real song.
function tone(seconds = 90) {
  const rate = 8000,
    samples = rate * seconds;
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const swell = 0.25 + 0.75 * Math.abs(Math.sin((t * Math.PI) / 23));
    const beat = t % 0.5 < 0.3 ? 1 : 0.35;
    b.writeInt16LE(
      Math.round(Math.sin(t * Math.PI * 2 * 440) * 9000 * swell * beat),
      44 + i * 2,
    );
  }
  return b;
}

const value = async (page: Page, name: string) =>
  Number(
    await page.getByRole("slider", { name }).getAttribute("aria-valuenow"),
  );

test("the host picks the blind-test section ahead of time and the round plays only that section", async ({
  browser,
}) => {
  const host = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const hp = await host.newPage();
  const api = async (data: Record<string, unknown>) => {
    const r = await host.request.post("/api/game?as=admin", {
      headers: { Origin: origin },
      data: { id: crypto.randomUUID(), ...data },
    });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  };
  const state = async () =>
    (await host.request.get("/api/game?as=admin")).json();
  await hp.goto("/admin");
  await hp
    .getByLabel("Ton petit nom")
    .fill(`Hôte ${crypto.randomUUID().slice(0, 4)}`);
  await hp.getByLabel("Mot de passe administrateur").fill("admin-test-only");
  await hp.getByRole("button", { name: "Ouvrir les coulisses" }).click();
  await expect(
    hp.getByRole("button", { name: "Inviter les copains" }),
  ).toBeVisible();
  let d = await state();
  await api({ action: "reset", confirm: d.room });
  d = await state();
  const ids: string[] = d.questions.map((q: { id: string }) => q.id);
  await api({
    action: "reorder",
    ids: ["q6a", ...ids.filter((x) => x !== "q6a")],
  });
  const q = d.questions.find((x: { id: string }) => x.id === "q6a");

  await hp.getByRole("tab", { name: "Les manches" }).click();
  await hp.getByRole("button", { name: `Modifier ${q.title}` }).click();
  const editor = hp.getByRole("dialog");
  // Without a song, only the two time fields show.
  await expect(
    editor.getByText("Importe la chanson pour choisir"),
  ).toBeVisible();
  await editor.locator('input[type="file"]').setInputFiles({
    name: "test-tone.wav",
    mimeType: "audio/wav",
    buffer: tone(),
  });
  await expect(editor.getByText("Chanson importée")).toBeVisible();
  await expect(editor.getByText("1:30", { exact: true })).toBeVisible();

  // Drag the start handle to about 0:20 on the timeline.
  const track = editor.locator(".clip-track");
  await editor
    .getByRole("button", { name: "Fin ici" })
    .scrollIntoViewIfNeeded();
  let box = (await track.boundingBox())!;
  const x = (seconds: number) => box.x + (box.width * seconds) / 90;
  const start = editor.getByRole("slider", { name: "Début de l’extrait" });
  const handle = (await start.boundingBox())!;
  await hp.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await hp.mouse.down();
  await hp.mouse.move(x(10), box.y + box.height / 2, { steps: 5 });
  await hp.mouse.move(x(20), box.y + box.height / 2, { steps: 5 });
  await hp.mouse.up();
  const dragged = await value(hp, "Début de l’extrait");
  expect(dragged).toBeGreaterThan(19);
  expect(dragged).toBeLessThan(21);
  // Arrow keys nudge by 1 s, with shift by 5 s.
  await start.press("ArrowRight");
  await start.press("Shift+ArrowRight");
  await start.press("ArrowLeft");
  const clipStart = await value(hp, "Début de l’extrait");
  expect(clipStart).toBeCloseTo(dragged + 5, 5);
  await expect(
    editor.getByRole("textbox", { name: /Début de l’extrait/ }),
  ).toHaveValue(/^0:2\d/);

  // Too short: refused with an explanation.
  const endField = editor.getByRole("textbox", { name: /Fin de l’extrait/ });
  await endField.fill(String(Math.floor(clipStart) + 2));
  await endField.press("Enter");
  await expect(editor.getByText(/au moins 5 secondes/)).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Écouter l’extrait" }),
  ).toBeDisabled();

  // Click the timeline 7 s after the start, then "Fin ici" at the playhead.
  await editor
    .getByRole("button", { name: "Fin ici" })
    .scrollIntoViewIfNeeded();
  box = (await track.boundingBox())!;
  await hp.mouse.click(x(clipStart + 7), box.y + 8);
  await editor.getByRole("button", { name: "Fin ici" }).click();
  const clipEnd = await value(hp, "Fin de l’extrait");
  expect(clipEnd - clipStart).toBeGreaterThan(6);
  expect(clipEnd - clipStart).toBeLessThan(8);
  await expect(editor.getByText(/c’est parfait/)).toBeVisible();

  // The preview plays exactly the section and stops at its end.
  const audio = editor.locator("audio");
  await editor.getByRole("button", { name: "Écouter l’extrait" }).click();
  await expect(
    editor.getByRole("button", { name: "Arrêter l’extrait" }),
  ).toBeVisible();
  const early = await audio.evaluate((a: HTMLAudioElement) => a.currentTime);
  expect(early).toBeGreaterThanOrEqual(clipStart - 0.05);
  expect(early).toBeLessThan(clipStart + 2);
  await expect(
    editor.getByRole("button", { name: "Écouter l’extrait" }),
  ).toBeVisible({ timeout: 15000 });
  const stopped = await audio.evaluate((a: HTMLAudioElement) => ({
    paused: a.paused,
    time: a.currentTime,
  }));
  expect(stopped.paused).toBe(true);
  expect(stopped.time).toBeCloseTo(clipEnd, 1);

  await editor.getByRole("button", { name: "Enregistrer la manche" }).click();
  await expect(editor).toBeHidden();
  d = await state();
  const saved = d.questions.find((x: { id: string }) => x.id === "q6a");
  expect(saved.clipStart).toBe(clipStart);
  expect(saved.clipEnd).toBe(clipEnd);
  expect(saved.media).toHaveLength(1);

  // The song is served in byte ranges, so players can seek into it.
  const part = await host.request.get(saved.media[0], {
    headers: { Range: "bytes=100-199" },
  });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toBe(
    `bytes 100-199/${tone().length}`,
  );
  expect((await part.body()).length).toBe(100);

  // During the round, "Jouer" starts the song at the section on the host's
  // screen and the TV, and stops it at the section's end.
  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`/present?room=${d.room}`);
  await api({ action: "open" });
  // Guests answer in a song search box: the TV shows no multiple-choice options.
  const projector = await (
    await host.request.get("/api/game?present=1")
  ).json();
  expect(projector.question.options).toEqual([]);
  await expect(tv.locator(".audio-player")).toBeVisible({ timeout: 30000 });
  await expect(tv.locator(".answer-option")).toHaveCount(0);
  await hp.getByRole("tab", { name: "La régie" }).click();
  const play = hp.getByRole("button", { name: /Jouer \/ rejouer/ });
  await expect(play).toBeVisible({ timeout: 30000 });
  const roundAudio = hp.locator(".audio-player audio");
  await expect(roundAudio).toHaveAttribute(
    "data-clip-start",
    String(clipStart),
  );
  await play.click();
  await expect
    .poll(() => roundAudio.evaluate((a: HTMLAudioElement) => !a.paused))
    .toBe(true);
  const live = await roundAudio.evaluate(
    (a: HTMLAudioElement) => a.currentTime,
  );
  expect(live).toBeGreaterThanOrEqual(clipStart - 0.05);
  expect(live).toBeLessThan(clipStart + 2);
  const tvAudio = tv.locator(".audio-player audio");
  await expect(tvAudio).toHaveAttribute("data-clip-start", String(clipStart), {
    timeout: 30000,
  });
  await expect
    .poll(() => tvAudio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThanOrEqual(clipStart - 0.05);
  expect(
    await tvAudio.evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeLessThan(clipEnd);
  // At the end of the section it stops and rewinds, ready to replay.
  await expect
    .poll(() => roundAudio.evaluate((a: HTMLAudioElement) => a.paused), {
      timeout: 15000,
    })
    .toBe(true);
  expect(
    await roundAudio.evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeCloseTo(clipStart, 1);
});
