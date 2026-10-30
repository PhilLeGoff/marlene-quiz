import { CakeSlice, Crown, Sparkles } from "lucide-react";
export function Brand() {
  return (
    <a href="/" className="brand" aria-label="Marlène, accueil">
      <span className="brand-mark">
        <CakeSlice size={23} aria-hidden="true" />
      </span>
      marlène<span className="brand-dot">.</span>
      <span className="brand-caption">LA FÊTE DE MARLÈNE</span>
    </a>
  );
}
export function Avatar({
  index = 0,
  size = 42,
  photo,
}: {
  index?: number;
  size?: number;
  photo?: string;
}) {
  if (photo)
    return (
      // A same-origin selfie behind session checks; next/image would add nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar-photo"
        src={photo}
        width={size}
        height={size}
        // Tailwind's preflight sets `height: auto` on images, which would undo the square.
        style={{ width: size, height: size }}
        alt=""
        aria-hidden="true"
      />
    );
  const colors = [
    "#f7b1a4",
    "#d6c5ef",
    "#d0e5c4",
    "#ffe093",
    "#bcdce8",
    "#f3c2d5",
    "#d8d4fb",
    "#f6d2a3",
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="19" fill={colors[index % 8]} />
      <path
        d={index % 2 ? "M12 18Q24 2 36 18" : "M11 19Q12 5 24 8Q38 5 37 22"}
        fill="#49313d"
      />
      <ellipse cx="24" cy="26" rx="13" ry="14" fill="#fff2df" />
      <path
        d="M18 25v2m12-2v2"
        stroke="#49313d"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M20 32q4 4 8 0"
        fill="none"
        stroke="#49313d"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {index % 3 === 0 && <path d="M12 18l8-4 5 4 8-5 4 7" fill="#49313d" />}
      <circle cx="15" cy="30" r="2.5" fill="#f4aea5" />
      <circle cx="33" cy="30" r="2.5" fill="#f4aea5" />
    </svg>
  );
}
export function CakeArt() {
  return (
    <div className="cake-art" aria-hidden="true">
      <svg viewBox="0 0 440 330" className="cake-svg">
        <defs>
          <pattern
            id="icing"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="4" cy="4" r="1.5" fill="#f1bbaf" />
          </pattern>
        </defs>
        <path
          d="M42 180c-28-82 38-144 102-127 45-62 175-55 205 12 69-5 91 96 49 145-5 75-105 104-160 65-83 49-168 13-173-44z"
          fill="#eee1f2"
        />
        <ellipse
          cx="232"
          cy="278"
          rx="130"
          ry="16"
          fill="#d4bbd9"
          opacity=".5"
        />
        <ellipse
          cx="229"
          cy="267"
          rx="129"
          ry="18"
          fill="#fff9ef"
          stroke="#604552"
          strokeWidth="2.5"
        />
        <path
          d="M124 172v78c0 32 209 32 209 0v-78"
          fill="#f5a195"
          stroke="#604552"
          strokeWidth="2.5"
        />
        <ellipse
          cx="229"
          cy="173"
          rx="105"
          ry="29"
          fill="#fff3d6"
          stroke="#604552"
          strokeWidth="2.5"
        />
        <path
          d="M124 175v20q7 16 18 0v20q8 17 17 0v-15q9 14 18 1v25q10 18 21 0v-17q8 15 18 0v15q10 16 20 0v-13q10 15 20-2v13q11 15 18-2v-21q11 14 20-3v14q9 12 19-3v-14q13 3 20-12v-7"
          fill="#fff3d6"
          stroke="#604552"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M136 238q95 31 184 0"
          stroke="#e78079"
          strokeWidth="4"
          fill="none"
        />
        <path
          d="M168 165v-53h13v55m40-4v-59h13v60m40 3v-54h13v54"
          fill="#d4b0e8"
          stroke="#604552"
          strokeWidth="2.3"
        />
        <path
          d="M169 124l11-6m-11 21l11-6m42-16l11-6m-11 22l11-6m42-2l11-6m-11 21l11-6"
          stroke="#fff8ee"
          strokeWidth="4"
        />
        <path
          d="M174 105q-17-17 1-31 18 18-1 31m53-9q-17-17 1-31 18 18-1 31m53 10q-17-17 1-31 18 18-1 31"
          fill="#ffcc72"
          stroke="#604552"
          strokeWidth="2"
        />
        <path
          d="M191 242q5-8 10 0m55 0q5-8 10 0"
          fill="none"
          stroke="#604552"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M221 251q9 12 18 0"
          fill="#604552"
          stroke="#604552"
          strokeWidth="2"
        />
        <ellipse cx="187" cy="252" rx="7" ry="4" fill="#ed807f" />
        <ellipse cx="270" cy="252" rx="7" ry="4" fill="#ed807f" />
        <path
          d="M81 93l8 12 14-3-8 12 7 13-15-4-10 10 1-15-12-9 14-3z"
          fill="#ffdc83"
          stroke="#604552"
          strokeWidth="2"
        />
        <path
          d="M350 213l4 13 13 3-12 7 1 14-11-9-13 5 5-13-8-11 14 1z"
          fill="#ffdc83"
          stroke="#604552"
          strokeWidth="2"
        />
        <path
          d="M361 67q24 5 11 23m-304 98q-19-1-11 17m255-161 7-12m-191 8-5-12m233 139 16 3m-267 78-10 12"
          stroke="#af8fc5"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M318 94l8 9m-208 33-11 2m222-9 12-4"
          stroke="#ee8f81"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="73" cy="149" r="4" fill="#e99289" />
        <circle cx="316" cy="42" r="4" fill="#e99289" />
      </svg>
      <div className="cake-sticker">
        <Crown size={17} /> 100% MARLÈNE
      </div>
      <span className="cake-note">la reine de la soirée</span>
      <svg className="cake-arrow" viewBox="0 0 80 60">
        <path
          d="M4 5q4 47 60 37m-14-8 17 7-12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 41 + 3) % 100}%`,
            top: `${(i * 29 + 5) % 100}%`,
            transform: `rotate(${i * 37}deg)`,
            background: [
              "var(--coral)",
              "var(--lilac)",
              "var(--mint)",
              "var(--butter)",
            ][i % 4],
            borderRadius: i % 3 ? "2px" : "50%",
            width: i % 2 ? 6 : 9,
            height: i % 3 ? 14 : 9,
          }}
        />
      ))}
    </div>
  );
}
export function CrownBadge() {
  return (
    <span className="crown-badge">
      <Crown size={18} aria-hidden="true" /> La reine de la fête
    </span>
  );
}
export function EmptyParty({
  title = "Les confettis sont prêts.",
  text = "La suite arrive sur ton écran.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty-party">
      <div className="empty-icon">
        <Sparkles size={38} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
