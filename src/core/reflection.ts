import type { QuestionInfo, QuestionSnapshot } from "./types";

export const QB_REFLECTION_STORAGE_KEY = "qb_support_reflections_v1";
export const QB_REFLECTION_IMAGE_STORAGE_PREFIX = "qb_support_reflection_images_v1:";
export const QB_REFLECTION_PDF_ID = "Vital_Step2CK";
export const QB_REFLECTION_SCHEMA_VERSION = 1;
export const QB_REFLECTION_CACHE_MAX_ENTRIES = 1000;

export interface QBReflectionRecord {
  schemaVersion: 1;
  source: "QB_support";
  questionId: string;
  questionCode: string | null;
  questionUrl: string;
  questionText: string | null;
  optionTexts: string[];
  pageRef: string | null;
  tags: string[];
  reflection: string;
  pdfId: typeof QB_REFLECTION_PDF_ID;
  pdfRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export type QBReflectionStore = Record<string, QBReflectionRecord>;

export interface QBReflectionImageRecord {
  schemaVersion: 1;
  source: "QB_support";
  questionId: string;
  questionCode: string | null;
  imageName: string;
  mimeType: "image/png";
  imageDataUrl: string;
  byteLength: number;
  sha256: string;
  createdAt: string;
}

export type QBReflectionImageStore = Record<string, QBReflectionImageRecord>;

export function getReflectionImageStorageKey(questionId: string): string {
  return `${QB_REFLECTION_IMAGE_STORAGE_PREFIX}${questionId}`;
}

export function getReflectionQuestionId(url: string, fallbackId?: string | null): string {
  try {
    const parsed = new URL(url);
    const questionId = parsed.searchParams.get("question_id")?.trim();
    if (questionId) return questionId;
  } catch {
    // Use the visible question code when the URL is unavailable.
  }
  return String(fallbackId ?? "").trim();
}

export function getCanonicalQuestionUrl(url: string, questionId: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    if (questionId) parsed.searchParams.set("question_id", questionId);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function buildReflectionRecord(input: {
  questionId: string;
  url: string;
  reflection: string;
  info: QuestionInfo | null;
  snapshot: QuestionSnapshot | null;
  existing?: QBReflectionRecord;
  now?: string;
}): QBReflectionRecord {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: QB_REFLECTION_SCHEMA_VERSION,
    source: "QB_support",
    questionId: input.questionId,
    questionCode: input.info?.id ?? input.snapshot?.id ?? input.existing?.questionCode ?? null,
    questionUrl: getCanonicalQuestionUrl(input.url, input.questionId),
    questionText: input.snapshot?.questionText ?? input.existing?.questionText ?? null,
    optionTexts: input.snapshot?.optionTexts ?? input.existing?.optionTexts ?? [],
    pageRef: input.info?.pageRef ?? input.snapshot?.pageRef ?? input.existing?.pageRef ?? null,
    tags: input.info?.tags ?? input.snapshot?.tags ?? input.existing?.tags ?? [],
    reflection: input.reflection,
    pdfId: QB_REFLECTION_PDF_ID,
    pdfRefs: input.existing?.pdfRefs ?? [],
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function pruneReflectionStore(
  store: QBReflectionStore,
  maxEntries = QB_REFLECTION_CACHE_MAX_ENTRIES
): QBReflectionStore {
  const entries = Object.entries(store);
  if (entries.length <= maxEntries) return store;
  entries.sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt));
  return Object.fromEntries(entries.slice(0, maxEntries));
}
