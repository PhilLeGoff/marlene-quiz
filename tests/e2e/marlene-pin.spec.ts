import { test, expect, type Page } from "@playwright/test";
import { signOutApi } from "./helpers";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
const phone = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};
async function typeOnKeypad(page: Page, digits: string) {
  for (const digit of digits)
    await page.getByRole("button", { name: digit, exact: true }).click();
}
async function joinFromHome(page: Page, nickname: string) {
  await page.goto("/");
  await page.getByLabel("Ton petit nom").fill(nickname);
  await page.getByRole("button", { name: /Rejoindre la fête/ }).click();
}

test("typing marlene on the home page leads to her PIN pad, and 123456 opens her space", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await joinFromHome(page, "marlene");
  await expect(page).toHaveURL(/\/marlene\?reconnue=1$/);
  await expect(
    page.getByRole("heading", { name: "On t’a reconnue, Marlène !" }),
  ).toBeVisible();
  await expect(page.getByText("Entre ton code à 6 chiffres")).toBeVisible();
  await expect(page.locator(".phone-pin-boxes span")).toHaveCount(6);

  await typeOnKeypad(page, "12");
  await expect(page.getByText("2 chiffres sur 6")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("marlene-pin-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Effacer le dernier chiffre" })
    .click();
  await page
    .getByRole("button", { name: "Effacer le dernier chiffre" })
    .click();

  // The pad stops at six digits; a wrong code keeps her on it with the usual error.
  await typeOnKeypad(page, "987654");
  await expect(
    page.getByRole("button", { name: "5", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Entrer dans mon royaume" }).click();
  await expect(page.getByRole("alert")).toContainText("Code PIN incorrect");
  await expect(page.getByText("0 chiffre sur 6")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ce soir, c’est toi la reine." }),
  ).toHaveCount(0);

  await typeOnKeypad(page, "123456");
  await page.getByRole("button", { name: "Entrer dans mon royaume" }).click();
  await expect(
    page.getByRole("heading", { name: "Ce soir, c’est toi la reine." }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("marlene-signed-in-mobile.png"),
    fullPage: true,
  });
  const me = await (await context.request.get("/api/game?as=marlene")).json();
  expect(me.role).toBe("marlene");
  expect(me.vipPin).toBeUndefined();
  expect(JSON.stringify(me)).not.toContain('"123456"');
  // She plays like a guest: left signed in, she would keep later specs' rounds open.
  await signOutApi(context.request, "marlene");
  await context.close();
});

test("every spelling of her name is sent to the PIN pad, never to a guest seat", async ({
  browser,
}) => {
  for (const nickname of ["Marlène", "MARLENE", "  marlène  ", "Marlene !"]) {
    const context = await browser.newContext(phone);
    const page = await context.newPage();
    await joinFromHome(page, nickname);
    await expect(page, nickname).toHaveURL(/\/marlene\?reconnue=1$/);
    await expect(
      page.getByRole("button", { name: "Entrer dans mon royaume" }),
    ).toBeVisible();
    // Bypassing the page doesn't help: the server reserves the name too.
    const direct = await context.request.post("/api/game?as=guest", {
      headers: { Origin: origin },
      data: { id: crypto.randomUUID(), action: "join", nickname },
    });
    expect(direct.status(), nickname).toBe(409);
    expect((await direct.json()).error).toContain("réservé à Marlène");
    await context.close();
  }
  // Other names still join as guests.
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await joinFromHome(page, `Marlène Dupont ${crypto.randomUUID().slice(0, 4)}`);
  await expect(page).toHaveURL(/\/play$/);
  // A guest left signed in would keep later specs' rounds from closing by themselves.
  await signOutApi(context.request);
  await context.close();
});
