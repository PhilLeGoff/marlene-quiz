import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
const joinUrl = `${origin}/`;
// The TV's polling of the party (GET /api/game?as=present&present=1&cursor=…).
const tvApi = (url: URL) =>
  url.pathname === "/api/game" && url.searchParams.get("as") === "present";
const TV = { width: 1920, height: 1080 },
  SMALL_TV = { width: 1280, height: 720 };
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
// The modules qrcode.react draws for the join address, rendered here in Node:
// if the TV draws the same ones, it encodes exactly that address.
function modulesFor(value: string) {
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value, marginSize: 4, level: "M" }),
  );
  return [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
}
async function expectJoinQr(page: Page) {
  const qr = page.locator(".tv-join-qr svg");
  await expect(qr).toBeVisible();
  await expect(qr.locator("title")).toHaveText(
    "Scanner pour rejoindre la fête",
  );
  expect(
    await qr
      .locator("path")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d"))),
  ).toEqual(modulesFor(joinUrl));
  // Readable from the sofa: at least a third of the screen height, and square.
  const box = (await qr.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.height).toBeGreaterThanOrEqual(viewport.height * 0.3);
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  // The address, for phones that won't scan.
  await expect(page.locator(".join-url strong")).toHaveText(
    new URL(origin).host,
  );
  await expect(page.locator(".join-url")).toBeInViewport({ ratio: 1 });
}
test("before the party exists, the TV already shows how to join", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: TV });
  const tv = await context.newPage();
  // A fresh database has no party yet: that is what the API answers until someone joins.
  await tv.route(tvApi, (route) =>
    route.fulfill({ json: { initialized: false } }),
  );
  await tv.goto("/present");
  await expect(
    tv.getByRole("heading", { name: "La fête se prépare…" }),
  ).toBeVisible();
  await expectJoinQr(tv);
  await tv.screenshot({ path: test.info().outputPath("tv-pre-party.png") });
  await tv.setViewportSize(SMALL_TV);
  await expectJoinQr(tv);
  await tv.screenshot({
    path: test.info().outputPath("tv-pre-party-720.png"),
  });
  await context.close();
});
test("in the lobby, the QR code and fifteen guests fit on the TV", async ({
  browser,
}) => {
  const host = await browser.newContext();
  await api(host.request, "admin", "join", {
    nickname: `Hôte QR ${crypto.randomUUID().slice(0, 4)}`,
    password: "admin-test-only",
  });
  const room = (await (await host.request.get("/api/game?as=admin")).json())
    .room as string;
  await api(host.request, "admin", "reset", { confirm: room });
  const tag = crypto.randomUUID().slice(0, 4);
  const names = [
    "Camille",
    "Jean-Michel",
    "Sophie",
    "Tonton Gégé",
    "Lulu",
    "Bernadette",
    "Max",
    "Inès",
    "Papy Jo",
    "Clémentine",
    "Rachid",
    "Nina",
    "Le cousin Paul",
    "Zoé",
    "Mamie Odette",
  ].map((n) => `${n} ${tag}`);
  for (const [i, nickname] of names.entries()) {
    const guest = await browser.newContext();
    await api(guest.request, "guest", "join", { nickname, avatar: i % 6 });
    await guest.close();
  }
  const context = await browser.newContext({ viewport: TV });
  const tv = await context.newPage();
  // Earlier specs leave their guests behind: show only this test's fifteen.
  await tv.route(tvApi, async (route) => {
    const response = await route.fetch();
    const view = await response.json();
    view.players = (view.players ?? []).filter((p: { nickname: string }) =>
      p.nickname.endsWith(` ${tag}`),
    );
    await route.fulfill({ response, json: view });
  });
  await tv.goto("/present");
  await expect(
    tv.getByRole("heading", { name: "Qui connaît vraiment Marlène ?" }),
  ).toBeVisible();
  await expect(tv.locator(".player-bubble")).toHaveCount(15);
  for (const viewport of [TV, SMALL_TV]) {
    await tv.setViewportSize(viewport);
    await expectJoinQr(tv);
    // Every guest is still on screen, under the QR code rather than pushed below the fold.
    const qr = (await tv.locator(".tv-join-qr").boundingBox())!;
    for (const bubble of await tv.locator(".player-bubble").all()) {
      await expect(bubble).toBeInViewport({ ratio: 1 });
      expect((await bubble.boundingBox())!.y).toBeGreaterThanOrEqual(
        qr.y + qr.height,
      );
    }
    await tv.screenshot({
      path: test.info().outputPath(`tv-lobby-${viewport.height}.png`),
    });
  }
  await context.close();
  await host.close();
});
