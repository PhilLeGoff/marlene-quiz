import { expect, type Page } from "@playwright/test";

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
