import type { QuestionInfo, QuestionSnapshot } from "./types";

const SELECTORS = {
  container: ".question-container",
  questionId: ".question-wrapper .header[qb='true'] span:first-child, .question-wrapper .header span:first-child",
  progress: ".question-nav__number",
  options: ".multiple-answer-options li, .single-answer-options li",
  footerRef: ".question-footer span",
  tagFirst: ".custom-icon-icon_first",
  tagCompulsory: ".custom-icon-icon_compulsory",
  navArea: ".question-nav",
  navPrevIcon: ".custom-icon-arrow_left",
  navNextIcon: ".custom-icon-arrow_right",
  answerSection: "#answerSection",
  answerRevealButton: "#answerSection .btn",
};

const NEXT_KEYWORDS = ["次へ", "次の問題", "次", "Next"];
const PREV_KEYWORDS = ["前へ", "前の問題", "前", "Prev", "Previous"];
const SUBMIT_KEYWORDS = [
  "回答を送信",
  "解答を送信",
  "回答を提出",
  "解答を提出",
  "送信する",
  "提出する",
  "判定する",
  "採点する",
];
const REVEAL_KEYWORDS = ["解答を確認する", "解答を確認", "解答を見る", "解説を見る"];

export function extractQuestionInfo(doc: Document, url: string): QuestionInfo | null {
  const container = doc.querySelector(SELECTORS.container);
  if (!container) return null;

  const idFromDom = textFrom(container.querySelector(SELECTORS.questionId));
  const idFromUrl = questionIdFromUrl(url);
  const progressText = normalizeSpace(textFrom(container.querySelector(SELECTORS.progress)));
  const pageRef = textFrom(container.querySelector(SELECTORS.footerRef));
  const optionCount = countElements(container, SELECTORS.options);

  const tags: string[] = [];
  if (container.querySelector(SELECTORS.tagFirst)) tags.push("first");
  if (container.querySelector(SELECTORS.tagCompulsory)) tags.push("compulsory");

  return {
    id: idFromDom || idFromUrl,
    progressText: progressText || null,
    pageRef: pageRef || null,
    optionCount: optionCount ?? null,
    tags,
    updatedAt: Date.now(),
  };
}

export function extractQuestionSnapshot(doc: Document, url: string): QuestionSnapshot | null {
  const container = doc.querySelector<HTMLElement>(SELECTORS.container);
  if (!container) return null;
  const info = extractQuestionInfo(doc, url);
  const questionText = extractQuestionText(container);
  const optionTexts = extractOptionTexts(container);
  return {
    id: info?.id ?? questionIdFromUrl(url),
    url,
    questionText,
    optionTexts,
    progressText: info?.progressText ?? null,
    pageRef: info?.pageRef ?? null,
    tags: info?.tags ?? [],
    updatedAt: Date.now(),
  };
}

export function getNavigationTarget(
  doc: Document,
  direction: "next" | "prev"
): HTMLElement | null {
  const iconSelector =
    direction === "next" ? SELECTORS.navNextIcon : SELECTORS.navPrevIcon;
  const answerRoot = doc.querySelector(SELECTORS.answerSection) ?? doc;
  const answerIcon = findIconWithin(answerRoot, iconSelector);
  if (answerIcon) return answerIcon;

  const iconTargets = findClickTargetByIcon(doc, iconSelector);
  if (iconTargets) return iconTargets;

  const navRoots = [doc.querySelector(SELECTORS.navArea)];
  const keywords = direction === "next" ? NEXT_KEYWORDS : PREV_KEYWORDS;
  for (const root of navRoots) {
    const candidates = collectCandidates(root ?? undefined).filter(
      (el) => !matchesKeywords(el, REVEAL_KEYWORDS)
    );
    const target = findFirstMatching(candidates, keywords);
    if (target) return target;
  }
  return null;
}

export function getOptionElements(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll(SELECTORS.options));
}

export function getClickableOptionElement(option: HTMLElement): HTMLElement | null {
  const input = option.querySelector("input");
  if (input instanceof HTMLElement && isEnabled(input)) return input;
  const label = option.querySelector("label");
  if (label instanceof HTMLElement && isEnabled(label)) return label;
  const button = option.querySelector("button");
  if (button instanceof HTMLElement && isEnabled(button)) return button;
  const div = option.querySelector(".ans");
  if (div instanceof HTMLElement && isEnabled(div)) return div;
  return findClickableAncestor(option) ?? (isEnabled(option) ? option : null);
}

