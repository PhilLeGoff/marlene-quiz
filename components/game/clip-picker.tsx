"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Scissors } from "lucide-react";
import {
  CLIP_MAX,
  CLIP_MIN,
  clipProblem,
  formatClock,
  moveClipEdge,
  parseClock,
  type Clip,
} from "@/lib/game/clip";

type Edge = "start" | "end";
const BUCKETS = 360;

// Loudness of the song in BUCKETS slices, for the waveform. Decoding at 8 kHz
// keeps it light on a phone; if the browser can't, the timeline simply has no wave.
function usePeaks(src: string) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const buffer = await (await fetch(src)).arrayBuffer();
        const audio = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(
          buffer,
        );
        const data = audio.getChannelData(0);
        const size = Math.max(1, Math.floor(data.length / BUCKETS));
        const out: number[] = [];
        for (let i = 0; i < BUCKETS; i++) {
          let max = 0;
          for (let j = i * size; j < (i + 1) * size && j < data.length; j += 2)
            max = Math.max(max, Math.abs(data[j]));
          out.push(max);
        }
        const top = Math.max(...out) || 1;
        if (!gone) setPeaks(out.map((v) => v / top));
      } catch {
        // No waveform: dragging, buttons and the fields still work.
      }
    })();
    return () => {
      gone = true;
    };
  }, [src]);
  return peaks;
}

function ClockInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (seconds: number) => void;
}) {
  // While typing, the field shows the draft; otherwise it follows the section.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = parseClock(draft);
    setDraft(null);
    if (v !== null) onCommit(v);
  };
  return (
    <label>
      <span>
        {label} <small>(m:ss)</small>
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? formatClock(value)}
        aria-invalid={draft !== null && parseClock(draft) === null}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
    </label>
  );
}

/**
 * Lets the host choose, before the party, which section of the song plays
 * during the blind test: a timeline of the whole song with draggable start and
 * end handles, "Début ici" / "Fin ici" at the playhead, and a preview of the
 * section alone. Without a song yet, only the two time fields show.
 */
export function ClipPicker({
  src,
  clip,
  onChange,
  onDuration,
}: {
  src?: string;
  clip: Clip;
  onChange: (clip: Clip) => void;
  onDuration?: (seconds: number) => void;
}) {
  const [duration, setDuration] = useState(0);
  const problem = clipProblem(clip, duration || undefined);
  const fields = (
    <div className="form-grid">
      <ClockInput
        label="Début de l’extrait"
        value={clip.start}
        onCommit={(start) => onChange({ ...clip, start })}
      />
      <ClockInput
        label="Fin de l’extrait"
        value={clip.end}
        onCommit={(end) => onChange({ ...clip, end })}
      />
    </div>
  );
  return (
    <div className="clip-picker">
      <h3>
        <Scissors size={18} /> Le passage qui passera pendant la manche
      </h3>
      {src ? (
        <Timeline
          key={src}
          src={src}
          clip={clip}
          onChange={onChange}
          duration={duration}
          onDuration={(d) => {
            setDuration(d);
            onDuration?.(d);
          }}
        />
      ) : (
        <p className="small-text">
          Importe la chanson pour choisir l’extrait à l’oreille.
        </p>
      )}
      {fields}
      <p className={problem ? "error" : "small-text"} role="status">
        {problem ??
          `Extrait de ${String(Math.round((clip.end - clip.start) * 10) / 10).replace(".", ",")} s : entre ${CLIP_MIN} et ${CLIP_MAX} secondes, c’est parfait.`}
      </p>
    </div>
  );
}

