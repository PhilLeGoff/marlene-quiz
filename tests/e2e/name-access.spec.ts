import { test, expect, type APIRequestContext } from "@playwright/test";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
async function enter(ctx: APIRequestContext, role: string, nickname: string) {
  return ctx.post(`/api/game?as=${role}`, {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), action: "join", nickname },
  });
}
test("name-only access, concurrent duplicate names, reconnect and sign-out", async ({
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
  for (const role of ["admin", "marlene"]) {
    const page = await c.newPage();
    await page.goto(`/${role}`);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page
      .getByLabel("Ton petit nom")
      .fill(`${role} ${crypto.randomUUID().slice(0, 8)}`);
    await page
      .getByRole("button", {
        name:
          role === "admin" ? "Ouvrir les coulisses" : "Entrer dans mon royaume",
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Se déconnecter" }),
    ).toBeVisible();
    await page.close();
  }
  await Promise.all([a.close(), b.close(), c.close()]);
});
