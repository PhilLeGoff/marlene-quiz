// Storage for end-of-game reports (table game_reports) and their archived media.
import { env } from "party-runtime";
import type { Party } from "./types";
import { getMedia, putMedia, sb, supabase } from "./store";
import {
  archiveKey,
  buildReport,
  summarize,
  type GameReport,
  type ReportMedia,
  type ReportStroke,
  type ReportSummary,
} from "./report";

type Row = { data: string | GameReport; archived: number | boolean };
const parse = (row: Row): GameReport =>
  typeof row.data === "string" ? JSON.parse(row.data) : row.data;

export async function readReport(id: string): Promise<GameReport | null> {
  if (supabase()) {
    const rows = (await (
      await sb(
        `/rest/v1/game_reports?id=eq.${encodeURIComponent(id)}&select=data,archived`,
      )
    ).json()) as Row[];
    return rows[0] ? parse(rows[0]) : null;
  }
  const row = await env.DB.prepare(
    "SELECT data,archived FROM game_reports WHERE id=?",
  )
    .bind(id)
    .first<Row>();
  return row ? parse(row) : null;
}

export async function listReports(): Promise<ReportSummary[]> {
  let rows: Row[];
  if (supabase())
    rows = (await (
      await sb(
        "/rest/v1/game_reports?select=data,archived&order=finished_at.desc",
      )
    ).json()) as Row[];
  else
    rows = (
      await env.DB.prepare(
        "SELECT data,archived FROM game_reports ORDER BY finished_at DESC",
      ).all<Row>()
    ).results;
  return rows.map((r) => summarize(parse(r)));
}

// Inserts or replaces the generation's report. A report already archived (its game wiped)
// is never replaced by a late, unarchived copy.
export async function saveReport(report: GameReport) {
  const row = {
    id: report.id,
    generation: report.generation,
    room: report.room,
    started_at: report.startedAt,
    finished_at: report.finishedAt,
    archived: report.archived,
  };
  if (supabase()) {
    if (!report.archived && (await readReport(report.id))?.archived) return;
    await sb("/rest/v1/game_reports?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ...row, data: report }),
    });
    return;
  }
  await env.DB.prepare(
    `INSERT INTO game_reports (id,generation,room,started_at,finished_at,archived,data) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET generation=excluded.generation,room=excluded.room,started_at=excluded.started_at,
     finished_at=excluded.finished_at,archived=excluded.archived,data=excluded.data
     WHERE game_reports.archived=0 OR excluded.archived=1`,
  )
    .bind(
      row.id,
      row.generation,
      row.room,
      row.started_at,
      row.finished_at,
      row.archived ? 1 : 0,
      JSON.stringify(report),
    )
    .run();
}

// The report of a game that just reached the podium. Its media stay where they are until the
// wipe archives them.
export async function reportFinished(p: Party) {
  if (p.phase !== "finished") return;
  const report = buildReport(p);
  if (report) await saveReport(report);
}

async function read(key: string) {
  try {
    const r = await getMedia(key);
    if (!r.ok) return null;
    return {
      bytes: await r.arrayBuffer(),
      type: r.headers.get("Content-Type") ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

// Media IDs a party's current generation points at: selfies and drawing-contest drawings.
export function partyMedia(p: Party) {
  return [
    ...p.players.map((x) => x.photo),
    ...Object.values(p.submissions).flatMap((subs) =>
      subs.map((s) => s.drawingId),
    ),
  ].filter((id): id is string => !!id);
}

// Called after a commit that wiped `before` (a reset, by the host or the hour-long timer):
// saves its report and copies its selfies and drawings under archive/<report id>/.
// Returns which live files may now go (archived) and which must stay (copy failed).
export async function archiveGeneration(
  before: Party,
): Promise<{ archived: string[]; kept: string[] }> {
  const all = partyMedia(before);
  try {
    const report = buildReport(before);
    if (!report) return { archived: [], kept: [] };
    const archived: string[] = [],
      kept: string[] = [];
    for (const m of report.media) {
      const target = archiveKey(report.id, m.id);
      if (await read(target)) {
        archived.push(m.id);
        continue;
      }
      const file = await read(m.id);
      if (!file) {
        kept.push(m.id);
        continue;
      }
      try {
        await putMedia(target, file.bytes, file.type);
        archived.push(m.id);
      } catch {
        kept.push(m.id);
      }
    }
    await saveReport({ ...report, archived: true });
    return { archived, kept };
  } catch (e) {
    // No report means nothing may be deleted: the files stay, unreferenced and private.
    console.error("Game report failed", e);
    return { archived: [], kept: all };
  }
}

// Selfies as data URIs and drawings as strokes, from the archive or, before the wipe, live.
export async function reportMedia(report: GameReport): Promise<ReportMedia> {
  const out: ReportMedia = new Map();
  for (const m of report.media) {
    // A file whose copy failed stays at its live key.
    const file =
      (await read(archiveKey(report.id, m.id))) ?? (await read(m.id));
    if (!file) continue;
    if (m.kind === "drawing") {
      try {
        const strokes = JSON.parse(new TextDecoder().decode(file.bytes));
        if (Array.isArray(strokes))
          out.set(m.id, { strokes: strokes as ReportStroke[] });
      } catch {}
    } else if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
      let binary = "";
      const bytes = new Uint8Array(file.bytes);
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      out.set(m.id, { dataUri: `data:${file.type};base64,${btoa(binary)}` });
    }
  }
  return out;
}
