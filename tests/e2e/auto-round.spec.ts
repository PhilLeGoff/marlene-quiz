import { test, expect } from "@playwright/test";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
const unique = (name: string) => `${name} ${crypto.randomUUID().slice(0, 4)}`;
test("a round closes and scores itself once every guest has answered", async ({
  browser,
}) => {
  const host = await browser.newContext();
  const post = async (data: Record<string, unknown>) => {
    const r = await host.request.post("/api/game?as=admin", {
      headers: { Origin: origin },
      data: { id: crypto.randomUUID(), ...data },
    });
    expect(r.status(), await r.text()).toBe(200);
  };
  await post({
    action: "join",
    nickname: unique("Hôte"),
    password: "admin-test-only",
  });
  let d = await (await host.request.get("/api/game?as=admin")).json();
  await post({ action: "reset", confirm: d.room });
  d = await (await host.request.get("/api/game?as=admin")).json();
  const ids: string[] = d.questions.map((q: { id: string }) => q.id);
  await post({
    action: "reorder",
    ids: ["q4", ...ids.filter((x) => x !== "q4")],
  });
  const phones = await Promise.all(
    ["Rapide", "Lente"].map(async (name) => {
      const page = await (
        await browser.newContext({ viewport: { width: 390, height: 844 } })
      ).newPage();
      await page.goto("/");
      await page.getByLabel("Ton petit nom").fill(unique(name));
      await page.getByRole("button", { name: /Rejoindre la fête/ }).click();
      await page.getByRole("button", { name: "Plus tard" }).click();
      return page;
    }),
  );
  const guests = (
    await (await host.request.get("/api/game?as=admin")).json()
  ).players.filter((x: { role?: string }) => !x.role || x.role === "guest");
  // Guests left signed in by other specs would (rightly) keep the round open.
  expect(guests, "needs a fresh test server").toHaveLength(2);
  await post({ action: "open" });
  const [right, wrong] = phones;
  for (const [page, answer] of [
    [right, "Son cheval"],
    [wrong, "Son chat"],
  ] as const) {
    // The phone polls for the new round, which can take a few seconds.
    await page.getByRole("button", { name: answer }).click({ timeout: 30000 });
    await page.getByRole("button", { name: /Valider mon choix/ }).click();
  }
  // No host click: the last answer closed the round and the points are already there.
  await expect(right.locator(".round-result")).toContainText("+1 point", {
    timeout: 30000,
  });
  await expect(wrong.locator(".round-result")).toContainText("-1 point", {
    timeout: 30000,
  });
  const live = await (await host.request.get("/api/game?as=admin")).json();
  expect(live.phase).toBe("reveal");
  for (const page of phones)
    await page.getByRole("button", { name: "Se déconnecter" }).click();
});
