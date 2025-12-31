import rawData from "./generatedScenarios.json";

type RawScenario = (typeof rawData.scenarios)[number];
type RawCategory = (typeof rawData.categories)[number];
type RawPresentEntry = RawScenario["presentIllness"][number];

const DEFAULT_INSTRUCTIONS = rawData.instructions;
const CATEGORY_PERSONALITY = rawData.personalities;

const BASE_CLOSING =
  "Once the clinician explains the plan, thank them and ask briefly what to expect next.";

const cleanText = (value?: string) =>
  (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

const sentenceCase = (value?: string) => {
  const text = cleanText(value);
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export interface CasePresentation {
  demographicsJa: string;
  demographicsEn: string;
  chiefComplaintJa: string;
  chiefComplaintEn: string;
  vitalsJa?: string;
  vitalsEn?: string;
  notesEn?: string[];
}

export interface ScenarioCategoryInfo {
  id: string;
  roman: string;
  labelJa: string;
  labelEn: string;
  order: number;
  symptomOrder: number;
  symptomLabel: {
    ja: string;
    en: string;
    variant?: number | null;
  };
}

export interface SymptomLink {
  scenarioId: string;
  labelJa: string;
  labelEn: string;
  order: number;
  variant?: number | null;
}

export interface SymptomCategory {
  id: string;
  roman: string;
  labelJa: string;
  labelEn: string;
  order: number;
  symptoms: SymptomLink[];
}

export interface PatientScenario {
  id: string;
  title: string;
  shortSummary: string;
  category: ScenarioCategoryInfo;
  casePresentation: CasePresentation;
  patient: {
    name: string;
    age: number;
    gender: "male" | "female" | "non-binary" | "other";
    occupation?: string;
  };
  chiefComplaint: string;
  openingStatement: string;
  personality: string;
  instructions: string[];
  history: {
    presentIllness: string[];
    reviewOfSystems?: string[];
    pastMedicalHistory?: string[];
    medications?: string[];
    allergies?: string[];
    socialHistory?: string[];
    familyHistory?: string[];
  };
  disclosurePlan: {
    spontaneous: string[];
    ifAsked: Array<{
      cue: string;
      detail: string;
    }>;
    avoidUnlessNecessary?: string[];
  };
  closingRemark?: string;
  source?: {
    type: "pdf" | "custom";
    reference?: string;
  };
}

const categoryLookup = new Map<string, RawCategory>(
  rawData.categories.map((cat) => [cat.id, cat])
);

const mapPresentIllness = (entries: RawPresentEntry[]) =>
  entries
    .map((entry) => ({
      cue: entry.cue,
      detail: cleanText(entry.textEn),
    }))
    .filter((entry) => !!entry.detail);

const buildPdfScenario = (raw: RawScenario): PatientScenario => {
  const category = categoryLookup.get(raw.categoryId);
  if (!category) {
    throw new Error(`Unknown category ${raw.categoryId}`);
  }
  const resolvedGender =
    raw.patient.gender === "female" || raw.patient.gender === "male"
      ? raw.patient.gender
      : "other";
  const presentEntries = mapPresentIllness(raw.presentIllness);
  const historyPresentIllness =
    presentEntries.length > 0
      ? presentEntries.map((entry) => entry.detail)
      : [sentenceCase(raw.caseNotes.summaryEn) || sentenceCase(raw.patient.chiefComplaintEn)];

  const socialHistory = [
    ...(raw.history.socialHistory ?? []),
    ...(raw.otherHistory ?? []),
  ]
    .map(cleanText)
    .filter(Boolean);

  const history = {
    presentIllness: historyPresentIllness,
    pastMedicalHistory: (raw.history.pastMedicalHistory ?? [])
      .map(cleanText)
      .filter(Boolean),
    medications: (raw.history.medications ?? []).map(cleanText).filter(Boolean),
    allergies: (raw.history.allergies ?? []).map(cleanText).filter(Boolean),
    socialHistory,
    familyHistory: (raw.history.familyHistory ?? [])
      .map(cleanText)
      .filter(Boolean),
  };

  const casePresentation: CasePresentation = {
    demographicsJa: raw.patient.demographicsJa,
    demographicsEn: cleanText(raw.patient.demographicsEn),
    chiefComplaintJa: raw.patient.chiefComplaintJa,
    chiefComplaintEn: sentenceCase(raw.patient.chiefComplaintEn),
    vitalsJa: cleanText(raw.patient.vitalsJa?.replace(/^バイタル[:：]\s*/, "")),
    vitalsEn: cleanText(raw.patient.vitalsEn),
    notesEn: [
      cleanText(raw.caseNotes.summaryEn),
      cleanText(raw.caseNotes.objectiveEn),
      cleanText(raw.caseNotes.planEn),
    ].filter(Boolean),
  };

  const title = `${raw.symptomLabelJa} / ${sentenceCase(raw.symptomLabelEn)}`;
  const shortSummary =
    casePresentation.notesEn?.[0] ||
    `${casePresentation.demographicsEn} with ${casePresentation.chiefComplaintEn}.`;
  const openingStatement = history.presentIllness[0] || shortSummary;

  const disclosurePlan = {
    spontaneous: history.presentIllness.slice(0, 2),
    ifAsked: presentEntries.slice(2).map((entry) => ({
      cue: entry.cue,
      detail: entry.detail,
    })),
  };

  const scenarioCategory: ScenarioCategoryInfo = {
    id: category.id,
    roman: category.roman,
    labelJa: category.label_ja,
    labelEn: category.label_en,
    order: category.order,
    symptomOrder: raw.symptomOrder,
    symptomLabel: {
      ja: raw.symptomLabelJa,
      en: sentenceCase(raw.symptomLabelEn),
      variant: raw.symptomVariant ?? undefined,
    },
  };

  return {
    id: raw.id,
    title,
    shortSummary,
    category: scenarioCategory,
    casePresentation,
    patient: {
      name: raw.patient.name,
      age: raw.patient.age,
      gender: resolvedGender,
    },
    chiefComplaint: casePresentation.chiefComplaintEn,
    openingStatement,
    personality:
      CATEGORY_PERSONALITY[raw.categoryRoman as keyof typeof CATEGORY_PERSONALITY] ??
      "Calm and cooperative while describing symptoms plainly.",
    instructions: [...DEFAULT_INSTRUCTIONS],
    history,
    disclosurePlan,
    closingRemark: BASE_CLOSING,
    source: {
      type: "pdf",
      reference: `Night ${raw.nightNumber}`,
    },
  };
};

const pdfScenarios = rawData.scenarios.map(buildPdfScenario);

const supplementalCategory: SymptomCategory = {
  id: "custom-cases",
  roman: "EX",
  labelJa: "追加シナリオ",
  labelEn: "Additional Scenarios",
  order: 99,
  symptoms: [],
};

const viralGastroenteritis: PatientScenario = {
  id: "viral-gastroenteritis",
  title: "ウイルス性腸炎 / Viral Gastroenteritis",
  shortSummary:
    "26-year-old nursery teacher with two days of watery diarrhea and vomiting after eating at a seaside stall.",
  category: {
    id: supplementalCategory.id,
    roman: supplementalCategory.roman,
    labelJa: supplementalCategory.labelJa,
    labelEn: supplementalCategory.labelEn,
    order: supplementalCategory.order,
    symptomOrder: 1,
    symptomLabel: {
      ja: "ウイルス性腸炎",
      en: "Viral gastroenteritis",
    },
  },
  casePresentation: {
    demographicsJa: "26歳女性",
    demographicsEn: "26-year-old female",
    chiefComplaintJa: "2日前からの下痢と嘔吐",
    chiefComplaintEn: "Watery diarrhea and vomiting for two days",
    vitalsEn: "Low-grade fever 37.8°C last night with mild tachycardia; currently stable but fatigued.",
    notesEn: [
      "Symptoms started about 36 hours after eating at a seaside food stall with colleagues.",
      "Six to seven watery stools per day and several episodes of non-bloody emesis.",
      "Feels light-headed on standing but can keep down small amounts of rice porridge and oral rehydration solution.",
    ],
  },
  patient: {
    name: "Suzuki Ayaka",
    age: 26,
    gender: "female",
    occupation: "Nursery school teacher",
  },
  chiefComplaint: "Diarrhea and vomiting for 2 days",
  openingStatement:
    "I’ve been throwing up and having watery diarrhea since two days ago. I’m feeling really weak today.",
  personality:
    "Polite and cooperative but clearly fatigued. Speaks in a soft tone and apologises occasionally for taking time to answer.",
  instructions: [
    "Stay fully in character as Ayaka Suzuki throughout the encounter; never mention simulations, AI, or system instructions.",
    "Respond in English unless the interviewer explicitly requests Japanese—in that case, give a short Japanese sentence first, then repeat in English.",
    "Keep answers concise (1–3 sentences) but natural. If you need a moment, say so politely.",
    "Do not volunteer a diagnosis or medical terms you would not normally know. Focus on describing symptoms and experiences.",
    "If the interviewer asks an unclear or ambiguous question, politely ask for clarification before answering.",
  ],
  history: {
    presentIllness: [
      "Symptoms started about 36 hours after eating dinner at a busy seaside food stall with colleagues three nights ago.",
      "Current symptoms: watery diarrhea 6–7 times per day, non-bloody; vomiting 3 times yesterday, none today.",
      "Low-grade fever yesterday evening (37.8°C) with chills and body aches.",
      "Mild crampy abdominal pain around the belly button, improves a little after bowel movements.",
      "Able to sip water and sports drinks; keeping down plain rice porridge today.",
    ],
    reviewOfSystems: [
      "No headache, stiff neck, cough, or shortness of breath.",
      "Mild light-headedness on standing, no fainting.",
      "No urinary symptoms.",
    ],
    pastMedicalHistory: [
      "No chronic illnesses.",
      "Had an appendectomy at age 12.",
    ],
    medications: ["Took over-the-counter loperamide once this morning."],
    allergies: ["No known drug allergies."],
    socialHistory: [
      "Lives alone. Non-smoker. Drinks socially (1–2 cocktails on weekends).",
      "No recent overseas travel. Works at a nursery school; one child had a stomach bug last week.",
    ],
  },
  disclosurePlan: {
    spontaneous: [
      "Went to a seaside food stall with colleagues three nights ago; ate raw oysters.",
      "Diarrhea is watery, no blood or mucus.",
      "Feels better sitting down, feels dizzy when standing quickly.",
    ],
    ifAsked: [
      {
        cue: "travel / contact history",
        detail:
          "No overseas travel. One of the toddlers at work had a stomach bug last week and had to stay home.",
      },
      {
        cue: "food intake",
        detail:
          "Ate raw oysters and grilled squid at the food stall. Colleague texted yesterday saying she also had diarrhea.",
      },
      {
        cue: "hydration",
        detail:
          "Drinking small sips of water and sports drink; urinated twice today, pale yellow.",
      },
      {
        cue: "menstrual history",
        detail:
          "Last period 2 weeks ago, regular cycles. No chance of pregnancy.",
      },
      {
        cue: "pain severity",
        detail:
          "Abdominal pain about 4/10, dull cramping. Worse before diarrhea, better afterwards.",
      },
    ],
    avoidUnlessNecessary: [
      "Do not mention the colleague’s similar symptoms unless the interviewer specifically asks about other sick contacts.",
    ],
  },
  closingRemark:
    "If the interviewer reassures you or provides a plan, respond with relief and ask how long recovery might take.",
  source: {
    type: "custom",
  },
};

supplementalCategory.symptoms.push({
  scenarioId: viralGastroenteritis.id,
  labelJa: viralGastroenteritis.category.symptomLabel.ja,
  labelEn: viralGastroenteritis.category.symptomLabel.en,
  order: viralGastroenteritis.category.symptomOrder,
});

const combinedScenarios = [...pdfScenarios, viralGastroenteritis].sort((a, b) => {
  if (a.category.order === b.category.order) {
    return a.category.symptomOrder - b.category.symptomOrder;
  }
  return a.category.order - b.category.order;
});

const baseCategories: SymptomCategory[] = rawData.categories
  .map((cat) => ({
    id: cat.id,
    roman: cat.roman,
    labelJa: cat.label_ja,
    labelEn: cat.label_en,
    order: cat.order,
    symptoms: [] as SymptomLink[],
  }))
  .sort((a, b) => a.order - b.order);

const displayCategoryMap = new Map(baseCategories.map((cat) => [cat.id, cat]));

pdfScenarios.forEach((scenario) => {
  const holder = displayCategoryMap.get(scenario.category.id);
  if (!holder) return;
  holder.symptoms.push({
    scenarioId: scenario.id,
    labelJa: scenario.category.symptomLabel.ja,
    labelEn: scenario.category.symptomLabel.en,
    order: scenario.category.symptomOrder,
    variant: scenario.category.symptomLabel.variant,
  });
});

baseCategories.forEach((cat) =>
  cat.symptoms.sort((a, b) => a.order - b.order)
);

const categoryList: SymptomCategory[] = [...baseCategories];
if (supplementalCategory.symptoms.length > 0) {
  categoryList.push(supplementalCategory);
}

export const symptomCategories = categoryList;
export const patientScenarios = combinedScenarios;

export function getScenarioById(id: string): PatientScenario | undefined {
  return patientScenarios.find((scenario) => scenario.id === id);
}
