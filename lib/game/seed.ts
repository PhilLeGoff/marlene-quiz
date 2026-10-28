import type { Party, Question, Secret } from "./types";
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
    ["Philippe", "Simone", "Gaspard", "Colette"],
    {
      generated: ["Gaspard", "Colette"],
      note: "Philippe et Simone sont fournis, sans clé confirmée. Gaspard et Colette sont des propositions générées et modifiables.",
    },
  ),
  q(
    2,
    "Dans quels pays Marlène a-t-elle vécu ?",
    "multi",
    ["France", "Canada", "Indonésie", "Australie"],
    {
      note: "Les quatre pays ont été fournis. Confirmer lesquels sont corrects.",
    },
  ),
  q(3, "Que s’est-il passé sur le balcon espagnol ?", "choice", [
    "Elle a fait pipi",
    "Elle a dormi toute la nuit dehors",
    "Elle a sauté du balcon en culotte",
    "Elle a vomi sur le tapis",
  ]),
  q(4, "Qui était Nutsy ?", "choice", [
    "Son chat",
    "Le chien de sa mère",
    "Son cheval",
    "Son doudou",
    "Son ex d’Australie",
    "La souris dans son placard",
    "L’écureuil dans le jardin de sa grand-mère",
  ]),
  q(5, "Quelle taille fait Marlène ?", "number", [], {
    unit: "cm",
    note: "Marlène renseigne sa taille en privé. Tolérance configurable.",
  }),
  ...["a", "b", "c"].map((id, i) => ({
    ...q(6, `Blind test 🎵 — ${i + 1}/3`, "blind", [], {
      confirmed: true,
      duration: 35,
      note: "Importer un extrait fourni légalement. Aucun enregistrement commercial inclus.",
    }),
    id: `q6${id}`,
  })),
  q(
    7,
    "Comment dort Marlène ?",
    "outfit",
    ["Chaussettes", "T-shirt", "Short"],
    {
      confirmed: true,
      note: "Combinaison fournie : chaussettes + short + t-shirt.",
    },
  ),
  q(8, "Quel est le code PIN de Marlène ?", "pin", [], {
    enabled: false,
    note: "BONUS : uniquement un code fictif créé pour le jeu. Jamais le code d’un appareil réel.",
    duration: 60,
  }),
  q(9, "Quel est le temps d’écran de Marlène ?", "number", [], {
    unit: "minutes / jour",
    note: "Période : moyenne quotidienne des 7 derniers jours. Modifiable avant la manche.",
  }),
  q(10, "Quel est le métier de rêve de Marlène ?", "choice", [
    "Orthophoniste",
    "Vétérinaire",
    "Prof de français",
    "Prof de plongée",
    "Proxénète",
    "Influenceuse",
    "Prof de ski",
  ]),
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
  q(13, "Quel est le plus gros red flag chez un mec pour Marlène ?", "choice", [
    "Garder ses cotons-tiges usagés dans une boîte",
    "Faire cuire ses pâtes dans du lait",
    "Ne pas payer le resto",
  ]),
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
export function createParty(
  room: string,
  credentials: Party["credentials"],
  now = Date.now(),
): Party {
  const secrets: Record<string, Secret> = {
    q7: { answers: ["Chaussettes", "T-shirt", "Short"] },
    q6a: { text: "Marlène", aliases: ["Noir Désir", "Noir Désir Marlène"] },
    q6b: {
      text: "L’altra dimensione",
      aliases: ["Måneskin", "L'altra dimensione", "Maneskin altra dimensione"],
    },
    q6c: { text: "120 BPM", aliases: ["Jive Me", "Jive Me 120 BPM"] },
  };
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
