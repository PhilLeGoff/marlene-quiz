import type { Party, Question, Secret } from "./types";
import { MARLENE_PIN } from "./vip";
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
  note: "Réponse à confirmer par Marlène ou l’hôte.",
  aliases: [],
  bonus: 5,
  attempts: 3,
  sensitive: false,
  media: [],
  clipStart: 0,
  clipEnd: 30,
  ...extra,
});
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
    note: "Marlène renseigne sa taille en privé. 5 points pile poil, un de moins par cm d’écart.",
    slider: { min: 140, max: 200, step: 1 },
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
    "Comment dort Marlène ?",
    "outfit",
    ["Chaussettes", "Pyjama intégral", "T-shirt", "Bonnet de nuit", "Short"],
    {
      confirmed: true,
      generated: ["Pyjama intégral", "Bonnet de nuit"],
      note: "Bonne combinaison fournie : chaussettes + short + t-shirt. Pyjama intégral et bonnet de nuit sont des propositions pièges modifiables.",
    },
  ),
  q(8, "Quel est le code PIN de Marlène ?", "pin", [], {
    confirmed: true,
    note: "BONUS : code de jeu à 6 chiffres, identique au code de l’espace VIP. Jamais le code d’un appareil réel.",
    duration: 60,
  }),
  q(9, "Quel est le temps d’écran de Marlène ?", "number", [], {
    unit: "minutes / jour",
    note: "Période : moyenne quotidienne des 7 derniers jours. Modifiable avant la manche.",
  }),
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
    sensitive: true,
    note: "Facultatif et privé. Consentement explicite de Marlène requis. Retrait et passage sans pénalité.",
    duration: 45,
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
    {
      note: "Les invités devinent. Marlène répond en privé. L’hôte valide les équivalences.",
    },
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
    note: "Marlène choisit un mot secret et dessine. Première bonne réponse : +5.",
  }),
  q(17, "Le concours de dessins de Marlène 🎨", "drawing", [], {
    duration: 120,
    note: "Marlène choisit le thème, puis vote anonymement. Un seul gagnant : +5.",
  }),
];
// Private, server-only answer keys from the user's notes; never sent before reveal.
export const suppliedAnswers: Record<string, Secret> = {
  q8: { text: MARLENE_PIN },
  q1: { answers: ["Philippe", "Simone"] },
  q2: { answers: ["France", "Canada", "Indonésie", "Australie"] },
  q3: { answers: ["Elle a fait pipi", "Elle a sauté du balcon en culotte"] },
  q4: { answers: ["Son cheval"] },
  q10: { answers: ["Prof de plongée"] },
  q13: { answers: ["Garder ses cotons-tiges usagés dans une boîte"] },
  q7: { answers: ["Chaussettes", "T-shirt", "Short"] },
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
const presetVersion = "party-notes-2026-10-29-confirmed-v2";
const presetIds = Object.keys(suppliedAnswers);
// Upgrade existing parties once, retaining uploads, timers, players, scores and admin edits.
// A currently running/revealed question is left untouched until the next round.
export function applySuppliedAnswers(original: Party): Party {
  let next = original;
  const active = original.questions[original.index]?.id;
  for (const id of presetIds) {
    const version = id === "q8" ? "vip-pin-2026-10-29-v1" : presetVersion;
    if (original.questionPresetVersions?.[id] === version) continue;
    if (
      id !== "q8" &&
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
      if (id === "q8") target.enabled = true;
      next.secrets[id] = structuredClone(suppliedAnswers[id]);
    } else {
      target.options = [...new Set([...target.options, ...source.generated])];
      target.generated = [
        ...new Set([...target.generated, ...source.generated]),
      ];
      if (!target.confirmed) target.note = source.note;
    }
    (next.questionPresetVersions ??= {})[id] = version;
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
      presetIds.map((id) => [
        id,
        id === "q8" ? "vip-pin-2026-10-29-v1" : presetVersion,
      ]),
    ),
    players: [],
    submissions: {},
    strokes: [],
    events: [],
    sessions: {},
    requests: [],
    credentials,
    consent: false,
    consentAt: 0,
    revealAllowed: false,
    audio: { playing: false, at: 0, offset: 0 },
    createdAt: now,
  };
}
