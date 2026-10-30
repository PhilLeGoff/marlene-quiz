import { test, expect } from "@playwright/test";
import { joinWithSelfie, signOutApi } from "./helpers";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
test("guests answer Marlène’s height with a slider", async ({ browser }) => {
  const host = await browser.newContext();
  const post = (data: Record<string, unknown>) =>
    host.request.post("/api/game?as=admin", {
      headers: { Origin: origin },
      data: { id: crypto.randomUUID(), ...data },
    });
  expect(
    (
      await post({
        action: "join",
        nickname: "Hôte " + crypto.randomUUID().slice(0, 4),
        password: "admin-test-only",
      })
    ).status(),
  ).toBe(200);
  let d = await (await host.request.get("/api/game?as=admin")).json();
  expect((await post({ action: "reset", confirm: d.room })).status()).toBe(200);
  d = await (await host.request.get("/api/game?as=admin")).json();
  const ids = d.questions.map((q: { id: string }) => q.id);
  expect(
    (
      await post({
        action: "reorder",
        ids: ["q5", ...ids.filter((x: string) => x !== "q5")],
      })
    ).status(),
  ).toBe(200);
  const phoneCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const phone = await phoneCtx.newPage();
  await joinWithSelfie(phone, "Slider " + crypto.randomUUID().slice(0, 4));
  const r = await post({ action: "open" });
  expect(r.status(), await r.text()).toBe(200);
  const slider = phone.getByRole("slider", { name: /Ton estimation/ });
  await expect(slider).toBeVisible({ timeout: 30000 });
  await expect(slider).toHaveValue("170");
  await slider.focus();
  for (let i = 0; i < 4; i++) await phone.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("174");
  await expect(phone.getByText("174", { exact: false }).first()).toBeVisible();
  await phone.getByRole("button", { name: /Envoyer ma réponse/ }).click();
  const me = await (await phoneCtx.request.get("/api/game")).json();
  expect(me.mySubmission?.value).toBe(174);
  // A guest left signed in would keep later specs' rounds from closing by themselves.
  await signOutApi(phoneCtx.request);
});