export function getSubmitButton(doc: Document): HTMLElement | null {
  const container = doc.querySelector(SELECTORS.container);
  const candidates = collectCandidates(container ?? doc.body);
  return findFirstMatching(candidates, SUBMIT_KEYWORDS);
}

export function getAnswerRevealButton(doc: Document): HTMLElement | null {
  const button = doc.querySelector(SELECTORS.answerRevealButton);
  if (button instanceof HTMLElement && matchesKeywords(button, REVEAL_KEYWORDS)) {
    return findClickableAncestor(button) ?? button;
  }
  const answerArea = doc.querySelector(SELECTORS.answerSection);
  const candidates = collectCandidates(answerArea ?? doc.body);
  const matched = findFirstMatching(candidates, REVEAL_KEYWORDS);
  return matched ? findClickableAncestor(matched) ?? matched : null;
}

function questionIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/Answer\/([^/]+)/i);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
    if (parsed.hash.includes("/Answer/")) {
      const hashMatch = parsed.hash.match(/\/Answer\/([^/]+)/i);
      if (hashMatch && hashMatch[1]) return hashMatch[1];
    }
  } catch {
    return null;
  }
  return null;
}

function textFrom(element: Element | null): string {
  return element?.textContent?.trim() ?? "";
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function countElements(root: ParentNode, selector: string): number | null {
  const list = root.querySelectorAll(selector);
  return list.length > 0 ? list.length : null;
}

function extractQuestionText(container: HTMLElement): string | null {
  const clone = container.cloneNode(true) as HTMLElement;
  const pruneSelectors = [
    SELECTORS.options,
    SELECTORS.answerSection,
    SELECTORS.navArea,
    ".question-nav",
    ".question-footer",
    ".widget-search",
    ".widget-note",
    ".contents__right",
  ];
  for (const selector of pruneSelectors) {
    clone.querySelectorAll(selector).forEach((node) => node.remove());
  }
  const text = normalizeSpace(clone.textContent ?? "");
  return text ? text.slice(0, 2400) : null;
}

function extractOptionTexts(container: HTMLElement): string[] {
  const options = Array.from(container.querySelectorAll<HTMLElement>(SELECTORS.options));
  const results: string[] = [];
  for (const option of options) {
    const text = normalizeSpace(option.textContent ?? "");
    if (!text) continue;
    if (!results.includes(text)) results.push(text);
  }
  return results.slice(0, 8);
}

function collectCandidates(root?: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  const elements = root.querySelectorAll<HTMLElement>("a, button, [role='button'], .btn");
  return Array.from(elements).filter((el) => isEnabled(el));
}

function findFirstMatching(
  elements: HTMLElement[],
  keywords: string[]
): HTMLElement | null {
  for (const keyword of keywords) {
    const target = elements.find((el) => matchesKeyword(el, keyword));
    if (target) return target;
  }
  return null;
}

function matchesKeywords(element: HTMLElement, keywords: string[]): boolean {
  return keywords.some((keyword) => matchesKeyword(element, keyword));
}

function matchesKeyword(element: HTMLElement, keyword: string): boolean {
  const text = normalizeSpace(element.textContent ?? "");
  const aria = normalizeSpace(element.getAttribute("aria-label") ?? "");
  const title = normalizeSpace(element.getAttribute("title") ?? "");
  return text.includes(keyword) || aria.includes(keyword) || title.includes(keyword);
}

function findClickTargetByIcon(doc: Document, selector: string): HTMLElement | null {
  const icons = Array.from(doc.querySelectorAll<HTMLElement>(selector));
  for (const icon of icons) {
    const target = findClickableAncestor(icon);
    if (target) return target;
  }
  return null;
}

function findIconWithin(root: ParentNode, selector: string): HTMLElement | null {
  const icon = root.querySelector<HTMLElement>(selector);
  if (!icon) return null;
  return icon;
}

function findClickableAncestor(element: HTMLElement): HTMLElement | null {
  const target = element.closest<HTMLElement>("a, button, [role='button'], .btn");
  if (target && isEnabled(target)) return target;
  const parent = element.parentElement;
  return parent && isEnabled(parent) ? parent : null;
}

function isEnabled(element: HTMLElement): boolean {
  const ariaDisabled = element.getAttribute("aria-disabled");
  if (ariaDisabled === "true") return false;
  if ("disabled" in element && (element as HTMLButtonElement).disabled) return false;
  return true;
}
