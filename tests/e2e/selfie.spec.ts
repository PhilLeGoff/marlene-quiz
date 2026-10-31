import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type Page,
} from "@playwright/test";
import { joinWithSelfie, selfieJpeg, takeSelfie } from "./helpers";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
// The same one-pixel authorized fixture as the media upload test.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRfoAAAAASUVORK5CYII=",
  "base64",
);
async function status(response: Promise<APIResponse>) {
  const r = await response;
  return `${r.status()} ${r.ok() ? "" : await r.text()}`.trim();
}
const unique = (name: string) => `${name} ${crypto.randomUUID().slice(0, 6)}`;
async function join(ctx: APIRequestContext, as: string, nickname: string) {
  const r = await ctx.post(`/api/game?as=${as}`, {
    headers: { Origin: origin },
    data: {
      id: crypto.randomUUID(),
      action: "join",
      nickname,
      ...(as === "admin" ? { password: "admin-test-only" } : {}),
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).playerId as string;
}
const upload = (ctx: APIRequestContext, data: Buffer, type = "image/png") =>
  ctx.post("/api/avatar", {
    headers: { Origin: origin, "Content-Type": type },
    data,
  });
const remove = (ctx: APIRequestContext, query = "") =>
  ctx.delete(`/api/avatar${query}`, { headers: { Origin: origin } });
async function photoOf(ctx: APIRequestContext, playerId: string) {
  const d = await (await ctx.get("/api/game")).json();
  return d.players.find((p: { id: string }) => p.id === playerId)?.photo as
    string | undefined;
}
// Earlier specs may leave the game finished; the lobby is where guests see each other.
async function backToLobby(browser: Browser) {
  const host = await browser.newContext();
  await join(host.request, "admin", unique("Hôte selfie"));
  const room = (await (await host.request.get("/api/game?as=admin")).json())
    .room;
  const r = await host.request.post("/api/game?as=admin", {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action: "reset", confirm: room },
  });
  expect(r.status(), await r.text()).toBe(200);
  return { host, room: room as string };
}
test("avatar uploads are typed, owned, served only as selfies and removable by the host", async ({
  browser,
}) => {
  const { host, room } = await backToLobby(browser);
  const a = await browser.newContext(),
    b = await browser.newContext(),
    anon = await browser.newContext();
  const aId = await join(a.request, "guest", unique("Selfie A"));
  await join(b.request, "guest", unique("Selfie B"));

  expect(await status(a.request.post("/api/avatar", { data: png }))).toMatch(
    /^403/,
  );
  expect(await status(upload(anon.request, png))).toMatch(/^401/);
  expect(await status(upload(a.request, png, "text/html"))).toMatch(/^415/);
  expect(
    await status(upload(a.request, Buffer.from("<svg onload=alert(1)>"))),
  ).toMatch(/^400/);
  expect(
    await status(
      a.request.post("/api/game", {
        headers: { Origin: origin },
        data: { id: crypto.randomUUID(), action: "photo", photo: aId },
      }),
    ),
  ).toMatch(/^400/);

  const first = await upload(a.request, png);
  expect(first.status(), await first.text()).toBe(200);
  const photo = (await first.json()).photo as string;
  expect(await photoOf(a.request, aId)).toBe(photo);
  const own = await a.request.get(`/api/avatar?id=${photo}`);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/png");
  expect(Buffer.compare(await own.body(), png)).toBe(0);
  expect(await status(anon.request.get(`/api/avatar?id=${photo}`))).toMatch(
    /^401/,
  );
  expect(
    await status(anon.request.get(`/api/avatar?id=${photo}&room=${room}`)),
  ).toBe("200");
  expect(
    await status(a.request.get(`/api/avatar?id=${crypto.randomUUID()}`)),
  ).toMatch(/^404/);

  const second = (await (await upload(a.request, png)).json()).photo;
  expect(second).not.toBe(photo);
  expect(await status(a.request.get(`/api/avatar?id=${photo}`))).toMatch(
    /^404/,
  );

  // A guest's DELETE only ever targets their own photo.
  expect(await status(remove(b.request, `?playerId=${aId}`))).toBe("200");
  expect(await photoOf(a.request, aId)).toBe(second);
  expect(await status(remove(host.request, `?as=admin&playerId=${aId}`))).toBe(
    "200",
  );
  expect(await photoOf(a.request, aId)).toBeUndefined();
  expect(await status(a.request.get(`/api/avatar?id=${second}`))).toMatch(
    /^404/,
  );
});
const PHONE = { viewport: { width: 390, height: 844 } };
const required = (page: Page) =>
  page.getByRole("heading", { name: "Un selfie, et tu entres !" });
async function hostAction(
  ctx: APIRequestContext,
  action: string,
  values: Record<string, unknown> = {},
) {
  const r = await ctx.post("/api/game?as=admin", {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action, ...values },
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
test("a guest can't reach the game until their selfie is uploaded, and it shows on every screen", async ({
  browser,
}) => {
  await backToLobby(browser);
  const name = unique("Photogénique");
  const phone = await (await browser.newContext(PHONE)).newPage();
  await phone.goto("/");
  await expect(phone.getByLabel("Choisis ton avatar")).toHaveCount(0);
  await phone.getByLabel("Ton petit nom").fill(name);
  await phone.getByRole("button", { name: /Rejoindre la fête/ }).click();
  await expect(phone).toHaveURL(/\/play$/);
  await expect(required(phone)).toBeVisible();
  // No skip and no way back: even a reload lands on the step again.
  await expect(
    phone.getByRole("button", { name: /Plus tard|Retour à la fête/ }),
  ).toHaveCount(0);
  await phone.reload();
  await expect(required(phone)).toBeVisible();
  await expect(phone.getByText("Tu es sur la liste !")).toHaveCount(0);

  // A failed upload says why and can be retried with the same photo.
  let failures = 1;
  await phone.route("**/api/avatar", (route) =>
    route.request().method() === "POST" && failures-- > 0
      ? route.fulfill({
          status: 500,
          json: { error: "La photo n’a pas pu être enregistrée." },
        })
      : route.fallback(),
  );
  await phone.locator('input[type="file"]').setInputFiles({
    name: "selfie.jpg",
    mimeType: "image/jpeg",
    buffer: await selfieJpeg(phone),
  });
  const preview = phone.getByAltText("Aperçu de ton selfie");
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((img: HTMLImageElement) => [
        img.naturalWidth,
        img.naturalHeight,
      ]),
    )
    .toEqual([512, 512]);
  await phone.getByRole("button", { name: /C’est moi/ }).click();
  await expect(phone.locator(".selfie-step").getByRole("alert")).toHaveText(
    "La photo n’a pas pu être enregistrée.",
  );
  await expect(required(phone)).toBeVisible();
  await phone.getByRole("button", { name: /Réessayer/ }).click();
  await expect(phone.getByText("Tu es sur la liste !")).toBeVisible();

  const mine = phone
    .locator(".player-bubble", { hasText: name })
    .locator("img.avatar-photo");
  await expect(mine).toBeVisible();
  await expect
    .poll(() => mine.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // The photo can be changed, never removed by the guest.
  await expect(phone.getByRole("button", { name: /Retirer/ })).toHaveCount(0);
  await phone.getByRole("button", { name: "Changer ma photo" }).click();
  await expect(
    phone.getByRole("heading", { name: "On refait la photo ?" }),
  ).toBeVisible();
  await expect(phone.getByRole("button", { name: /Retirer/ })).toHaveCount(0);
  await phone.getByRole("button", { name: "Retour à la fête" }).click();
  await expect(phone.getByText("Tu es sur la liste !")).toBeVisible();

  const projector = await (await browser.newContext()).newPage();
  await projector.goto("/present");
  const onScreen = projector
    .locator(".player-bubble", { hasText: name })
    .locator("img.avatar-photo");
  await expect(onScreen).toBeVisible();
  await expect
    .poll(() => onScreen.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await phone.getByRole("button", { name: "Se déconnecter" }).click();
});
test("a late arrival answers the open round first, then takes the selfie", async ({
  browser,
}) => {
  const { host } = await backToLobby(browser);
  const ids = (
    await (await host.request.get("/api/game?as=admin")).json()
  ).questions.map((q: { id: string }) => q.id);
  await hostAction(host.request, "reorder", {
    ids: ["q4", ...ids.filter((x: string) => x !== "q4")],
  });
  // A guest who never answers keeps the round open after the late arrival's answer.
  const idle = await browser.newContext();
  await join(idle.request, "guest", unique("Distrait"));
  await hostAction(host.request, "open");
  const late = await (await browser.newContext(PHONE)).newPage();
  await joinWithSelfie(late, unique("Retardataire"));
  // Straight to the question: no photo yet, but no answering time lost either.
  await expect(late.getByRole("button", { name: "Son cheval" })).toBeVisible({
    timeout: 30000,
  });
  await expect(required(late)).toHaveCount(0);
  await late.getByRole("button", { name: "Son cheval" }).click();
  await late.getByRole("button", { name: /Valider mon choix/ }).click();
  await expect(
    late.getByRole("heading", { name: "C’est dans la boîte !" }),
  ).toBeVisible();
  const state = await host.request.get("/api/game?as=admin");
  expect(state.status(), await state.text()).toBe(200);
  const live = await state.json();
  if (live.phase === "question_open") await hostAction(host.request, "close");
  await expect(required(late)).toBeVisible({ timeout: 30000 });
  await takeSelfie(late);
  await late.getByRole("button", { name: "Se déconnecter" }).click();
  await idle.request.post("/api/game?as=guest", {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action: "logout" },
  });
});
test("when the host removes a selfie, the guest is sent back to the step", async ({
  browser,
}) => {
  const { host } = await backToLobby(browser);
  const name = unique("Recalée");
  const phone = await (await browser.newContext(PHONE)).newPage();
  await joinWithSelfie(phone, name);
  await expect(phone.getByText("Tu es sur la liste !")).toBeVisible();
  const admin = await host.newPage();
  await admin.goto("/admin");
  await admin.getByRole("tab", { name: "Les invités" }).click();
  const removeButton = admin.getByRole("button", {
    name: `Retirer la photo de ${name}`,
  });
  await removeButton.click();
  await expect(removeButton).toHaveCount(0);
  await expect(required(phone)).toBeVisible({ timeout: 30000 });
  await expect(
    phone.getByRole("button", { name: /Plus tard|Retour à la fête/ }),
  ).toHaveCount(0);
  await takeSelfie(phone);
  await expect(phone.getByText("Tu es sur la liste !")).toBeVisible();
  await phone.getByRole("button", { name: "Se déconnecter" }).click();
});
