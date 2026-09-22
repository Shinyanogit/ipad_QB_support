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

const QUESTION_ID_PATTERN = /\b\d{3}[A-Z]\d{1,3}\b/;
const OPTION_LABEL_PATTERN = /^[a-g]$/;
const FULLWIDTH_OPTION_LABEL_PATTERN = /^[ａ-ｇ]$/;
const NEXT_KEYWORDS = ["次へ", "次の問題", "次", "Next"];
const PREV_KEYWORDS = ["前へ", "前の問題", "前", "Prev", "Previous"];
const SUBMIT_KEYWORDS = [
  "解答する",
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
  const container = getQuestionContainer(doc);
  if (!container) return null;

  const idFromDom =
    textFrom(container.querySelector(SELECTORS.questionId)) ||
    findQuestionIdFromText(container) ||
    findQuestionIdFromText(doc.body);
  const idFromUrl = questionIdFromUrl(url);
  const progressText =
    normalizeSpace(textFrom(container.querySelector(SELECTORS.progress))) ||
    findTextMatching(container, /演習\s*\d+\s*\/\s*\d+\s*問目/);
  const pageRef =
    textFrom(container.querySelector(SELECTORS.footerRef)) ||
    findTextMatching(container, /\[?\s*掲載頁[：:][^\]\n]+]?/);
  const oldOptionCount = countElements(container, SELECTORS.options);
  const newOptionCount = getNewUiOptionElements(doc).length;
  const optionCount = oldOptionCount ?? (newOptionCount > 0 ? newOptionCount : null);

  const tags: string[] = [];
  if (container.querySelector(SELECTORS.tagFirst)) tags.push("first");
  if (container.querySelector(SELECTORS.tagCompulsory)) tags.push("compulsory");
  const imageAlts = Array.from(container.querySelectorAll<HTMLImageElement>("img[alt]"))
    .map((img) => img.alt.trim())
    .filter(Boolean);
  for (const alt of imageAlts) {
    if (!tags.includes(alt)) tags.push(alt);
  }

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
  const container = getQuestionContainer(doc);
  if (!container) return null;
  const info = extractQuestionInfo(doc, url);
  const questionText = extractQuestionText(container as HTMLElement);
  const imageUrls = extractQuestionImageUrls(container as HTMLElement, url);
  const optionTexts = extractOptionTexts(container as HTMLElement);
  return {
    id: info?.id ?? questionIdFromUrl(url),
    url,
    questionText,
    imageUrls,
    optionTexts,
    progressText: info?.progressText ?? null,
    pageRef: info?.pageRef ?? null,
    tags: info?.tags ?? [],
    updatedAt: Date.now(),
  };
}

export function isQuestionDocument(doc: Document, url: string): boolean {
  if (getQuestionContainer(doc)) return true;
  if (questionIdFromUrl(url) && getSubmitButton(doc)) return true;
  if (getNavigationTarget(doc, "prev") || getNavigationTarget(doc, "next")) return true;
  return false;
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
  const pageKeywords =
    direction === "next"
      ? ["次の問題", "次へ", "完了（演習結果）"]
      : ["前の問題", "前へ"];
  const pageCandidates = collectCandidates(doc.body).filter(
    (el) => !matchesKeywords(el, REVEAL_KEYWORDS)
  );
  const pageTarget = findFirstMatching(pageCandidates, pageKeywords);
  if (pageTarget) return pageTarget;
  const newUiTarget = findNewUiNavigationTarget(doc, direction);
  if (newUiTarget) return newUiTarget;
  return null;
}

export function getOptionElements(doc: Document): HTMLElement[] {
  const oldOptions = Array.from(doc.querySelectorAll<HTMLElement>(SELECTORS.options));
  if (oldOptions.length > 0) return oldOptions;
  return getNewUiOptionElements(doc);
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
  const container = getQuestionContainer(doc);
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
    const queryId = parsed.searchParams.get("question_id");
    if (queryId) return queryId;
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

function getQuestionContainer(doc: Document): Element | null {
  const oldContainer = doc.querySelector(SELECTORS.container);
  if (oldContainer) return oldContainer;

  const idElement = findQuestionIdElement(doc);
  if (idElement) {
    return idElement.closest("main") ?? idElement.closest(".rounded-lg") ?? idElement.parentElement;
  }

  const submitButton = findFirstMatching(collectCandidates(doc.body), SUBMIT_KEYWORDS);
  if (submitButton) return submitButton.closest("main") ?? submitButton.parentElement;

  return null;
}

function findQuestionIdElement(root: ParentNode): HTMLElement | null {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("span, div, h1, h2, h3"));
  return (
    elements.find((element) => {
      if (isSupportElement(element)) return false;
      return Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && QUESTION_ID_PATTERN.test(normalizeSpace(node.textContent ?? ""))
      );
    }) ?? null
  );
}

