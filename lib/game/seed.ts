import type { Party, Question, Secret } from "./types";
import { MARLENE_PIN, isPin } from "./vip";
const q = (
  source: number,
  title: string,
  kind: Question["kind"],
  options: string[] = [],
  extra: Partial<Question> = {},
): Question => ({
  id: `q${source}`,
  source,
  title,
  kind,
  options,
  generated: [],
  enabled: true,
  confirmed: false,
  duration: 45,
  tolerance: 0,
  unit: "",
  note: "Réponse à confirmer par l’hôte.",
  aliases: [],
  bonus: 5,
  attempts: 3,
  media: [],
  clipStart: 0,
  clipEnd: 30,
  ...extra,
});
// Off by default: the host plays it, or skips it, depending on what Marlène wants.
const bodyCountNote =
  "Désactivée au départ. Active-la seulement si Marlène est d’accord, sinon passe-la.";
// Marlène answers these in the round like everyone; her answer is the key (see keyFromMarlene).
const heightNote =
  "La réponse de Marlène pendant la manche fait foi. 5 points pile poil, un de moins par cm d’écart.";
const dreamNote =
  "Les invités devinent. La réponse de Marlène pendant la manche fait foi. L’hôte valide les équivalences.";
// The host sets the Pictionary word and the drawing theme; Marlène draws and judges.
const pictionaryNote =
  "L’hôte choisit le mot secret, Marlène le dessine. Première bonne réponse : +5.";
const drawingNote =
  "L’hôte choisit le thème, Marlène vote anonymement. Un seul gagnant : +5.";
