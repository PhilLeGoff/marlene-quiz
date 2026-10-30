// Shared helpers for the browser specs. Every spec drives the same single party, one at a
// time, so each one resets it first and signs its guests out at the end.
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

// ── Guests join with a selfie (shared with the selfie specs) ──
// A landscape "camera" JPEG drawn in the page (never a real person), so the crop to a
// square is exercised too.
export async function selfieJpeg(page: Page) {
  const base64 = await page.evaluate(async () => {
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
  return Buffer.from(base64, "base64");
}

// The guest's own screen once past the selfie step: lobby or game.
export const guestScreen = (page: Page) =>
  page.locator(".guest-main").getByText(/^Salut /);

// From the selfie step: picks the generated photo, confirms it and waits for the game.
export async function takeSelfie(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "selfie.jpg",
    mimeType: "image/jpeg",
    buffer: await selfieJpeg(page),
  });
  await expect(page.getByAltText("Aperçu de ton selfie")).toBeVisible();
  await page.getByRole("button", { name: /C’est moi/ }).click();
  await expect(guestScreen(page)).toBeVisible({ timeout: 30000 });
}

// Joins as a guest from the home page and takes the (required) selfie. Returns once the
// guest is in the lobby or on the game screen. If a round is already open, the selfie
// step waits for it to close, so this returns on the question without a photo.
export async function joinWithSelfie(page: Page, nickname: string) {
  await page.goto("/");
  await page.getByLabel("Ton petit nom").fill(nickname);
  await page.getByRole("button", { name: /Rejoindre la fête/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  const step = page.locator('input[type="file"]');
  await expect(step.or(guestScreen(page)).first()).toBeAttached({
    timeout: 30000,
  });
  if (await step.count()) await takeSelfie(page);
}

export const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
export const ADMIN_PASSWORD = "admin-test-only";
// Marlène's VIP code: the only place the tests spell it out.
export const MARLENE_PIN = "1234";
// Phones poll the server every 1.6 s; give them room to catch up with the host.
export const PHONE = { timeout: 30_000 };
export const PHONE_SIZE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};
export const OPEN_PHASES = [
  "question_open",
  "drawing_open",
  "pictionary_live",
  "waiting_for_marlene_answer",
];
export const CLOSED_PHASES = [
  "submissions_closed",
  "drawing_submissions_closed",
];

export const unique = (name: string) =>
  `${name} ${crypto.randomUUID().slice(0, 5)}`;

export async function api(
  ctx: APIRequestContext,
  as: string,
  action: string,
  values: Record<string, unknown> = {},
  status = 200,
) {
  const r = await ctx.post(`/api/game?as=${as}`, {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action, ...values },
  });
  const data = await r.json();
  expect(r.status(), JSON.stringify(data)).toBe(status);
  return data;
}
export async function state(ctx: APIRequestContext, as = "admin") {
  return (await ctx.get(`/api/game?as=${as}`)).json();
}
// What the projector receives: no session, just the public view.
export async function projectorState(ctx: APIRequestContext) {
  return (await ctx.get("/api/game?present=1")).json();
}
// A round closes by itself once every signed-in guest has answered, and a round the server
// can mark is revealed as it closes; the host only steps in for what is left.
export async function closeAndReveal(host: APIRequestContext) {
  let live = await state(host);
  if (OPEN_PHASES.includes(live.phase))
    live = await api(host, "admin", "close");
  if (CLOSED_PHASES.includes(live.phase))
    live = await api(host, "admin", "reveal");
  return live;
}

export async function hostSignIn(page: Page, nickname = unique("Hôte")) {
  await page.goto("/admin");
  await page.getByLabel("Ton petit nom").fill(nickname);
  await page.getByLabel("Mot de passe administrateur").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ouvrir les coulisses" }).click();
  await expect(
    page.getByRole("heading", { name: "À toi de mener la danse." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inviter les copains" }),
  ).toBeVisible();
}
// A host session without a page, for specs that only need the host's API.
export async function hostContext(browser: Browser) {
  const host = await browser.newContext();
  await api(host.request, "admin", "join", {
    nickname: unique("Hôte"),
    password: ADMIN_PASSWORD,
  });
  return host;
}
export async function resetParty(host: APIRequestContext) {
  const d = await state(host);
  await api(host, "admin", "reset", { confirm: d.room });
  return state(host);
}

// Straight to /marlene, or the way she would at the party: typing her name on the home page.
export async function marleneSignIn(page: Page, byName?: string) {
  if (byName) {
    await page.goto("/");
    await page.getByLabel("Ton petit nom").fill(byName);
    await page.getByRole("button", { name: /Rejoindre la fête/ }).click();
    await expect(page).toHaveURL(/\/marlene\?reconnue=1$/);
    await expect(
      page.getByRole("heading", { name: "On t’a reconnue, Marlène !" }),
    ).toBeVisible();
  } else {
    await page.goto("/marlene");
    await expect(
      page.getByRole("heading", { name: "La reine est arrivée." }),
    ).toBeVisible();
  }
  await typePin(page, MARLENE_PIN, "Entrer dans mon royaume");
  await expect(
    page.getByRole("heading", { name: "Ce soir, c’est toi la reine." }),
  ).toBeVisible();
}
export async function marleneApiSignIn(ctx: APIRequestContext) {
  return api(ctx, "marlene", "join", { pin: MARLENE_PIN });
}
// Taps a code on the phone-style keypad, then the confirm arrow.
export async function typePin(page: Page, code: string, confirm: string) {
  const pad = page.getByRole("group", { name: "Clavier numérique" });
  for (const digit of code)
    await pad.getByRole("button", { name: digit, exact: true }).click();
  await pad.getByRole("button", { name: confirm }).click();
}

// Signed-in guests keep rounds from closing by themselves, so every spec signs its own out.
export async function signOut(page: Page) {
  const button = page.getByRole("button", { name: "Se déconnecter" });
  await button.click();
  await expect(button).toHaveCount(0, PHONE);
}
export async function signOutApi(ctx: APIRequestContext, as = "guest") {
  await ctx.post(`/api/game?as=${as}`, {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action: "logout" },
  });
}

export async function upload(
  ctx: APIRequestContext,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  const r = await ctx.post("/api/media", {
    headers: { Origin: origin },
    multipart: { file: { name, mimeType, buffer } },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()).url as string;
}
// One second of a generated 440 Hz tone: an authorized blind-test clip.
export function wav() {
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
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRfoAAAAASUVORK5CYII=",
  "base64",
);

// Draws one diagonal stroke on an editable canvas with the mouse (pointer events).
export async function scribble(page: Page) {
  const surface = page.locator(".drawing-surface:not(.readonly) svg");
  await expect(surface).toBeVisible();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
    steps: 12,
  });
  await page.mouse.up();
}
