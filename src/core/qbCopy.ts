// Copy text for the current question, kept byte-identical to UW Support's QB adapter
// (USMLE_support/qb_adapter.js read() + chat_core.js fullText), so either extension's copy key
// puts the same text on the clipboard.

export interface CopyQuestion {
  stem: string;
  choices: { letter: string; text: string }[];
  answered: boolean;
  answer: string;
  selected: string;
  explanation: string;
}

const LETTERS = "abcdefghi";
const FULLWIDTH = "ａｂｃｄｅｆｇｈｉ";
const OLD_OPTIONS = ".multiple-answer-options li, .single-answer-options li";
// Both extensions' own UI: the reflection box sits inside the explanation block.
const OURS =
  "#qb-support-root, #qb-support-reflection, #qb-support-reflection-lightbox, #qb-support-chat-root, #qb-support-chat-toggle, " +
  "#qb-support-chat-templates, .qb-support-chat-resizer, .qb-support-chat-overlay-handle, .qb-support-copy-button, .qb-support-copy-toast, " +
  ".qb-support-copy-buffer, #uw-support-settings-panel, #uw-support-settings-btn, #uw-support-chat, #uw-support-capture-toast, [data-uw-support]";
// The closing request in the owner's words (2026-11-06); UW Support's chat_core.js has the same string.
const HINT = "絶妙なヒント（答えありきでなく、所見や症状から推論する視点で思考力を養う答えに迫りすぎないもの）をどうぞ。今の考察は以下です。\n・";

type Option = { row: HTMLElement; body: HTMLElement; old: boolean };

const squash = (value: unknown) =>
  String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
const ours = (el: Element | null | undefined) => !!el?.closest?.(OURS);
// innerText without the extensions' own UI inside the element.
const ownText = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>(OURS))
    .filter((own) => !own.parentElement?.closest(OURS))
    .reduce((text, own) => text.replace(own.innerText, ""), el.innerText);
const enabled = (el: HTMLElement) =>
  el.getAttribute("aria-disabled") !== "true" && !(el as HTMLButtonElement).disabled;
const shown = (el: Element | null) =>
  !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
const label = (text: unknown) => {
  const ch = String(text || "").trim().charAt(0).toLowerCase();
  const i = FULLWIDTH.indexOf(ch);
  return i >= 0 ? LETTERS[i] : LETTERS.includes(ch) && ch ? ch : "";
};
const letters = (text: unknown) =>
  [...String(text || "").matchAll(/[a-iａ-ｉ]/g)].map((m) => label(m[0])).filter(Boolean);
const labelSpan = (row: HTMLElement) =>
  Array.from(row.querySelectorAll("span")).find(
    (s) => !s.closest(".html_renderer") && /^[a-iａ-ｉ]$/i.test(squash(s.textContent))
  );

function options(doc: Document): Option[] {
  const old = Array.from(doc.querySelectorAll<HTMLElement>(OLD_OPTIONS)).filter((li) => !ours(li));
  if (old.length) {
    return old.map((li) => ({ row: li, body: li.querySelector<HTMLElement>(".ans") || li, old: true }));
  }
  return Array.from(doc.querySelectorAll<HTMLElement>("button"))
    .filter((b) => enabled(b) && !ours(b) && b.querySelector(".html_renderer") && labelSpan(b))
    .map((b) => ({ row: b, body: b, old: false }));
}

function choiceOf(option: Option, index: number) {
  if (option.old) {
    const text = squash(option.body.innerText || option.body.textContent);
    const letter = label(text) || LETTERS[index];
    return {
      letter,
      text: text.replace(/^[a-iａ-ｉ][\s.．、]*/i, ""),
      selected: option.body.classList.contains("active"),
    };
  }
  const row = option.row;
  const pressed =
    row.getAttribute("aria-pressed") === "true" ||
    row.getAttribute("aria-checked") === "true" ||
    /\b(selected|active)\b|qb-green/.test(row.className);
  return {
    letter: label(labelSpan(row)?.textContent) || LETTERS[index],
    text: squash(row.querySelector<HTMLElement>(".html_renderer")?.innerText),
    selected: pressed,
  };
}

function stemNode(doc: Document, opts: Option[]): HTMLElement | null {
  const old = doc.querySelector<HTMLElement>(".question-content .body");
  if (old) return old;
  const first = opts[0]?.row;
  if (!first) return null;
  return (
    Array.from(doc.querySelectorAll<HTMLElement>(".html_renderer"))
      .filter(
        (node) =>
          !ours(node) &&
          !node.closest("button") &&
          node.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING
      )
      .pop() || null
  );
}