function findQuestionIdFromText(root: ParentNode | null): string | null {
  if (!root) return null;
  const doc = root instanceof Document ? root : root.ownerDocument;
  if (!doc) return null;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !isSupportElement(parent)) {
      const match = normalizeSpace(node.textContent ?? "").match(QUESTION_ID_PATTERN);
      if (match) return match[0];
    }
    node = walker.nextNode();
  }
  return null;
}

function findTextMatching(root: ParentNode | null, pattern: RegExp): string | null {
  if (!root) return null;
  const doc = root instanceof Document ? root : root.ownerDocument;
  if (!doc) return null;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !isSupportElement(parent)) {
      const text = normalizeSpace(node.textContent ?? "");
      const match = text.match(pattern);
      if (match) return match[0];
    }
    node = walker.nextNode();
  }
  return null;
}

function getNewUiOptionElements(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>("button")).filter(isNewUiOptionButton);
}

function isNewUiOptionButton(button: HTMLElement): boolean {
  if (!isEnabled(button) || isSupportElement(button)) return false;
  if (!button.querySelector(".html_renderer")) return false;
  const labels = Array.from(button.querySelectorAll<HTMLElement>("span")).filter(
    (element) => !element.closest(".html_renderer")
  );
  return labels.some((element) => {
    const label = normalizeSpace(element.textContent ?? "").toLowerCase();
    return OPTION_LABEL_PATTERN.test(label) || FULLWIDTH_OPTION_LABEL_PATTERN.test(label);
  });
}

function findNewUiNavigationTarget(
  doc: Document,
  direction: "next" | "prev"
): HTMLElement | null {
  const buttons = Array.from(doc.querySelectorAll<HTMLElement>("button")).filter(
    (button) => isEnabled(button) && !isSupportElement(button)
  );
  const matches = buttons.filter((button) => {
    const pathData = Array.from(button.querySelectorAll<SVGPathElement>("path"))
      .map((path) => path.getAttribute("d") ?? "")
      .join(" ");
    return direction === "next"
      ? pathData.includes("M10 6L8.59")
      : pathData.includes("M15.41 7.41");
  });
  const fixedNavigationButton = matches.find((button) =>
    button.className.toString().split(/\s+/).includes("h-32")
  );
  if (fixedNavigationButton) return fixedNavigationButton;
  return (
    matches.sort(
      (a, b) => normalizeSpace(a.textContent ?? "").length - normalizeSpace(b.textContent ?? "").length
    )[0] ?? null
  );
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
  const doc = container.ownerDocument;
  const legacyOptions = Array.from(container.querySelectorAll<HTMLElement>(SELECTORS.options));
  const options = legacyOptions.length > 0 ? legacyOptions : getNewUiOptionElements(doc);
  const results: string[] = [];
  for (const option of options) {
    const text = normalizeSpace(option.textContent ?? "");
    if (!text) continue;
    if (!results.includes(text)) results.push(text);
  }
  return results.slice(0, 8);
}

function extractQuestionImageUrls(container: HTMLElement, url: string): string[] {
  const images = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
  const results: string[] = [];
  for (const image of images) {
    const src = image.getAttribute("src") ?? "";
    if (!src) continue;
    if (image.closest(SELECTORS.options)) continue;
    if (image.closest(".question-footer")) continue;
    if (image.closest(".question-nav")) continue;
    if (image.closest(".widget-search")) continue;
    if (image.closest(".widget-note")) continue;
    if (image.closest(".contents__right")) continue;
    if (src.includes("no_image")) continue;
    let resolved: string;
    try {
      resolved = new URL(src, url).toString();
    } catch {
      continue;
    }
    if (!results.includes(resolved)) results.push(resolved);
  }
  return results.slice(0, 4);
}

function collectCandidates(root?: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  const elements = root.querySelectorAll<HTMLElement>("a, button, [role='button'], .btn");
  return Array.from(elements).filter((el) => isEnabled(el) && !isSupportElement(el));
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

function isSupportElement(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      "#qb-support-root, #qb-support-marker, #qb-support-chat-root, [data-qb-support-root]"
    )
  );
}
