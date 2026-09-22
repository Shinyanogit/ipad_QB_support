import type { QuestionInfo, QuestionSnapshot } from "./types";

const MOSHI_HOST = "moshi.medilink-study.com";
const MOSHI_REVIEW_PATH = "/kokushi/review/answer";

export type MoshiReflectionData = {
  questionId: string;
  legacyQuestionId: string | null;
  info: QuestionInfo;
  snapshot: QuestionSnapshot;
};

export type MoshiReflectionIdentity = {
  questionId: string;
  legacyQuestionId: string;
  displayNumber: string | null;
};

export function getLegacyMoshiReflectionImagePrefix(
  legacyQuestionId: string
): string | null {
  const match = legacyQuestionId.match(/^moshi:kokushi-mm(\d+):(\d+)$/);
  return match ? `QB_MM${match[1]}_${match[2]}_reflection_` : null;
}

export type MoshiLegacyContaminationSignals = {
  hasLegacyImageMarker: boolean;
  hasLegacyImageRecord: boolean;
  hasVerifiedLegacyText: boolean;
  duplicatesLegacyText: boolean;
  shouldSuppress: boolean;
};

export function detectMoshiLegacyContamination(input: {
  reflection: string;
  savedImageNames: string[];
  legacyReflection?: string | null;
  legacyImagePrefix?: string | null;
  verifiedReflectionFragments?: string[];
}): MoshiLegacyContaminationSignals {
  const legacyImagePrefix = input.legacyImagePrefix ?? null;
  const hasLegacyImageMarker = Boolean(
    legacyImagePrefix &&
      input.reflection.includes(`![[${legacyImagePrefix}`)
  );
  const hasLegacyImageRecord = Boolean(
    legacyImagePrefix &&
      input.savedImageNames.some((name) => name.startsWith(legacyImagePrefix))
  );
  const hasVerifiedLegacyText = Boolean(
    input.verifiedReflectionFragments?.some((fragment) =>
      input.reflection.includes(fragment)
    )
  );
  const duplicatesLegacyText = Boolean(
    input.reflection.trim() &&
      input.legacyReflection?.trim() &&
      input.reflection === input.legacyReflection
  );
  return {
    hasLegacyImageMarker,
    hasLegacyImageRecord,
    hasVerifiedLegacyText,
    duplicatesLegacyText,
    shouldSuppress:
      hasLegacyImageMarker ||
      hasLegacyImageRecord ||
      hasVerifiedLegacyText ||
      duplicatesLegacyText,
  };
}

export function isMoshiHost(url: string): boolean {
  try {
    return new URL(url).hostname === MOSHI_HOST;
  } catch {
    return false;
  }
}

export function isMoshiReviewPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === MOSHI_HOST && parsed.pathname === MOSHI_REVIEW_PATH;
  } catch {
    return false;
  }
}

export function extractMoshiReflectionData(
  doc: Document,
  url: string
): MoshiReflectionData | null {
  if (!isMoshiReviewPage(url)) return null;

  let rawQuestionId: string | null = null;
  try {
    rawQuestionId = new URL(url).searchParams.get("question_id")?.trim() ?? null;
  } catch {
    return null;
  }
  if (!rawQuestionId || !/^\d+$/.test(rawQuestionId)) return null;

  const root = doc.querySelector("#vue-container");
  if (!root) return null;

  const examNumber = extractExamNumber(doc);
  const questionNumber = normalizeText(root.querySelector(".h3label h3"));
  const identity = buildMoshiReflectionIdentity(
    examNumber,
    rawQuestionId,
    questionNumber
  );
  if (!identity) return null;
  const questionCode = `MM${examNumber}_${identity.displayNumber}`;
  const progressText = normalizeText(root.querySelector(".h2label h2"));
  const questionText = normalizeText(root.querySelector(".question"));
  const optionTexts = Array.from(
    root.querySelectorAll<HTMLElement>(".choice-table .checkAns")
  )
    .map((element) => normalizeText(element))
    .filter((value): value is string => Boolean(value));
  const imageUrls = Array.from(
    root.querySelectorAll<HTMLImageElement>(".question img, .choice-table img")
  )
    .map((image) => image.currentSrc || image.src)
    .filter(Boolean);
  const now = Date.now();

  return {
    questionId: identity.questionId,
    legacyQuestionId:
      identity.legacyQuestionId === identity.questionId
        ? null
        : identity.legacyQuestionId,
    info: {
      id: questionCode,
      progressText,
      pageRef: null,
      optionCount: optionTexts.length || null,
      tags: ["moshi", `kokushi-mm${examNumber}`],
      updatedAt: now,
    },
    snapshot: {
      id: questionCode,
      url,
      questionText,
      imageUrls,
      optionTexts,
      progressText,
      pageRef: null,
      tags: ["moshi", `kokushi-mm${examNumber}`],
      updatedAt: now,
    },
  };
}

export function buildMoshiReflectionIdentity(
  examNumber: string,
  rawQuestionId: string,
  questionNumber: string | null
): MoshiReflectionIdentity | null {
  const namespace = `moshi:kokushi-mm${examNumber}`;
  const displayNumber = normalizeMoshiQuestionNumber(questionNumber);
  if (!displayNumber) return null;
  return {
    questionId: `${namespace}:${displayNumber}`,
    legacyQuestionId: `${namespace}:${rawQuestionId}`,
    displayNumber,
  };
}

export function getMoshiReflectionPlacement(doc: Document): {
  parent: Node;
  before: Node | null;
} | null {
  const navigation = doc.querySelector<HTMLElement>(
    "#vue-container .qwrap section .btn-group"
  );
  if (navigation?.parentNode) {
    return { parent: navigation.parentNode, before: navigation };
  }
  const section = doc.querySelector<HTMLElement>("#vue-container .qwrap section");
  return section ? { parent: section, before: null } : null;
}

function extractExamNumber(doc: Document): string {
  const feedbackLinks = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href^='mailto:']")
  );
  for (const link of feedbackLinks) {
    const value = safeDecode(link.getAttribute("href") ?? "");
    const match = value.match(/第\s*(\d+)\s*回/);
    if (match) return match[1];
  }
  return "1";
}

function normalizeText(element: Element | null): string | null {
  const value = element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return value || null;
}

function normalizeMoshiQuestionNumber(value: string | null): string | null {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toUpperCase();
  return /^[A-Z]-\d+$/.test(normalized) ? normalized : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