function textElement(doc: Document, test: (text: string) => boolean): HTMLElement | null {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = squash(node.nodeValue);
    const parent = node.parentElement;
    if (text && test(text) && !ours(parent) && shown(parent)) return parent;
  }
  return null;
}

// Explanations appear in #resultcontent on the older UI and under a "解説" heading on the newer one.
function explanationNode(doc: Document, opts: Option[], stem: HTMLElement): HTMLElement | null {
  const old = doc.querySelector<HTMLElement>("#resultcontent, .resultcontent, .resultContent, .result-content");
  // Only visible explanation text counts: a hidden block, or a visible box showing just the 解説 heading, is not an answer.
  if (old && shown(old) && squash(ownText(old)).replace(/^解説\s*/, "")) return old;
  const heading = textElement(doc, (text) => text === "解説");
  if (!heading) return null;
  // Take the largest block around the heading that still excludes the question.
  const question = (el: HTMLElement) => opts.some((o) => el.contains(o.row)) || el.contains(stem);
  let node = heading;
  while (node.parentElement && node.parentElement !== doc.body && !question(node.parentElement)) {
    node = node.parentElement;
  }
  if (question(node)) return null;
  return squash(ownText(node)).length > squash(heading.innerText).length + 20 ? node : null;
}

// The answer box reads 「正解：c,e」; the answer history table rows do not start with 正解.
function answerOf(doc: Document): string {
  const pattern = /正解[\s:：]*([a-iａ-ｉ](?:[\s,，、・]*[a-iａ-ｉ])*)/;
  for (const start of [doc.getElementById("answerSection"), textElement(doc, (t) => /^正解[：:]/.test(t))]) {
    if (!shown(start)) continue;
    let el: HTMLElement | null = start;
    for (let depth = 0; el && depth < 4; el = el.parentElement, depth++) {
      const match = squash(el.innerText).match(pattern);
      if (match) return letters(match[1]).join(", ");
    }
  }
  return "";
}

export function readCopyQuestion(doc: Document): CopyQuestion | null {
  const opts = options(doc);
  if (!opts.length) return null;
  const stem = stemNode(doc, opts);
  const text = squash(stem?.innerText);
  if (!stem || !text) return null;
  const choices = opts.map(choiceOf);
  const explanation = explanationNode(doc, opts, stem);
  const answer = answerOf(doc);
  const answered = !!(explanation || answer);
  // A reopened question marks no choice, but its answer history lists the latest answer first.
  const history =
    answered &&
    squash(doc.body.innerText).match(
      /\d{4}\/\d{1,2}\/\d{1,2}\s+([a-iａ-ｉ](?:[\s,，、・]*[a-iａ-ｉ])*)\s+(?:正解|不正解)/
    );
  const selected =
    choices.filter((c) => c.selected).map((c) => c.letter).join(", ") ||
    (history ? letters(history[1]).join(", ") : "");
  return {
    stem: text,
    choices: choices.map(({ letter, text }) => ({ letter, text })),
    answered,
    answer: answered ? answer : "",
    selected: answered ? selected : "",
    explanation: answered ? squash(explanation && ownText(explanation)).replace(/^解説\s*/, "") : "",
  };
}

const plain = (value: unknown) => String(value ?? "").replace(/\*([^*\n]+)\*/g, "$1");
const choiceText = (value: unknown) =>
  plain(value).replace(/\s*\(?\s*\d+(?:\.\d+)?\s*%\s*\)?\s*$/g, "").trim();

/** Before answering: question and choices plus a hint request. After: the key, the choice made and the explanation. */
export function copyText(q: CopyQuestion): string {
  const question = [plain(q.stem), q.choices.map((c) => `${c.letter}. ${choiceText(c.text)}`).join("\n")].join("\n\n");
  if (!q.answered) return `${question}\n\n${HINT}`;
  const own = q.selected && q.selected !== q.answer ? `（自分の解答: ${q.selected}）` : "";
  const long = q.explanation.length > 20000;
  const expl = plain(q.explanation).slice(0, 20000) + (long ? "\n[Explanation truncated at 20,000 characters.]" : "");
  return [question, `正解: ${q.answer}${own}`, expl && `解説:\n${expl}`].filter(Boolean).join("\n\n");
}