export const RUN_ID = "run5k";
export const seedQuestions: Question[] = [
  q(
    1,
    "Comment Marlène veut-elle appeler ses enfants ?",
    "multi",
    ["Simone", "Gaspard", "Philippe", "Colette"],
    {
      confirmed: true,
      generated: ["Gaspard", "Colette"],
      note: "Bonnes réponses fournies : Philippe et Simone. Gaspard et Colette sont des propositions pièges générées et modifiables.",
    },
  ),
  q(
    2,
    "Dans quels pays Marlène a-t-elle vécu ?",
    "multi",
    ["France", "Japon", "Canada", "Australie", "Portugal", "Indonésie"],
    {
      confirmed: true,
      generated: ["Japon", "Portugal"],
      note: "Bonnes réponses fournies : France, Canada, Indonésie et Australie. Japon et Portugal sont des propositions pièges générées et modifiables.",
    },
  ),
  q(
    3,
    "Que s’est-il passé sur le balcon espagnol ?",
    "multi",
    [
      "Elle a fait pipi",
      "Elle a dormi toute la nuit dehors",
      "Elle a sauté du balcon en culotte",
      "Elle a vomi sur le tapis",
    ],
    {
      confirmed: true,
      note: "Deux bonnes réponses fournies : elle a fait pipi et elle a sauté du balcon en culotte.",
    },
  ),
  q(
    4,
    "Qui était Nutsy ?",
    "choice",
    [
      "Son chat",
      "Le chien de sa mère",
      "Son cheval",
      "Son doudou",
      "Son ex d’Australie",
      "La souris dans son placard",
      "L’écureuil dans le jardin de sa grand-mère",
    ],
    { confirmed: true, note: "Bonne réponse fournie : son cheval." },
  ),
  q(5, "Quelle taille fait Marlène ?", "number", [], {
    unit: "cm",
    note: heightNote,
    slider: { min: 140, max: 200, step: 1 },
    keyFromMarlene: true,
  }),
  ...["a", "b", "c"].map((id, i) => ({
    ...q(
      6,
      `Blind test 🎵 — ${i + 1}/3`,
      "blind",
      [
        [
          "Jive Me — 120 BPM",
          "Noir Désir — Marlène",
          "Indochine — L’Aventurier",
          "Måneskin — L’altra dimensione",
        ],
        [
          "Noir Désir — Marlène",
          "Téléphone — Cendrillon",
          "Måneskin — L’altra dimensione",
          "Jive Me — 120 BPM",
        ],
        [
          "Louise Attaque — J’t’emmène au vent",
          "Måneskin — L’altra dimensione",
          "Jive Me — 120 BPM",
          "Noir Désir — Marlène",
        ],
      ][i],
      {
        confirmed: true,
        generated: [
          [
            "Jive Me — 120 BPM",
            "Indochine — L’Aventurier",
            "Måneskin — L’altra dimensione",
          ],
          [
            "Noir Désir — Marlène",
            "Téléphone — Cendrillon",
            "Jive Me — 120 BPM",
          ],
          [
            "Louise Attaque — J’t’emmène au vent",
            "Måneskin — L’altra dimensione",
            "Noir Désir — Marlène",
          ],
        ][i],
        duration: 35,
        note: "Importer un extrait fourni légalement. Aucun enregistrement commercial inclus.",
      },
    ),
    id: `q6${id}`,
  })),
  q(
    7,
    "Quel est l’élément incontournable de Marlène pour aller dormir ?",
    "choice",
    [
      "Son doudou",
      "Un masque de nuit",
      "Des chaussettes",
      "Un verre d’eau",
      "Des bouchons d’oreilles",
      "Un podcast de true crime",
    ],
    {
      confirmed: true,
      generated: [
        "Un masque de nuit",
        "Des bouchons d’oreilles",
        "Un podcast de true crime",
      ],
      note: "Bonne réponse fournie : des chaussettes. Masque de nuit, bouchons d’oreilles et podcast de true crime sont des propositions pièges générées et modifiables.",
    },
  ),
  {
    // Replaces the screen-time question, which had id q9: a new id so its key can't leak in.
    ...q(9, "Quel est le meilleur temps de Marlène sur 5 km ?", "number", [], {
      note: "La réponse de Marlène pendant la manche fait foi. 5 points pile poil, un de moins par minute d’écart.",
      slider: { min: 900, max: 3600, step: 15, format: "time", pointEvery: 60 },
      keyFromMarlene: true,
    }),
    id: RUN_ID,
  },
  q(
    10,
    "Quel est le métier de rêve de Marlène ?",
    "choice",
    [
      "Orthophoniste",
      "Vétérinaire",
      "Prof de français",
      "Prof de plongée",
      "Proxénète",
      "Influenceuse",
      "Prof de ski",
    ],
    { confirmed: true, note: "Bonne réponse fournie : prof de plongée." },
  ),
  q(11, "Body count ?", "reveal", [], {
    enabled: false,
    note: bodyCountNote,
    duration: 45,
    keyFromMarlene: true,
  }),
  q(12, "Retrouve les ex de Marlène 🐶", "photo", [], {
    enabled: false,
    note: "Importer uniquement des images autorisées. Aucune vraie photo ni aucun nom inclus. Associer les réponses aux images dans l’éditeur.",
  }),
  q(
    13,
    "Quel est le plus gros red flag chez un mec pour Marlène ?",
    "choice",
    [
      "Garder ses cotons-tiges usagés dans une boîte",
      "Faire cuire ses pâtes dans du lait",
      "Ne pas payer le resto",
      "Dire « comme même » avec beaucoup trop de conviction",
    ],
    {
      confirmed: true,
      generated: ["Dire « comme même » avec beaucoup trop de conviction"],
      note: "Bonne réponse fournie : garder ses cotons-tiges usagés dans une boîte. La quatrième proposition est un piège généré et modifiable.",
    },
  ),
  q(
    14,
    "Que ferait Marlène si elle gagnait 1 million d’euros ?",
    "reveal",
    [],
    { note: dreamNote, keyFromMarlene: true },
  ),
  q(
    15,
    "Quelle est la pire excuse que Marlène pourrait sortir pour annuler un rendez-vous ?",
    "creative",
    [],
    {
      note: "Marlène choisit sa préférée. Bonus créatif configurable ou 0 point.",
      duration: 60,
    },
  ),
  q(16, "Pictionary avec Marlène 🎨", "pictionary", [], {
    duration: 120,
    note: pictionaryNote,
  }),
  q(17, "Le concours de dessins de Marlène 🎨", "drawing", [], {
    duration: 120,
    note: drawingNote,
  }),
];
// Private, server-only answer keys from the user's notes; never sent before reveal.
export const suppliedAnswers: Record<string, Secret> = {
  q1: { answers: ["Philippe", "Simone"] },
  q2: { answers: ["France", "Canada", "Indonésie", "Australie"] },
  q3: { answers: ["Elle a fait pipi", "Elle a sauté du balcon en culotte"] },
  q4: { answers: ["Son cheval"] },
  q10: { answers: ["Prof de plongée"] },
  q13: { answers: ["Garder ses cotons-tiges usagés dans une boîte"] },
  q7: { answers: ["Des chaussettes"] },
  q6a: {
    answers: ["Noir Désir — Marlène"],
    text: "Marlène",
    aliases: ["Noir Désir", "Noir Désir Marlène"],
  },
  q6b: {
    answers: ["Måneskin — L’altra dimensione"],
    text: "L’altra dimensione",
    aliases: [
      "Måneskin",
      "L'altra dimensione",
      "Maneskin altra dimensione",
      "Måneskin L'altra dimensione",
      "L'altra dimesione",
    ],
  },
  q6c: {
    answers: ["Jive Me — 120 BPM"],
    text: "120 BPM",
    aliases: ["Jive Me", "Jive Me 120 BPM"],
  },
};
// Parties stored before the VIP code had its own field kept it as the answer to the
// former bonus question q8 "Quel est le code PIN de Marlène ?" (6 digits, default
// 123456). Move it to `vipPin`, then drop q8 as soon as it isn't being played.
// For a while the code had 4 digits (default 1234). A stored code that isn't 6 digits,
// that old default included, can't be typed on the 6-digit pad, so it becomes the
// default 123456; a 6-digit code the host chose is kept. Score events already awarded
// for q8 are kept.
function upgradeVipPin(original: Party): Party {
  const legacy = original.questions.findIndex((q) => q.id === "q8");
  const playing =
    legacy >= 0 &&
    legacy === original.index &&
    !["lobby", "next_round", "finished"].includes(original.phase);
  if (isPin(original.vipPin) && (legacy < 0 || playing)) return original;
  const next = structuredClone(original);
  if (!isPin(next.vipPin)) {
    const stored =
      next.vipPin === undefined ? original.secrets.q8?.text : undefined;
    next.vipPin = isPin(stored) ? stored : MARLENE_PIN;
  }
  if (legacy < 0 || playing) return next;
  next.questions.splice(legacy, 1);
  delete next.secrets.q8;
  delete next.questionPresetVersions?.q8;
  if (legacy < next.index) next.index--;
  else if (legacy === next.index) {
    // q8 was queued next: queue the following playable question instead, as "next" does.
    const following = next.questions.findIndex(
      (q, i) => i >= legacy && q.enabled,
    );
    if (next.phase === "next_round" && following >= 0) next.index = following;
    else {
      next.index = legacy - 1;
      if (next.phase === "next_round") next.phase = "finished";
    }
  }
  return next;
}
// The body count used to need Marlène's consent, which its note said. It is now a normal
// round the host turns on or skips; swap the old note so it doesn't tell the host otherwise.
// Stale `sensitive` / `consent` fields left in stored parties are never read.
const legacyBodyCountNote =
  "Facultatif et privé. Consentement explicite de Marlène requis. Retrait et passage sans pénalité.";
