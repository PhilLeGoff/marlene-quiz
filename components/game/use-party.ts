"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, Role, View } from "@/lib/game/types";
export function useParty(role: Role = "guest", room = "") {
  const [data, setData] = useState<View | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(true);
  const state = useRef<View | null>(null),
    pending = useRef(false);
  const endpoint = `/api/game?as=${role}${role === "present" ? `&present=1&room=${encodeURIComponent(room)}` : ""}`;
  const apply = useCallback((v: View) => {
    setData((old) => {
      if (old && old.version > v.version) return old;
      const raw = v as View & { strokesMode?: string };
      const next =
        raw.strokesMode === "append" && old?.roundId === v.roundId
          ? {
              ...v,
              strokes: [
                ...new Map(
                  [...(old?.strokes ?? []), ...v.strokes].map((s) => [s.id, s]),
                ).values(),
              ],
            }
          : v;
      state.current = next;
      return next;
    });
    setConnected(true);
    setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const cursor = state.current?.strokes.at(-1)?.id ?? "";
      const r = await fetch(
        endpoint +
          `&cursor=${encodeURIComponent(cursor)}&round=${encodeURIComponent(state.current?.roundId ?? "")}`,
        { cache: "no-store" },
      );
      const v = (await r.json()) as View & {
        error?: string;
        strokesMode?: string;
      };
      if (!r.ok) throw new Error(v.error);
      apply(v);
    } catch {
      setConnected(false);
      setLoading(false);
    } finally {
      pending.current = false;
    }
  }, [endpoint, apply]);
  useEffect(() => {
    void refresh();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped)
        timer = setTimeout(
          poll,
          state.current?.phase === "pictionary_live" ? 280 : 1600,
        );
    };
    timer = setTimeout(poll, 1000);
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [refresh]);
  useEffect(() => {
    if (!data?.realtime) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import("@supabase/supabase-js").then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(data.realtime!.url, data.realtime!.key, {
        auth: { persistSession: false },
      });
      const channel = client
        .channel("party-revisions")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "party_revisions" },
          () => void refresh(),
        )
        .subscribe();
      dispose = () => {
        void client.removeChannel(channel);
      };
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [data?.realtime?.url, data?.realtime?.key, refresh]);
  const command = useCallback(
    async (
      action: string,
      values: Record<string, unknown> = {},
      quiet = false,
    ): Promise<boolean> => {
      if (!quiet) setBusy(true);
      setError("");
      const body: Command = { id: crypto.randomUUID(), action, ...values };
      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const v = (await r.json()) as View & {
          error?: string;
          strokesMode?: string;
        };
        if (!r.ok) throw new Error(v.error);
        if (v.initialized) apply(v);
        else await refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Un petit couac. Réessaie.");
        return false;
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [endpoint, apply, refresh],
  );
  return { data, error, setError, loading, busy, connected, command, refresh };
}
export type PartyClient = ReturnType<typeof useParty>;