function Timeline({
  src,
  clip,
  onChange,
  duration,
  onDuration,
}: {
  src: string;
  clip: Clip;
  onChange: (clip: Clip) => void;
  duration: number;
  onDuration: (seconds: number) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previewEnd = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [width, setWidth] = useState(0);
  const peaks = usePeaks(src);
  const ready = duration > 0;
  const pct = (t: number) =>
    `${ready ? (Math.min(t, duration) / duration) * 100 : 0}%`;

  // Follow the playhead smoothly while playing, and stop a preview at the section's end.
  useEffect(() => {
    const el = audio.current;
    if (!el || !playing) return;
    let frame = 0;
    const tick = () => {
      const end = previewEnd.current;
      if (end !== null && el.currentTime >= end) {
        el.pause();
        el.currentTime = end;
        previewEnd.current = null;
        setPreviewing(false);
      }
      setTime(el.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g || !peaks || !width || !ready) return;
    const dpr = window.devicePixelRatio || 1;
    const h = c.clientHeight;
    c.width = Math.round(width * dpr);
    c.height = Math.round(h * dpr);
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, h);
    const bar = width / peaks.length;
    peaks.forEach((p, i) => {
      const t = ((i + 0.5) / peaks.length) * duration;
      g.fillStyle = t >= clip.start && t <= clip.end ? "#392938" : "#b9a7b5";
      const v = Math.max(2, p * (h - 8));
      g.fillRect(i * bar, (h - v) / 2, Math.max(1, bar - 1), v);
    });
  }, [peaks, width, ready, duration, clip.start, clip.end]);

  const seek = (t: number) => {
    const el = audio.current;
    if (!el || !ready) return;
    el.currentTime = Math.min(Math.max(0, t), duration);
    setTime(el.currentTime);
  };
  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * duration;
  };
  const move = (edge: Edge, value: number) => {
    const next = moveClipEdge(clip, edge, value, duration);
    onChange(next);
    // Paused, the playhead follows the handle, so "Lecture" starts right there.
    if (audio.current?.paused) seek(next[edge]);
  };
  const stopPreview = () => {
    previewEnd.current = null;
    setPreviewing(false);
  };
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    stopPreview();
    if (el.paused) void el.play();
    else el.pause();
  };
  const preview = () => {
    const el = audio.current;
    if (!el) return;
    if (previewing) {
      el.pause();
      stopPreview();
      return;
    }
    el.currentTime = clip.start;
    setTime(clip.start);
    previewEnd.current = clip.end;
    setPreviewing(true);
    void el.play();
  };
  const handle = (edge: Edge) => {
    const value = clip[edge];
    const label = edge === "start" ? "Début de l’extrait" : "Fin de l’extrait";
    return (
      <div
        role="slider"
        tabIndex={ready ? 0 : -1}
        className={`clip-handle ${edge}`}
        style={{ left: pct(value) }}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={value}
        aria-valuetext={formatClock(value)}
        aria-disabled={!ready}
        onPointerDown={(e) => {
          if (!ready) return;
          e.stopPropagation();
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            move(edge, at(e.clientX));
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 5 : 1;
          const moves: Record<string, number> = {
            ArrowLeft: value - step,
            ArrowDown: value - step,
            ArrowRight: value + step,
            ArrowUp: value + step,
            PageDown: value - 5,
            PageUp: value + 5,
            Home: 0,
            End: duration,
          };
          if (!ready || !(e.key in moves)) return;
          e.preventDefault();
          move(edge, moves[e.key]);
        }}
      >
        <span aria-hidden>{edge === "start" ? "▶" : "◀"}</span>
      </div>
    );
  };
  return (
    <>
      <audio
        ref={audio}
        src={src}
        preload="auto"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) onDuration(d);
        }}
        onPlay={() => setPlaying(true)}
        onPause={(e) => {
          setPlaying(false);
          setTime(e.currentTarget.currentTime);
        }}
        onEnded={stopPreview}
        onSeeked={(e) => setTime(e.currentTarget.currentTime)}
      />
      <div
        className="clip-track"
        ref={track}
        data-ready={ready}
        onPointerDown={(e) => {
          if (ready) seek(at(e.clientX));
        }}
      >
        <canvas ref={canvas} className="clip-wave" aria-hidden />
        {!peaks && <div className="clip-flat" aria-hidden />}
        <div
          className="clip-range"
          style={{ left: pct(clip.start), width: pct(clip.end - clip.start) }}
          aria-hidden
        />
        <div
          className="clip-playhead"
          style={{ left: pct(time) }}
          aria-hidden
        />
        {handle("start")}
        {handle("end")}
      </div>
      <div className="clip-times small-text">
        <span>
          Tête de lecture <b data-testid="clip-time">{formatClock(time)}</b>
        </span>
        <span>
          {ready ? formatClock(duration) : "Chargement de la chanson…"}
        </span>
      </div>
      <div className="clip-buttons">
        <button
          type="button"
          className="btn small"
          onClick={toggle}
          disabled={!ready}
        >
          {playing && !previewing ? <Pause size={16} /> : <Play size={16} />}
          {playing && !previewing ? "Pause" : "Lecture"}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!ready}
          onClick={() => move("start", time)}
        >
          Début ici
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!ready}
          onClick={() => move("end", time)}
        >
          Fin ici
        </button>
        <button
          type="button"
          className="btn small lilac"
          disabled={!ready || !!clipProblem(clip, duration)}
          onClick={preview}
        >
          {previewing ? <Pause size={16} /> : <Play size={16} />}
          {previewing ? "Arrêter l’extrait" : "Écouter l’extrait"}
        </button>
      </div>
    </>
  );
}
