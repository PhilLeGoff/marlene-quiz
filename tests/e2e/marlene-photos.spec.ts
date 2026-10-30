import { readdirSync } from "node:fs";
import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { takeSelfie } from "./helpers";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
const PHONE = { width: 390, height: 844 },
  TV = { width: 1920, height: 1080 };
const unique = (name: string) => `${name} ${crypto.randomUUID().slice(0, 6)}`;
async function api(
  ctx: APIRequestContext,
  as: string,
  action: string,
  values: Record<string, unknown> = {},
) {
  const r = await ctx.post(`/api/game?as=${as}`, {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action, ...values },
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
// Earlier specs may leave the game anywhere: start from the lobby with one guest on a phone.
async function setup(browser: Browser, photos: string[] | null) {
  const host = await browser.newContext();
  await api(host.request, "admin", "join", {
    nickname: unique("Hôte album"),
    password: "admin-test-only",
  });
  const room = (await (await host.request.get("/api/game?as=admin")).json())
    .room as string;
  await api(host.request, "admin", "reset", { confirm: room });
  const withPhotos = async (ctx: BrowserContext) => {
    // Generated placeholders stand in for the photos of assets/marlene/ (never real photos here).
    if (photos)
      await ctx.addInitScript((list) => {
        window.__MARLENE_PHOTOS__ = list;
      }, photos);
    return ctx;
  };
  const phoneCtx = await withPhotos(
    await browser.newContext({ viewport: PHONE }),
  );
  await api(phoneCtx.request, "guest", "join", {
    nickname: unique("Téléphone"),
  });
  const phone = await phoneCtx.newPage();
  await phone.goto("/play");
  await takeSelfie(phone);
  await expect(phone.getByText("Tu es sur la liste !")).toBeVisible();
  const projector = await (
    await withPhotos(await browser.newContext({ viewport: TV }))
  ).newPage();
  return { host, phoneCtx, phone, projector };
}
// Colourful test cards drawn in a page, landscape, portrait and square.
async function placeholders(browser: Browser) {
  const page = await browser.newPage();
  const list = await page.evaluate(() =>
    [
      [1600, 1000, "#f87979"],
      [900, 1400, "#d9c9f4"],
      [1200, 1200, "#c9e6d5"],
    ].map(([w, h, color], i) => {
      const canvas = document.createElement("canvas");
      canvas.width = Number(w);
      canvas.height = Number(h);
      const g = canvas.getContext("2d")!;
      g.fillStyle = String(color);
      g.fillRect(0, 0, canvas.width, canvas.height);
      const side = Math.min(canvas.width, canvas.height);
      g.fillStyle = "#ffdf86";
      g.beginPath();
      g.arc(canvas.width / 2, canvas.height * 0.4, side / 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#392938";
      g.font = `bold ${Math.round(side / 8)}px sans-serif`;
      g.textAlign = "center";
      g.fillText(`TEST ${i + 1}`, canvas.width / 2, canvas.height * 0.85);
      return canvas.toDataURL("image/jpeg", 0.85);
    }),
  );
  await page.close();
  return list;
}
async function loaded(page: Page, selector: string) {
  const img = page.locator(selector).first();
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  return img;
}
async function answer(
  ctx: APIRequestContext,
  q: { kind: string; options?: string[] },
) {
  const value = q.options?.length
    ? [q.options[0]]
    : q.kind === "number"
      ? 1
      : "Une réponse de test";
  await api(ctx, "guest", "submit", { value });
}
test("polaroids of Marlène show on phones while waiting and on the TV while answering", async ({
  browser,
}) => {
  const { host, phoneCtx, phone, projector } = await setup(
    browser,
    await placeholders(browser),
  );
  // Waiting in the lobby.
  await loaded(phone, ".marlene-photos .mp-card.top img");
  await phone.waitForTimeout(1200);
  await phone.screenshot({
    path: test.info().outputPath("phone-lobby.png"),
    fullPage: true,
  });

  const q = (await api(host.request, "admin", "open")).question;
  await projector.goto("/present");
  await expect(projector.getByRole("heading", { name: q.title })).toBeVisible();
  if (q.kind !== "pictionary") {
    const album = projector.locator(".marlene-photos.tv");
    await loaded(projector, ".marlene-photos.tv .mp-card.top img");
    // The question, the timer and the participation count stay clear of the album.
    const photo = (await album.boundingBox())!;
    for (const target of [
      projector.getByRole("heading", { name: q.title }),
      projector.getByText(/participations reçues/),
      projector.locator(".timer"),
    ]) {
      const box = (await target.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(TV.height);
      expect(
        box.x + box.width <= photo.x ||
          box.y + box.height <= photo.y ||
          box.y >= photo.y + photo.height,
      ).toBe(true);
    }
    await projector.waitForTimeout(1200);
    await projector.screenshot({
      path: test.info().outputPath("tv-open-round.png"),
    });
  }

  // While answering, nothing sits next to the answer controls.
  await expect(phone.getByRole("heading", { name: q.title })).toBeVisible();
  await expect(phone.locator(".marlene-photos")).toHaveCount(0);
  await answer(phoneCtx.request, q);
  await expect(
    phone.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible();
  await loaded(phone, ".answer-received .marlene-photos .mp-card.top img");
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await phone.waitForTimeout(1200);
  await phone.screenshot({
    path: test.info().outputPath("phone-answered.png"),
    fullPage: true,
  });
  // A few seconds later the next one drops in on top of the previous one.
  await expect(phone.locator(".marlene-photos .mp-card")).toHaveCount(2, {
    timeout: 9000,
  });
  const sources = await phone
    .locator(".marlene-photos .mp-card img")
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
  expect(new Set(sources).size).toBe(2);

  // Reduced motion: no drop, drift or zoom, only a slow crossfade.
  await phone.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await phone
      .locator(".marlene-photos .mp-card.top")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("mp-fade");
  expect(
    await phone
      .locator(".marlene-photos .mp-card.top img")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");

  // Once the round is closed, the TV goes back to its usual layout.
  await api(host.request, "admin", "close");
  await expect(projector.locator(".marlene-photos")).toHaveCount(0);
  await expect(phone.getByText("Les jeux sont faits !")).toBeVisible();
  await expect(phone.locator(".marlene-photos")).toHaveCount(1);
});
test("without photos, every screen stays as it was", async ({ browser }) => {
  const { host, phoneCtx, phone, projector } = await setup(browser, []);
  const q = (await api(host.request, "admin", "open")).question;
  await projector.goto("/present");
  await expect(projector.getByRole("heading", { name: q.title })).toBeVisible();
  await answer(phoneCtx.request, q);
  await expect(
    phone.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible();
  await phone.waitForTimeout(1500);
  await expect(phone.locator(".marlene-photos")).toHaveCount(0);
  await expect(projector.locator(".marlene-photos")).toHaveCount(0);
  await expect(projector.locator(".present-stage.album")).toHaveCount(0);
});
test("the build shows exactly the photos of assets/marlene/", async ({
  browser,
}) => {
  const inFolder = readdirSync("assets/marlene").filter((f) =>
    /\.(jpe?g|png|webp|gif|avif)$/i.test(f),
  ).length;
  const { phone } = await setup(browser, null);
  if (!inFolder) {
    await phone.waitForTimeout(1500);
    await expect(phone.locator(".marlene-photos")).toHaveCount(0);
    return;
  }
  const img = await loaded(phone, ".marlene-photos .mp-card.top img");
  expect(await img.getAttribute("src")).toMatch(/^\/_next\/static\/media\//);
});
