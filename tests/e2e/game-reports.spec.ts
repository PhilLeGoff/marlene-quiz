import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  PHONE_SIZE,
  api,
  closeAndReveal,
  hostSignIn,
  joinWithSelfie,
  marleneApiSignIn,
  origin,
  resetParty,
  signOutApi,
  state,
  unique,
} from "./helpers";

const stroke = {
  id: "report-stroke",
  color: "#392938",
  size: 8,
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.5, y: 0.6 },
    { x: 0.8, y: 0.3 },
  ],
};

test("a finished game is kept in the Archives after a new game wipes it", async ({
  browser,
}) => {
  test.setTimeout(6 * 60_000);
  const hostCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const hp = await hostCtx.newPage();
  await hostSignIn(hp);
  const host = hostCtx.request;
  const d = await resetParty(host);

  // Two rounds only: a quiz (q4) then the drawing contest (q17).
  const order = ["q4", "q17"];
  await api(host, "admin", "reorder", {
    ids: [
      ...order,
      ...d.questions
        .map((q: { id: string }) => q.id)
        .filter((id: string) => !order.includes(id)),
    ],
  });
  for (const q of d.questions)
    await api(host, "admin", "edit", {
      questionId: q.id,
      patch: { enabled: order.includes(q.id), duration: 600 },
    });
  await api(host, "admin", "private", {
    questionId: "q4",
    answers: ["Son cheval"],
  });
  await api(host, "admin", "private", {
    questionId: "q17",
    prompt: "Un gâteau d’anniversaire",
  });

  const names = [unique("Ginette"), unique("Marcel")];
  const phones = [];
  for (const name of names) {
    const phone = await (await browser.newContext(PHONE_SIZE)).newPage();
    await joinWithSelfie(phone, name);
    phones.push(phone);
  }
  const [ginette, marcel] = phones.map((p) => p.request);
  const selfies = (await state(host)).players
    .filter((p: { nickname: string }) => names.includes(p.nickname))
    .map((p: { photo: string }) => p.photo);
  expect(selfies).toHaveLength(2);
  const star = await browser.newContext();
  await marleneApiSignIn(star.request);

  // Round 1: Ginette is right, Marcel is wrong.
  await api(host, "admin", "open");
  await api(ginette, "guest", "submit", { value: ["Son cheval"] });
  await api(marcel, "guest", "submit", { value: ["Son chat"] });
  await closeAndReveal(host);
  await api(host, "admin", "next");

  // Round 2: both draw; Marlène picks Ginette's drawing.
  await api(host, "admin", "open");
  await api(ginette, "guest", "submit", { value: [stroke] });
  await api(marcel, "guest", "submit", { value: [stroke] });
  const voting = await closeAndReveal(host);
  expect(voting.phase).toBe("voting_open");
  const players = (await state(host)).players as {
    id: string;
    nickname: string;
  }[];
  const ginetteId = players.find((p) => p.nickname === names[0])!.id;
  const drawing = voting.submissions.find(
    (s: { playerId: string }) => s.playerId === ginetteId,
  );
  await api(star.request, "marlene", "vote", { submissionId: drawing.id });
  const finished = await api(host, "admin", "next");
  expect(finished.phase).toBe("finished");

  // A new game from the host's screen wipes the party.
  await hp.getByRole("button", { name: "Recommencer" }).click();
  await hp.getByRole("button", { name: "Oui, recommencer" }).click();
  await expect.poll(async () => (await state(host)).phase).toBe("lobby");
  const after = await state(host);
  expect(after.players).toHaveLength(0);
  expect(after.submissionCount).toBe(0);
  // The old selfies are no longer served by the live party.
  for (const id of selfies) {
    expect((await host.get(`/api/avatar?id=${id}`)).status()).toBe(404);
    expect((await host.get(`/api/media?id=${id}`)).status()).toBe(404);
  }

  // The Archives keep the game, newest first.
  await hp.getByRole("tab", { name: "Archives" }).click();
  const row = hp.locator(".archives-table tbody tr").first();
  // Two guests and Marlène played.
  await expect(row.locator("td").nth(1)).toHaveText("3");
  await expect(row).toContainText(names[0]);
  await row.getByRole("button", { name: /Ouvrir/ }).click();
  const report = hp.frameLocator('iframe[title="Rapport de la partie"]');
  await expect(
    report.getByRole("heading", { name: "Le podium" }),
  ).toBeVisible();
  for (const name of names)
    await expect(report.getByText(name).first()).toBeVisible();
  await expect(report.locator("p.right")).toHaveText(
    "Bonne réponse : Son cheval",
  );
  await expect(
    report.locator("td.answer", { hasText: "Son chat" }),
  ).toHaveCount(1);
  await expect(
    report.getByText("Thème : Un gâteau d’anniversaire"),
  ).toBeVisible();
  await expect(
    report.getByText(`${names[0]} — Le coup de cœur de Marlène`),
  ).toBeVisible();
  await expect(report.locator("td.points", { hasText: "+1" })).toHaveCount(1);
  await expect(report.locator("td.points", { hasText: "-1" })).toHaveCount(1);
  await expect(report.locator("td.points", { hasText: "+5" })).toHaveCount(1);
  await expect(report.locator("svg.drawing path")).toHaveCount(2);
  await expect(
    report.locator('img.selfie[src^="data:image/"]').first(),
  ).toBeVisible();

  // « Télécharger » gives one self-contained HTML file.
  const [download] = await Promise.all([
    hp.waitForEvent("download"),
    hp.getByRole("link", { name: "Télécharger" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^quiz-marlene-.*\.html$/);
  const html = readFileSync((await download.path())!, "utf8");
  expect(html).toMatch(/^<!doctype html>/);
  for (const name of names) expect(html).toContain(name);
  expect(html).toContain("data:image/");
  expect(html).not.toMatch(/(src|href|url)\s*[=(]\s*["']?(https?:)?\/\//i);
  expect(html).not.toContain("/api/");

  // Host only: a guest, Marlène or the TV can't read a report.
  const [{ id }] = await (await host.get("/api/reports")).json();
  const guest = await (await browser.newContext()).newPage();
  await joinWithSelfie(guest, unique("Curieux"));
  for (const path of ["/api/reports", `/api/reports?id=${id}`]) {
    expect([401, 403]).toContain((await guest.request.get(path)).status());
    expect([401, 403]).toContain((await star.request.get(path)).status());
  }
  // Marlène signed in again (the reset signed her out) is refused too.
  await marleneApiSignIn(star.request);
  expect((await star.request.get(`/api/reports?id=${id}`)).status()).toBe(403);
  // The TV: the room code, no session.
  const tv = await browser.newContext();
  expect(
    (
      await tv.request.get(`${origin}/api/reports?id=${id}&room=${after.room}`)
    ).status(),
  ).toBe(401);
  await signOutApi(guest.request);
  await signOutApi(star.request, "marlene");
  // The lobby looks brand new.
  await expect(hp.getByRole("tab", { name: "Les invités" })).toBeVisible();
  expect((await state(host)).players).toHaveLength(0);
  // Later specs play the default rounds: switch them back on as they were.
  for (const q of d.questions)
    await api(host, "admin", "edit", {
      questionId: q.id,
      patch: { enabled: q.enabled, duration: q.duration },
    });
});
