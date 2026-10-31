import { test, expect, type APIRequestContext } from "@playwright/test";
import { joinWithSelfie, MARLENE_PIN, signOutApi } from "./helpers";
async function api(
  ctx: APIRequestContext,
  as: string,
  action: string,
  values: Record<string, unknown> = {},
  status = 200,
) {
  const r = await ctx.post(`/api/game?as=${as}`, {
    headers: { Origin: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105" },
    data: { id: crypto.randomUUID(), action, ...values },
  });
  const data = await r.json();
  expect(r.status(), JSON.stringify(data)).toBe(status);
  return data;
}
async function state(ctx: APIRequestContext, as = "admin") {
  return (await ctx.get(`/api/game?as=${as}`)).json();
}
// A round closes by itself once everyone has answered, and a round the server can mark
// is revealed as it closes; the host only steps in for what is left.
async function closeAndReveal(host: APIRequestContext) {
  let live = await state(host);
  if (
    [
      "question_open",
      "drawing_open",
      "pictionary_live",
      "waiting_for_marlene_answer",
    ].includes(live.phase)
  )
    live = await api(host, "admin", "close");
  if (["submissions_closed", "drawing_submissions_closed"].includes(live.phase))
    live = await api(host, "admin", "reveal");
  return live;
}
function wav() {
  const samples = 8000;
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i * Math.PI * 2 * 440) / 8000) * 4000),
      44 + i * 2,
    );
  return b;
}
test("complete multiplayer game: all answer types, secrecy, real race, anonymous vote and reconnection", async ({
  browser,
}) => {
  const host = await browser.newContext(),
    star = await browser.newContext(),
    guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    bob = await browser.newContext(),
    projector = await browser.newContext();
  const hp = await host.newPage();
  await hp.goto("/admin");
  const initial = await state(host.request);
  const runId = crypto.randomUUID().slice(0, 8);
  await hp.getByLabel("Ton petit nom").fill(`Hôte ${runId}`);
  await hp.getByLabel("Mot de passe administrateur").fill("admin-test-only");
  await hp.getByRole("button", { name: "Ouvrir les coulisses" }).click();
  await expect(
    hp.getByRole("button", { name: "Inviter les copains" }),
  ).toBeVisible();
  if (initial.initialized)
    await api(host.request, "admin", "reset", { confirm: initial.room });
  let d = await state(host.request);
  // Other specs reorder the rounds; this one starts with q1.
  const ids: string[] = d.questions.map((q: { id: string }) => q.id);
  await api(host.request, "admin", "reorder", {
    ids: ["q1", ...ids.filter((x) => x !== "q1")],
  });
  d = await state(host.request);
  const room = d.room;
  await api(star.request, "marlene", "join", { pin: MARLENE_PIN });
  await api(star.request, "marlene", "consent");
  const tone = await host.request.post("/api/media", {
    headers: { Origin: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105" },
    multipart: {
      file: { name: "test-tone.wav", mimeType: "audio/wav", buffer: wav() },
    },
  });
  expect(tone.ok()).toBeTruthy();
  const audio = (await tone.json()).url;
  const image = await host.request.post("/api/media", {
    headers: { Origin: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105" },
    multipart: {
      file: {
        name: "authorized-test.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRfoAAAAASUVORK5CYII=",
          "base64",
        ),
      },
    },
  });
  expect(image.ok()).toBeTruthy();
  const photo = (await image.json()).url;
  for (const q of d.questions) {
    const patch: Record<string, unknown> = { enabled: true, duration: 120 };
    if (q.kind === "blind") {
      patch.media = [audio];
      patch.clipStart = 0; // blindtest-clip.spec may have moved the section past 1 s
      patch.clipEnd = 1;
    }
    if (q.kind === "photo") {
      patch.media = [photo];
      patch.options = ["Portrait de test autorisé"];
    }
    await api(host.request, "admin", "edit", { questionId: q.id, patch });
  }
  d = await state(host.request);
  const values: Record<string, unknown> = {};
  for (const q of d.questions) {
    if (["choice", "multi", "outfit", "photo"].includes(q.kind)) {
      const answers = d.secrets[q.id]?.answers ?? [q.options[0]];
      await api(star.request, "marlene", "private", {
        questionId: q.id,
        answers,
      });
      values[q.id] = answers;
    } else if (q.kind === "number") {
      await api(star.request, "marlene", "private", {
        questionId: q.id,
        number: 168,
      });
      values[q.id] = 168;
    } else if (q.kind === "blind") {
      values[q.id] = q.options.length
        ? d.secrets[q.id].answers
        : d.secrets[q.id].text;
    } else if (q.kind === "pin") {
      await api(host.request, "admin", "private", {
        questionId: q.id,
        text: "8246",
      });
      values[q.id] = "8246";
    } else if (q.kind === "pictionary") {
      await api(star.request, "marlene", "private", {
        questionId: q.id,
        text: "Éléphant rose",
      });
      values[q.id] = "elephant rose";
    } else if (q.kind === "drawing") {
      await api(star.request, "marlene", "private", {
        questionId: q.id,
        prompt: "Un chat de test",
      });
    } else if (q.kind === "reveal") {
      await api(star.request, "marlene", "private", {
        questionId: q.id,
        ...(q.sensitive ? { number: 42 } : { text: "Un grand voyage de test" }),
      });
      values[q.id] = "Un grand voyage";
    } else values[q.id] = "Mon hamster organise une AG.";
  }
  const gp = await guest.newPage();
  const start = Date.now();
  await joinWithSelfie(gp, `Alice ${Date.now().toString(36).slice(-5)}`);
  await expect(
    gp.getByRole("heading", { name: "Tu es sur la liste !" }),
  ).toBeVisible();
  expect(Date.now() - start).toBeLessThan(15000);
  await api(bob.request, "guest", "join", {
    room,
    nickname: `Bob ${Date.now().toString(36).slice(-5)}`,
    avatar: 2,
  });
  const pp = await projector.newPage();
  await pp.goto(`/present?room=${room}`);
  await expect(pp.getByText("Scanne, entre ton nom")).toBeVisible();
  await api(guest.request, "guest", "open", {}, 403);
  const outsider = await browser.newContext();
  await api(outsider.request, "admin", "reveal", {}, 401);
  await outsider.close();
  for (let index = 0; index < d.questions.length; index++) {
    let live = await api(host.request, "admin", "open");
    const q = live.question;
    const publicGuest = await state(guest.request, "guest"),
      publicProjector = await (
        await projector.request.get(`/api/game?present=1&room=${room}`)
      ).json();
    expect(publicGuest.secrets).toBeUndefined();
    if (q.kind !== "drawing") expect(publicGuest.answer).toBeUndefined();
    expect(publicProjector.secrets).toBeUndefined();
    expect(publicGuest.question.aliases).toEqual([]);
    if (index === 0) {
      await expect(gp.getByRole("heading", { name: q.title })).toBeVisible();
      await gp.getByRole("button", { name: "Philippe", exact: false }).click();
      await gp.getByRole("button", { name: "Simone", exact: false }).click();
      await gp.getByRole("button", { name: "Valider mon choix" }).click();
      await expect(
        gp.getByRole("heading", { name: "C’est dans la boîte !" }),
      ).toBeVisible();
      await gp.reload();
      await expect(
        gp.getByRole("heading", { name: "C’est dans la boîte !" }),
      ).toBeVisible();
      await api(guest.request, "guest", "submit", { value: values[q.id] }, 409);
    } else if (q.kind === "pictionary") {
      const stroke = {
        id: "live-test-stroke",
        color: "#392938",
        size: 8,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.9 },
        ],
      };
      await api(star.request, "marlene", "stroke", { stroke });
      expect((await state(guest.request, "guest")).strokes).toHaveLength(1);
      expect(JSON.stringify(await state(guest.request, "guest"))).not.toContain(
        "Éléphant rose",
      );
      const results = await Promise.all(
        [guest.request, bob.request].map((ctx) =>
          ctx.post("/api/game?as=guest", {
            headers: {
              Origin: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105",
            },
            data: {
              id: crypto.randomUUID(),
              action: "submit",
              value: "ELEPHANT rose",
            },
          }),
        ),
      );
      expect(results.filter((r) => r.status() === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status() === 409)).toHaveLength(1);
      live = await state(host.request);
      expect(
        live.events.filter(
          (e: { roundId: string; delta: number }) =>
            e.roundId === live.roundId && e.delta === 5,
        ),
      ).toHaveLength(1);
    } else if (q.kind === "drawing") {
      const strokes = [
        {
          id: "drawing-test",
          color: "#392938",
          size: 8,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.8, y: 0.6 },
          ],
        },
      ];
      await expect(gp.getByRole("heading", { name: q.title })).toBeVisible();
      const surface = gp.locator(".drawing-surface svg");
      await expect(surface).toBeVisible();
      const box = await surface.boundingBox();
      await gp.mouse.move(box!.x + 25, box!.y + 25);
      await gp.mouse.down();
      await gp.mouse.move(box!.x + 100, box!.y + 100, { steps: 12 });
      await gp.mouse.up();
      await gp
        .getByRole("button", { name: "Envoyer mon chef-d’œuvre" })
        .click();
      await expect(
        gp.getByRole("heading", { name: "C’est dans la boîte !" }),
      ).toBeVisible();
      await api(bob.request, "guest", "submit", { value: strokes });
      await expect(hp.locator(".submission-preview")).toHaveCount(2);
      live = await closeAndReveal(host.request);
      const sv = await state(star.request, "marlene");
      expect(sv.gallery).toHaveLength(2);
      expect(sv.gallery[0].artist).toBeUndefined();
      const drawing = await star.request.get(sv.gallery[0].drawingUrl);
      expect(drawing.ok()).toBeTruthy();
      expect(await drawing.json()).toHaveLength(1);
      await api(star.request, "marlene", "vote", {
        submissionId: sv.gallery[0].id,
      });
      await api(
        star.request,
        "marlene",
        "vote",
        { submissionId: sv.gallery[0].id },
        400,
      );
      live = await state(host.request);
      expect(
        live.events.filter(
          (e: { roundId: string; delta: number }) =>
            e.roundId === live.roundId && e.delta === 5,
        ),
      ).toHaveLength(1);
    } else if (!q.sensitive) {
      await api(guest.request, "guest", "submit", { value: values[q.id] });
    }
    live = await state(host.request);
    if (!["pictionary_winner", "winner_revealed"].includes(live.phase)) {
      live = await closeAndReveal(host.request);
      if (q.kind === "creative") {
        const s = live.submissions[0];
        await api(star.request, "marlene", "vote", { submissionId: s.id });
      }
      if (q.kind === "reveal" && !q.sensitive && live.submissions.length)
        await api(host.request, "admin", "grade", {
          submissionId: live.submissions[0].id,
          correct: true,
        });
    }
    await api(host.request, "admin", "leaderboard");
    live = await api(host.request, "admin", "next");
    if (index < d.questions.length - 1) expect(live.phase).toBe("next_round");
    else expect(live.phase).toBe("finished");
  }
  await expect(
    gp.getByRole("heading", { name: "Marlène, on t’aime !" }),
  ).toBeVisible();
  const final = await state(host.request);
  expect(final.players[0].score).toBeGreaterThan(10);
  expect(final.secrets.q11).toBeUndefined();
  await gp.screenshot({
    path: "outputs/game-finished-mobile.png",
    fullPage: true,
  });
  await hp.reload();
  await expect(
    hp.getByRole("heading", { name: "À toi de mener la danse." }),
  ).toBeVisible();
  await hp.screenshot({ path: "outputs/admin-desktop.png", fullPage: true });
  for (const context of [guest, bob]) await signOutApi(context.request);
  for (const context of [host, star, guest, bob, projector])
    await context.close();
});
test("responsive welcome, accessible fields, reduced motion and keyboard dialog", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Marlène/);
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    const box = await page.locator(".join-ticket").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Les règles du jeu" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel("Ton petit nom")).toBeVisible();
  await expect(page.getByLabel("Code de la fête")).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
