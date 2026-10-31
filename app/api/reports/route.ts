// End-of-game reports, for the host only: the list (JSON), one report as a self-contained
// HTML page, or the same page as a download.
import { actor } from "@/lib/game/auth";
import { readParty } from "@/lib/game/store";
import { GameError } from "@/lib/game/engine";
import { listReports, readReport, reportMedia } from "@/lib/game/archive";
import { renderReportHtml } from "@/lib/game/report";
export const dynamic = "force-dynamic";
const base = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
function fail(e: unknown) {
  if (!(e instanceof GameError)) console.error("Report request failed", e);
  return Response.json(
    {
      error:
        e instanceof GameError ? e.message : "Le rapport n’a pas pu être lu.",
    },
    { status: e instanceof GameError ? e.status : 500, headers: base },
  );
}
async function requireHost(req: Request) {
  const current = await readParty();
  const p = current?.party;
  if (p && (await actor(req, p, "admin"))) return;
  const signedIn =
    p && ((await actor(req, p, "marlene")) ?? (await actor(req, p, "guest")));
  throw signedIn
    ? new GameError("Réservé à l’hôte.", 403)
    : new GameError("Connexion de l’hôte requise.", 401);
}
export async function GET(req: Request) {
  try {
    await requireHost(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json(await listReports(), { headers: base });
    if (!/^\d{1,16}-\d{1,9}$/.test(id))
      throw new GameError("Identifiant invalide.");
    const report = await readReport(id);
    if (!report) throw new GameError("Rapport introuvable.", 404);
    const html = renderReportHtml(report, await reportMedia(report));
    const day = new Date(report.startedAt).toISOString().slice(0, 10);
    return new Response(html, {
      headers: {
        ...base,
        "Content-Type": "text/html; charset=utf-8",
        // Everything is inline: no script, no request leaves the page.
        "Content-Security-Policy":
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
        ...(url.searchParams.get("download") === "1"
          ? {
              "Content-Disposition": `attachment; filename="quiz-marlene-${day}-partie-${report.generation}.html"`,
            }
          : {}),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
