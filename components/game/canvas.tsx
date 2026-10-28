"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, RotateCcw, Trash2 } from "lucide-react";
import type { Point, Stroke } from "@/lib/game/types";
export function StrokeView({ strokes }: { strokes: Stroke[] }) {
  return (
    <svg
      viewBox="0 0 1000 700"
      preserveAspectRatio="none"
      role="img"
      aria-label="Dessin de la manche"
    >
      {strokes.map((s) => (
        <path
          key={s.id}
          d={path(s.points)}
          fill="none"
          stroke={s.color}
          strokeWidth={s.size}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
function path(points: Point[]) {
  if (!points.length) return "";
  if (points.length === 1)
    return `M${points[0].x * 1000},${points[0].y * 700}l.1,.1`;
  return points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${(p.x * 1000).toFixed(1)},${(p.y * 700).toFixed(1)}`,
    )
    .join(" ");
}
export function DrawingCanvas({
  value,
  onChange,
  onStroke,
  onUndo,
  onClear,
  readOnly = false,
}: {
  value: Stroke[];
  onChange?: (v: Stroke[]) => void;
  onStroke?: (s: Stroke) => void;
  onUndo?: () => void;
  onClear?: () => void;
  readOnly?: boolean;
}) {
  const [color, setColor] = useState("#392938"),
    [size, setSize] = useState(6),
    [draft, setDraft] = useState<Stroke | null>(null);
  const svg = useRef<SVGSVGElement | null>(null),
    current = useRef<Stroke | null>(null),
    segment = useRef<Point[]>([]),
    lastSend = useRef(0),
    valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (readOnly) {
      current.current = null;
      setDraft(null);
    }
  }, [readOnly]);
  function point(e: React.PointerEvent): Point {
    const b = svg.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  }
  function send() {
    if (!onStroke || !current.current || !segment.current.length) return;
    onStroke({
      ...current.current,
      id: `${current.current.id}__${crypto.randomUUID()}`,
      points: [...segment.current],
    });
    segment.current = [segment.current[segment.current.length - 1]];
    lastSend.current = Date.now();
  }
  function down(e: React.PointerEvent) {
    if (readOnly || current.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    current.current = { id: crypto.randomUUID(), color, size, points: [p] };
    segment.current = [p];
    lastSend.current = Date.now();
    setDraft({ ...current.current });
  }
  function move(e: React.PointerEvent) {
    if (!current.current || readOnly) return;
    const raw = point(e);
    const p = {
        x: Math.round(raw.x * 10000) / 10000,
        y: Math.round(raw.y * 10000) / 10000,
      },
      last = current.current.points.at(-1)!;
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 0.002) return;
    if (current.current.points.length >= 2500) return;
    current.current.points.push(p);
    segment.current.push(p);
    setDraft({ ...current.current });
    if (Date.now() - lastSend.current > 180) send();
  }
  function up() {
    if (!current.current) return;
    send();
    onChange?.([...valueRef.current, current.current]);
    current.current = null;
    setDraft(null);
  }
  return (
    <div className="drawing-engine">
      {!readOnly && (
        <div className="drawing-toolbar" aria-label="Outils de dessin">
          {["#392938", "#e45b69", "#9674bd", "#4b8b74", "#e7a831"].map((c) => (
            <button
              type="button"
              className="color-button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Couleur ${({ "#392938": "noir", "#e45b69": "corail", "#9674bd": "lilas", "#4b8b74": "vert", "#e7a831": "jaune" } as Record<string, string>)[c]}`}
              aria-pressed={color === c}
            >
              <span style={{ background: c }} />
            </button>
          ))}
          <button
            type="button"
            className="icon-button"
            aria-pressed={color === "#ffffff"}
            onClick={() => setColor("#ffffff")}
            aria-label="Gomme"
          >
            <Eraser size={18} />
          </button>
          <select
            className="size-select"
            aria-label="Taille du pinceau"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          >
            <option value={4}>Fin</option>
            <option value={8}>Moyen</option>
            <option value={16}>Épais</option>
          </select>
          <button
            type="button"
            className="icon-button"
            aria-label="Annuler le dernier trait"
            onClick={() => {
              onUndo?.();
              onChange?.(value.slice(0, -1));
            }}
            disabled={!value.length}
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Effacer le dessin"
            onClick={() => {
              onClear?.();
              onChange?.([]);
            }}
            disabled={!value.length}
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}
      <div className={`drawing-surface ${readOnly ? "readonly" : ""}`}>
        <svg
          ref={svg}
          viewBox="0 0 1000 700"
          preserveAspectRatio="none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="img"
          aria-label={
            readOnly
              ? "Dessin de la manche"
              : "Zone de dessin tactile. Utilise ton doigt, ta souris ou un stylet."
          }
        >
          {[...value, ...(draft ? [draft] : [])].map((s) => (
            <path
              key={s.id}
              d={path(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.size}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

export function DrawingPreview({
  url,
  fallback = [],
}: {
  url?: string;
  fallback?: Stroke[];
}) {
  const [strokes, setStrokes] = useState<Stroke[]>(fallback);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) setStrokes((await r.json()) as Stroke[]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [url]);
  return <DrawingCanvas readOnly value={strokes} />;
}
