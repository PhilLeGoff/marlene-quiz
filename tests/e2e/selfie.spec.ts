import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Browser,
} from "@playwright/test";
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
test("guests take a selfie after their name, or skip it, and it shows on every screen", async ({
  browser,
}) => {
  await backToLobby(browser);
  const name = unique("Photogénique");
  const phone = await (await browser.newContext()).newPage();
  await phone.goto("/");
  await phone.getByLabel("Ton petit nom").fill(name);
  await phone.getByRole("button", { name: /Rejoindre la fête/ }).click();
  await expect(phone).toHaveURL(/\/play$/);
  await expect(
    phone.getByRole("heading", { name: "Un selfie pour la postérité ?" }),
  ).toBeVisible();
  // A landscape "camera" JPEG drawn in the page, so the crop to a square is exercised too.
  const camera = await phone.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#f87979";
    g.fillRect(0, 0, 640, 480);
    g.fillStyle = "#392938";
    g.beginPath();
    g.arc(320, 240, 120, 0, Math.PI * 2);
    g.fill();
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9),
    );
    let binary = "";
    for (const byte of new Uint8Array(await blob.arrayBuffer()))
      binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  await phone.locator('input[type="file"]').setInputFiles({
    name: "selfie.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(camera, "base64"),
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
  await expect(phone.getByText("Tu es sur la liste !")).toBeVisible();
  const mine = phone
    .locator(".player-bubble", { hasText: name })
    .locator("img.avatar-photo");
  await expect(mine).toBeVisible();
  await expect
    .poll(() => mine.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    phone.getByRole("button", { name: "Changer ma photo" }),
  ).toBeVisible();

  const shy = await (await browser.newContext()).newPage();
  await shy.goto("/");
  await shy.getByLabel("Ton petit nom").fill(unique("Timide"));
  await shy.getByRole("button", { name: /Rejoindre la fête/ }).click();
  await shy.getByRole("button", { name: "Plus tard" }).click();
  await expect(shy.getByText("Tu es sur la liste !")).toBeVisible();
  await shy.reload();
  await expect(shy.getByText("Tu es sur la liste !")).toBeVisible();
  await expect(
    shy.getByRole("button", { name: "Ajouter mon selfie" }),
  ).toBeVisible();

  const projector = await (await browser.newContext()).newPage();
  await projector.goto("/present");
  const onScreen = projector
    .locator(".player-bubble", { hasText: name })
    .locator("img.avatar-photo");
  await expect(onScreen).toBeVisible();
  await expect
    .poll(() => onScreen.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});
