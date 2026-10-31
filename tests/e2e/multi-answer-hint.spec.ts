import { test, expect } from "@playwright/test";
import { joinWithSelfie } from "./helpers";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3105";
const unique = (name: string) => `${name} ${crypto.randomUUID().slice(0, 4)}`;
const hint = "Plusieurs réponses possibles";
test("multi-answer questions say so under the title, single-choice ones don't", async ({
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
    ids: ["q1", "q4", ...ids.filter((x) => x !== "q1" && x !== "q4")],
  });
  const phone = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await joinWithSelfie(phone, unique("Curieuse"));
  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto("/present");

  await post({ action: "open" });
  const multi = "Comment Marlène veut-elle appeler ses enfants ?";
  for (const page of [phone, tv]) {
    // Screens poll for the new round, which can take a few seconds.
    await expect(page.getByRole("heading", { name: multi })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator(".question-hint")).toHaveText(hint);
  }

  await post({ action: "close" });
  await post({ action: "next" });
  await post({ action: "open" });
  const single = "Qui était Nutsy ?";
  for (const page of [phone, tv]) {
    await expect(page.getByRole("heading", { name: single })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator(".question-hint")).toHaveCount(0);
  }
  // Rounds close themselves once every signed-in guest has answered; leave none behind.
  await phone.getByRole("button", { name: "Se déconnecter" }).click();
});