function upgradeBodyCountNote(original: Party): Party {
  const at = original.questions.findIndex(
    (q) => q.id === "q11" && q.note === legacyBodyCountNote,
  );
  if (at < 0) return original;
  const next = structuredClone(original);
  next.questions[at].note = bodyCountNote;
  return next;
}
const presetVersion = "party-notes-2026-10-29-confirmed-v2";
const presetIds = Object.keys(suppliedAnswers);
// Upgrade existing parties once, retaining uploads, timers, players, scores and admin edits.
// A currently running/revealed question is left untouched until the next round.
export function applySuppliedAnswers(stored: Party): Party {
  const original = upgradeBodyCountNote(upgradeVipPin(stored));
  let next = original;
  const active = original.questions[original.index]?.id;
  for (const id of presetIds) {
    if (original.questionPresetVersions?.[id] === presetVersion) continue;
    if (
      id === active &&
      !["lobby", "next_round", "finished"].includes(original.phase)
    )
      continue;
    const source = seedQuestions.find((q) => q.id === id);
    if (!source || !original.questions.some((q) => q.id === id)) continue;
    if (next === original) next = structuredClone(original);
    const target = next.questions.find((q) => q.id === id)!;
    if (suppliedAnswers[id]) {
      Object.assign(target, {
        title: source.title,
        kind: source.kind,
        options: [...source.options],
        generated: [...source.generated],
        note: source.note,
        confirmed: true,
      });
      next.secrets[id] = structuredClone(suppliedAnswers[id]);
    } else {
      target.options = [...new Set([...target.options, ...source.generated])];
      target.generated = [
        ...new Set([...target.generated, ...source.generated]),
      ];
      if (!target.confirmed) target.note = source.note;
    }
    (next.questionPresetVersions ??= {})[id] = presetVersion;
  }
  // Parties created before sliders existed answer the height by typing; give them the slider.
  for (const source of seedQuestions) {
    if (!source.slider) continue;
    const target = next.questions.find((q) => q.id === source.id);
    if (!target || target.slider || target.kind !== source.kind) continue;
    if (next === original) next = structuredClone(original);
    next.questions.find((q) => q.id === source.id)!.slider = {
      ...source.slider,
    };
  }
  return upgradeMarleneKeys(upgradeRunQuestion(upgradeSleepQuestion(next)));
}
// Marlène used to type the keys about herself (height, body count, the million, the 5 km) in her
// space, and the Pictionary word and drawing theme. She now answers those rounds in-game
// and her answer is the key; the host sets the word and the theme. Stored parties get the
// `keyFromMarlene` flag the seed has, unless the host already set it either way; keys
// already typed stay as the host's fallback. Notes still saying the old flow are swapped.
// A round being played is left alone until it's over.
const legacyNotes: Record<string, string> = {
  q5: "Marlène renseigne sa taille en privé. 5 points pile poil, un de moins par cm d’écart.",
  q14: "Les invités devinent. Marlène répond en privé. L’hôte valide les équivalences.",
  q16: "Marlène choisit un mot secret et dessine. Première bonne réponse : +5.",
  q17: "Marlène choisit le thème, puis vote anonymement. Un seul gagnant : +5.",
};
export function upgradeMarleneKeys(original: Party): Party {
  const playing = !["lobby", "next_round", "finished"].includes(original.phase)
    ? original.questions[original.index]?.id
    : undefined;
  let next = original;
  original.questions.forEach((stored, at) => {
    const source = seedQuestions.find((q) => q.id === stored.id);
    if (!source || stored.id === playing) return;
    const flag =
      !!source.keyFromMarlene &&
      stored.keyFromMarlene === undefined &&
      stored.kind === source.kind;
    const note = legacyNotes[stored.id] === stored.note;
    if (!flag && !note) return;
    if (next === original) next = structuredClone(original);
    if (flag) next.questions[at].keyFromMarlene = true;
    if (note) next.questions[at].note = source.note;
  });
  return next;
}
// q7 used to be the multi-select pyjama round "Comment dort Marlène ?". Parties seeded
// with it get the single-answer sleep question instead, as long as the host hasn't
// renamed it and the round hasn't been reached or scored yet.
const legacySleepTitle = "Comment dort Marlène ?";
function upgradeSleepQuestion(original: Party): Party {
  const at = original.questions.findIndex((q) => q.id === "q7");
  if (at < 0 || original.questions[at].title !== legacySleepTitle)
    return original;
  const reached =
    at < original.index ||
    (at === original.index &&
      !["lobby", "next_round"].includes(original.phase));
  // Scores from earlier generations (a reset, a rehearsal) don't count as playing it.
  const scored = original.events.some(
    (e) => e.questionId === "q7" && e.generation === original.generation,
  );
  if (reached || scored) return original;
  const source = seedQuestions.find((q) => q.id === "q7")!;
  const next = structuredClone(original);
  Object.assign(next.questions[at], {
    title: source.title,
    kind: source.kind,
    options: [...source.options],
    generated: [...source.generated],
    note: source.note,
    confirmed: true,
  });
  next.secrets.q7 = structuredClone(suppliedAnswers.q7);
  return next;
}
// q9 used to ask for Marlène's screen time. Stored parties get the 5 km time in its
// place, once, as long as q9 hasn't been reached or scored in the current generation
// (older generations are rehearsals before a reset). A party without q9 gets the new
// question after the sleep round, unless the host already deleted it after an upgrade.
const runVersion = "run-5k-2026-10-31-v1";
function upgradeRunQuestion(original: Party): Party {
  const at = original.questions.findIndex((q) => q.id === "q9");
  const has = original.questions.some((q) => q.id === RUN_ID);
  if (
    at < 0 &&
    (has || original.questionPresetVersions?.[RUN_ID] === runVersion)
  )
    return original;
  if (at >= 0) {
    const reached =
      at < original.index ||
      (at === original.index &&
        !["lobby", "next_round"].includes(original.phase));
    const scored = original.events.some(
      (e) => e.questionId === "q9" && e.generation === original.generation,
    );
    if (reached || scored) return original;
  }
  const next = structuredClone(original);
  const source = structuredClone(seedQuestions.find((q) => q.id === RUN_ID)!);
  if (at >= 0) {
    // Same slot, so `index` still points at the same round (or at this one, if queued).
    next.questions.splice(at, 1, ...(has ? [] : [source]));
    delete next.secrets.q9;
    delete next.questionPresetVersions?.q9;
  } else {
    const after = next.questions.findIndex((q) => q.id === "q7");
    const slot = after < 0 ? next.questions.length : after + 1;
    next.questions.splice(slot, 0, source);
    if (next.index >= slot) next.index++;
  }
  (next.questionPresetVersions ??= {})[RUN_ID] = runVersion;
  return next;
}
export function createParty(
  room: string,
  credentials: Party["credentials"],
  now = Date.now(),
): Party {
  const secrets = structuredClone(suppliedAnswers);
  return {
    room,
    phase: "lobby",
    index: -1,
    roundId: "",
    generation: 1,
    startedAt: 0,
    deadline: 0,
    questions: structuredClone(seedQuestions),
    secrets,
    questionPresetVersions: Object.fromEntries(
      presetIds.map((id) => [id, presetVersion]),
    ),
    players: [],
    submissions: {},
    strokes: [],
    events: [],
    sessions: {},
    requests: [],
    credentials,
    vipPin: MARLENE_PIN,
    revealAllowed: false,
    audio: { playing: false, at: 0, offset: 0 },
    createdAt: now,
  };
}
