/// <reference types="vite/client" />
"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
// Every image dropped in assets/marlene/ is picked up at build time, hashed and served by Vite.
const files = import.meta.glob(
  "/assets/marlene/*.{jpg,jpeg,png,webp,gif,avif,JPG,JPEG,PNG,WEBP,GIF,AVIF}",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
export const MARLENE_PHOTOS: readonly string[] = Object.keys(files)
  .sort()
  .map((path) => files[path]);
declare global {
  interface Window {
    // Lets the browser tests show generated placeholders instead of the folder's photos.
    __MARLENE_PHOTOS__?: string[];
  }
}
const noSubscribe = () => () => {};
/** The photos of the slideshow; empty when the folder is. */
export function useMarlenePhotos(): readonly string[] {
  return useSyncExternalStore(
    noSubscribe,
    () => window.__MARLENE_PHOTOS__ ?? MARLENE_PHOTOS,
    () => MARLENE_PHOTOS,
  );
}
const TILTS = [-6, 4, -3, 7, -5, 3, -8];
const CAPTIONS = [
  "Marlène, édition collector",
  "Archive top secrète",
  "La reine, au naturel",
  "Toujours la plus stylée",
  "Pièce à conviction",
  "Souvenir 100 % Marlène",
  "Icône depuis toujours",
  "Joyeux anniversaire !",
];
type Card = { key: number; src: string };
// Resolves once the image is in the cache, so the polaroid never drops in half-loaded.
function preload(src: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}
const prefersReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
/**
 * Polaroids of Marlène that drop in, drift and pile up while guests wait.
 * Purely decorative: hidden from assistive tech and never clickable.
 */
export function MarleneSlideshow({
  variant = "phone",
}: {
  variant?: "phone" | "tv" | "hero";
}) {
  const photos = useMarlenePhotos();
  // The last two cards: the one on top and the one it landed on.
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    if (!photos.length) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    // Every phone starts somewhere else in the album.
    let next = Math.floor(Math.random() * photos.length),
      key = Date.now();
    const delay = prefersReducedMotion() ? 9000 : 5200;
    const show = async () => {
      for (let tries = 0; tries < photos.length && !stopped; tries++) {
        const src = photos[next % photos.length];
        next++;
        if (await preload(src)) {
          if (stopped) return;
          setCards((old) => [...old.slice(-1), { key: key++, src }]);
          // Warm the cache for the following one while this one is on screen.
          void preload(photos[next % photos.length]);
          break;
        }
      }
      if (!stopped && photos.length > 1) timer = setTimeout(show, delay);
    };
    void show();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [photos]);
  if (!photos.length || !cards.length) return null;
  return (
    <div className={`marlene-photos ${variant}`} aria-hidden="true">
      <div className="mp-confetti">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      {cards.map((card, i) => (
        <div
          key={card.key}
          className={`mp-card ${i === cards.length - 1 ? "top" : "below"}`}
          style={
            {
              "--tilt": `${TILTS[card.key % TILTS.length]}deg`,
            } as React.CSSProperties
          }
        >
          <div className="mp-float">
            <span className="mp-tape" />
            <div
              className={`mp-photo ${card.key % 2 ? "zoom-left" : "zoom-right"}`}
            >
              {/* Decorative, already preloaded; next/image would add nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.src} alt="" draggable={false} />
            </div>
            <span className="mp-caption">
              {CAPTIONS[card.key % CAPTIONS.length]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
