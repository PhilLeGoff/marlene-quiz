import { readdirSync } from "node:fs";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { joinWithSelfie } from "./helpers";
const PHONE = { width: 390, height: 844 },
  DESKTOP = { width: 1440, height: 900 };
const unique = (name: string) => `${name} ${crypto.randomUUID().slice(0, 6)}`;
// Colourful test cards drawn in a page, standing in for the photos of assets/marlene/.
async function placeholders(browser: Browser) {
  const page = await browser.newPage();
  const list = await page.evaluate(() =>
    ["#f87979", "#d9c9f4", "#c9e6d5"].map((color, i) => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 1100;
      const g = canvas.getContext("2d")!;
      g.fillStyle = color;
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = "#392938";
      g.font = "bold 120px sans-serif";
      g.textAlign = "center";
      g.fillText(`TEST ${i + 1}`, 450, 600);
      return canvas.toDataURL("image/jpeg", 0.85);
    }),
  );
  await page.close();
  return list;
}
async function landing(
  browser: Browser,
  viewport: { width: number; height: number },
  photos: string[] | null,
) {
  const context = await browser.newContext({ viewport });
  if (photos)
    await context.addInitScript((list) => {
      window.__MARLENE_PHOTOS__ = list;
    }, photos);
  const page = await context.newPage();
  await page.goto("/");
  return page;
}
async function photoLoaded(page: Page) {
  const img = page.locator(".marlene-photos.hero .mp-card.top img");
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
}
const apart = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x + a.width <= b.x ||
  b.x + b.width <= a.x ||
  a.y + a.height <= b.y ||
  b.y + b.height <= a.y;
// The join form is what people come for: on screen without scrolling, and clear of the album.
async function formFirst(page: Page) {
  const name = page.getByLabel("Ton petit nom");
  const button = page.getByRole("button", { name: /Rejoindre la fête/ });
  await expect(name).toBeInViewport({ ratio: 1 });
  await expect(button).toBeInViewport({ ratio: 1 });
  const album = (await page.locator(".hero-photos").boundingBox())!;
  for (const target of [name, button, page.locator(".join-ticket")])
    expect(apart(album, (await target.boundingBox())!)).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("on a phone, the join form comes first and Marlène's polaroids follow it", async ({
  browser,
}) => {
  const phone = await landing(browser, PHONE, await placeholders(browser));
  await photoLoaded(phone);
  await formFirst(phone);
  // The cake is the fallback only.
  await expect(phone.locator(".cake-art")).toHaveCount(0);
  // The album sits right under the invitation.
  const ticket = (await phone.locator(".join-ticket").boundingBox())!;
  const album = (await phone.locator(".hero-photos").boundingBox())!;
  expect(album.y).toBeGreaterThan(ticket.y + ticket.height);
  await phone.screenshot({ path: test.info().outputPath("landing-phone.png") });

  // Joining still works.
  await joinWithSelfie(phone, unique("Fan de l’album"));
});
test("on a desktop, the polaroids sit above the invitation and the next one drops in", async ({
  browser,
}) => {
  const page = await landing(browser, DESKTOP, await placeholders(browser));
  await photoLoaded(page);
  await formFirst(page);
  // In the right-hand column, beside the title.
  const title = (await page.locator(".hero h1").boundingBox())!;
  const album = (await page.locator(".marlene-photos.hero").boundingBox())!;
  expect(album.x).toBeGreaterThan(title.x + title.width);
  await page.screenshot({
    path: test.info().outputPath("landing-desktop.png"),
  });
  await expect(page.locator(".marlene-photos.hero .mp-card")).toHaveCount(2, {
    timeout: 9000,
  });
});
test("without photos, the landing page keeps its cake", async ({ browser }) => {
  for (const viewport of [PHONE, DESKTOP]) {
    const page = await landing(browser, viewport, []);
    await expect(page.locator(".cake-art")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator(".marlene-photos")).toHaveCount(0);
    await expect(page.getByLabel("Ton petit nom")).toBeVisible();
    await page.context().close();
  }
});
test("landing fetches the real photos one by one, not the whole album", async ({
  browser,
}) => {
  test.skip(
    !readdirSync("assets/marlene").some((f) =>
      /\.(jpe?g|png|webp|gif|avif)$/i.test(f),
    ),
    "assets/marlene/ is empty",
  );
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  const fetched = new Set<string>();
  page.on("request", (r) => {
    if (/\/marlene-\d+\.[^/]*$/.test(new URL(r.url()).pathname))
      fetched.add(r.url());
  });
  await page.goto("/");
  await photoLoaded(page);
  expect(
    await page.locator(".marlene-photos.hero img").first().getAttribute("src"),
  ).toMatch(/^\/_next\/static\/media\/marlene-/);
  await page.waitForTimeout(2000);
  // The one on screen and the next one, warmed in advance; never all twenty.
  expect(fetched.size).toBeGreaterThanOrEqual(1);
  expect(fetched.size).toBeLessThanOrEqual(2);
  await context.close();
});
