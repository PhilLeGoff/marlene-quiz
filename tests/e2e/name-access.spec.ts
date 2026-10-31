import { test, expect, type APIRequestContext } from "@playwright/test";
import { MARLENE_PIN, signOutApi, typePin } from "./helpers";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
async function enter(ctx: APIRequestContext, role: string, nickname: string) {
  return ctx.post(`/api/game?as=${role}`, {
    headers: { Origin: origin },
    data: {
      id: crypto.randomUUID(),
      action: "join",
      nickname,
      ...(role === "admin" ? { password: "admin-test-only" } : {}),
    },
  });
}
test("guest/star name entry, protected admin, duplicate names, reconnect and sign-out", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext(),
    c = await browser.newContext();
  const name = `Élodie ${crypto.randomUUID().slice(0, 8)}`;
  const results = await Promise.all([
    enter(a.request, "guest", name),
    enter(b.request, "guest", name.toUpperCase()),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const owner = results[0].ok() ? a : b,
    other = results[0].ok() ? b : a;
  const first = await (await owner.request.get("/api/game")).json();
  expect((await enter(owner.request, "guest", name)).status()).toBe(200);
  expect((await (await owner.request.get("/api/game")).json()).playerId).toBe(
    first.playerId,
  );
  expect((await enter(c.request, "admin", name)).status()).toBe(409);
  await owner.request.post("/api/game", {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action: "logout" },
  });
  expect((await enter(other.request, "guest", name)).status()).toBe(200);
  const missing = await c.request.post("/api/game?as=admin", {
    headers: { Origin: origin },
    data: {
      id: crypto.randomUUID(),
      action: "join",
      nickname: "Sans mot de passe",
    },
  });
  expect(missing.status()).toBe(401);
  const wrong = await c.request.post("/api/game?as=admin", {
    headers: { Origin: origin },
    data: {
      id: crypto.randomUUID(),
      action: "join",
      nickname: "Mauvais mot de passe",
      password: "incorrect",
    },
  });
  expect(wrong.status()).toBe(401);
  // The host signs in with a name and the password; Marlène only with her PIN pad.
  const page = await c.newPage();
  await page.goto("/admin");
  await page.getByLabel("Mot de passe administrateur").fill("admin-test-only");
  await page
    .getByLabel("Ton petit nom")
    .fill(`admin ${crypto.randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Ouvrir les coulisses" }).click();
  await expect(
    page.getByRole("button", { name: "Se déconnecter" }),
  ).toBeVisible();
  await page.goto("/marlene");
  await expect(page.getByLabel("Ton petit nom")).toHaveCount(0);
  await expect(page.getByLabel("Mot de passe administrateur")).toHaveCount(0);
  await typePin(page, MARLENE_PIN, "Entrer dans mon royaume");
  await expect(
    page.getByRole("button", { name: "Se déconnecter" }),
  ).toBeVisible();
  await page.close();
  // Signed-in guests, Marlène included, would keep later specs' rounds from closing.
  await signOutApi(other.request);
  await signOutApi(c.request, "marlene");
  await Promise.all([a.close(), b.close(), c.close()]);
});
