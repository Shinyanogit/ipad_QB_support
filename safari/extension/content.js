"use strict";
(() => {
  // src/core/qbDom.ts
  var SELECTORS = {
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
    answerRevealButton: "#answerSection .btn"
  };
  var NEXT_KEYWORDS = ["次へ", "次の問題", "次", "Next"];
  var PREV_KEYWORDS = ["前へ", "前の問題", "前", "Prev", "Previous"];
  var SUBMIT_KEYWORDS = [
    "回答を送信",
    "解答を送信",
    "回答を提出",
    "解答を提出",
    "送信する",
    "提出する",
    "判定する",
    "採点する"
  ];
  var REVEAL_KEYWORDS = ["解答を確認する", "解答を確認", "解答を見る", "解説を見る"];
  var HINT_BASE_PHRASE = "絶妙なヒント";
  var HINT_ANSWER_TEXT_LIMIT = 2400;
  var HINT_ANSWER_MIN_LENGTH = 80;
  function extractQuestionInfo(doc, url) {
    const container = doc.querySelector(SELECTORS.container);
    if (!container) return null;
    const idFromDom = textFrom(container.querySelector(SELECTORS.questionId));
    const idFromUrl = questionIdFromUrl(url);
    const progressText = normalizeSpace(textFrom(container.querySelector(SELECTORS.progress)));
    const pageRef = textFrom(container.querySelector(SELECTORS.footerRef));
    const optionCount = countElements(container, SELECTORS.options);
    const tags = [];
    if (container.querySelector(SELECTORS.tagFirst)) tags.push("first");
    if (container.querySelector(SELECTORS.tagCompulsory)) tags.push("compulsory");
    return {
      id: idFromDom || idFromUrl,
      progressText: progressText || null,
      pageRef: pageRef || null,
      optionCount: optionCount ?? null,
      tags,
      updatedAt: Date.now()
    };
  }
  function extractQuestionSnapshot(doc, url) {
    const container = doc.querySelector(SELECTORS.container);
    if (!container) return null;
    const info = extractQuestionInfo(doc, url);
    const questionText = extractQuestionText(container);
    const imageUrls = extractQuestionImageUrls(container, url);
    const optionTexts = extractOptionTexts(container);
    return {
      id: info?.id ?? questionIdFromUrl(url),
      url,
      questionText,
      imageUrls,
      optionTexts,
      progressText: info?.progressText ?? null,
      pageRef: info?.pageRef ?? null,
      tags: info?.tags ?? [],
      updatedAt: Date.now()
    };
  }
  function extractAnswerExplanationContext(doc) {
    const answerSection = doc.querySelector(SELECTORS.answerSection);
    const sectionText = extractAnswerTextFromElement(answerSection);
    if (sectionText) {
      return {
        text: sectionText,
        meta: buildAnswerMeta("answer-section", sectionText, answerSection)
      };
    }
    const main = extractAnswerFromContentsMain(doc);
    if (main.text) return main;
    return { text: "", meta: { source: "empty", length: 0, preview: "" } };
  }
  function buildAnswerMeta(source, text, element, extra) {
    return {
      source,
      length: text.length,
      preview: getHintAnswerPreview(text),
      tag: element instanceof HTMLElement ? element.tagName : null,
      id: element instanceof HTMLElement ? element.id || null : null,
      className: element instanceof HTMLElement ? element.className || null : null,
      ...(extra ?? {})
    };
  }
  function extractAnswerTextFromElement(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll("button, .btn, script, style").forEach((node) => node.remove());
    let text = normalizeSpace(clone.textContent ?? "");
    if (!text) return "";
    for (const keyword of REVEAL_KEYWORDS) {
      text = text.split(keyword).join("");
    }
    text = normalizeSpace(text);
    if (!text) return "";
    return text.slice(0, HINT_ANSWER_TEXT_LIMIT);
  }
  function sliceAnswerByKeyword(text) {
    if (!text) return "";
    const match = text.match(/解説|正解|解法|解答/);
    if (!match || match.index == null) return text;
    const index = match.index;
    if (text.length - index < HINT_ANSWER_MIN_LENGTH) return text;
    return text.slice(index);
  }
  function extractAnswerFromContentsMain(doc) {
    const element = doc.querySelector("div.contents-main");
    if (!(element instanceof HTMLElement)) {
      return { text: "", meta: { source: "contents-main", found: false } };
    }
    if (isSupportUiElement(element)) {
      return { text: "", meta: { source: "contents-main", found: false, reason: "ui" } };
    }
    const raw = extractAnswerTextFromElement(element);
    if (!raw) {
      return { text: "", meta: { source: "contents-main", found: true, usable: 0 } };
    }
    const sliced = sliceAnswerByKeyword(raw);
    if (sliced.length < HINT_ANSWER_MIN_LENGTH) {
      return { text: "", meta: { source: "contents-main", found: true, usable: 0 } };
    }
    const trimmed = sliced.slice(0, HINT_ANSWER_TEXT_LIMIT);
    const meta = buildAnswerMeta("contents-main", trimmed, element);
    return { text: trimmed, meta };
  }
  function isHintMessage(text) {
    return text.includes(HINT_BASE_PHRASE);
  }
  function getHintAnswerPreview(value) {
    if (!value) return "";
    const normalized = normalizeSpace(value);
    return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
  }
  function isSupportUiElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    return Boolean(element.closest("[id^='qb-support-'], [class*='qb-support']"));
  }
  function stripSupportUi(root) {
    if (!root) return;
    root.querySelectorAll("[id^='qb-support-'], [class*='qb-support']").forEach((node) => node.remove());
  }
  function getNavigationTarget(doc, direction) {
    const iconSelector = direction === "next" ? SELECTORS.navNextIcon : SELECTORS.navPrevIcon;
    const answerRoot = doc.querySelector(SELECTORS.answerSection) ?? doc;
    const answerIcon = findIconWithin(answerRoot, iconSelector);
    if (answerIcon) return answerIcon;
    const iconTargets = findClickTargetByIcon(doc, iconSelector);
    if (iconTargets) return iconTargets;
    const navRoots = [doc.querySelector(SELECTORS.navArea)];
    const keywords = direction === "next" ? NEXT_KEYWORDS : PREV_KEYWORDS;
    for (const root2 of navRoots) {
      const candidates = collectCandidates(root2 ?? void 0).filter(
        (el) => !matchesKeywords(el, REVEAL_KEYWORDS)
      );
      const target = findFirstMatching(candidates, keywords);
      if (target) return target;
    }
    return null;
  }
  function getOptionElements(doc) {
    return Array.from(doc.querySelectorAll(SELECTORS.options));
  }
  function getClickableOptionElement(option) {
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
  function getSubmitButton(doc) {
    const container = doc.querySelector(SELECTORS.container);
    const candidates = collectCandidates(container ?? doc.body);
    return findFirstMatching(candidates, SUBMIT_KEYWORDS);
  }
  function getAnswerRevealButton(doc) {
    const button = doc.querySelector(SELECTORS.answerRevealButton);
    if (button instanceof HTMLElement && matchesKeywords(button, REVEAL_KEYWORDS)) {
      return findClickableAncestor(button) ?? button;
    }
    const answerArea = doc.querySelector(SELECTORS.answerSection);
    const candidates = collectCandidates(answerArea ?? doc.body);
    const matched = findFirstMatching(candidates, REVEAL_KEYWORDS);
    return matched ? findClickableAncestor(matched) ?? matched : null;
  }
  function questionIdFromUrl(url) {
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
  function textFrom(element) {
    return element?.textContent?.trim() ?? "";
  }
  function normalizeSpace(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function countElements(root2, selector) {
    const list = root2.querySelectorAll(selector);
    return list.length > 0 ? list.length : null;
  }
  function extractQuestionText(container) {
    const clone = container.cloneNode(true);
    const pruneSelectors = [
      SELECTORS.options,
      SELECTORS.answerSection,
      SELECTORS.navArea,
      ".question-nav",
      ".question-footer",
      ".widget-search",
      ".widget-note",
      ".contents__right"
    ];
    for (const selector of pruneSelectors) {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
    }
    const text = normalizeSpace(clone.textContent ?? "");
    return text ? text.slice(0, 2400) : null;
  }
  function extractOptionTexts(container) {
    const options = Array.from(container.querySelectorAll(SELECTORS.options));
    const results = [];
    for (const option of options) {
      const text = normalizeSpace(option.textContent ?? "");
      if (!text) continue;
      if (!results.includes(text)) results.push(text);
    }
    return results.slice(0, 8);
  }
  function extractQuestionImageUrls(container, url) {
    const images = Array.from(container.querySelectorAll("img"));
    const results = [];
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
      let resolved;
      try {
        resolved = new URL(src, url).toString();
      } catch {
        continue;
      }
      if (!results.includes(resolved)) results.push(resolved);
    }
    return results.slice(0, 4);
  }
  function collectCandidates(root2) {
    if (!root2) return [];
    const elements = root2.querySelectorAll("a, button, [role='button'], .btn");
    return Array.from(elements).filter((el) => isEnabled(el));
  }
  function findFirstMatching(elements, keywords) {
    for (const keyword of keywords) {
      const target = elements.find((el) => matchesKeyword(el, keyword));
      if (target) return target;
    }
    return null;
  }
  function matchesKeywords(element, keywords) {
    return keywords.some((keyword) => matchesKeyword(element, keyword));
  }
  function matchesKeyword(element, keyword) {
    const text = normalizeSpace(element.textContent ?? "");
    const aria = normalizeSpace(element.getAttribute("aria-label") ?? "");
    const title = normalizeSpace(element.getAttribute("title") ?? "");
    return text.includes(keyword) || aria.includes(keyword) || title.includes(keyword);
  }
  function findClickTargetByIcon(doc, selector) {
    const icons = Array.from(doc.querySelectorAll(selector));
    for (const icon of icons) {
      const target = findClickableAncestor(icon);
      if (target) return target;
    }
    return null;
  }
  function findIconWithin(root2, selector) {
    const icon = root2.querySelector(selector);
    if (!icon) return null;
    return icon;
  }
  function findClickableAncestor(element) {
    const target = element.closest("a, button, [role='button'], .btn");
    if (target && isEnabled(target)) return target;
    const parent = element.parentElement;
    return parent && isEnabled(parent) ? parent : null;
  }
  function isEnabled(element) {
    const ariaDisabled = element.getAttribute("aria-disabled");
    if (ariaDisabled === "true") return false;
    if ("disabled" in element && element.disabled) return false;
    return true;
  }

  // src/core/settings.ts
  var MODIFIER_LABELS = ["Ctrl", "Alt", "Shift", "Meta"];
  var CHAT_MODEL_OPTIONS = [
    "gpt-5-mini",
    "gpt-5.2",
    "gpt-5.2-chat-latest",
    "gpt-5",
    "gpt-4.1",
    "gpt-4o"
  ];
  var CHAT_TEMPLATE_LIMIT = 5;
  var DEFAULT_EXPLANATION_PROMPTS = {
    highschool: "高校生でもわかるように、専門用語はできるだけ避け、必要なら簡単な言い換えと短い例えを添えて説明してください。",
    "med-junior": "医学部低学年向けに、基本的な専門用語は使ってよいので、重要ポイントを簡潔に整理して説明してください。",
    "med-senior": "医学部高学年〜研修医レベルで、病態生理や鑑別ポイントに踏み込み、簡潔だが密度の高い説明にしてください。"
  };
  var DEFAULT_CHAT_TEMPLATES = [
    {
      enabled: true,
      label: "ヒント",
      shortcut: "Ctrl+Z",
      prompt: "絶妙なヒント（答えありきでなく、所見や症状から推論する視点で思考力を養う答えに迫りすぎないもの）をどうぞ。※400文字以内で回答してください。"
    },
    {
      enabled: true,
      label: "4箇条",
      shortcut: "Ctrl+4",
      prompt: [
        "各々の選択肢について、以下の4箇条を守ってわかりやすく解説してください。",
        "",
        "❶ 一言でいうと？（直感的なイメージ）",
        "",
        "その病態・症状・所見について、初めて聞いた人でも直感的に理解できるような、具体的なイメージや比喩を一文で表現する（基本的に体言止め）。専門用語や厳密な定義ではなく、「なるほど、そういう感じか」とイメージが湧く表現を心がける。",
        "",
        "例（裂肛の場合）：",
        "✅ 「硬い便で肛門が“紙のようにピリッと裂ける”」",
        "❌ 「裂肛の多くは後方正中にできる」（具体性やイメージが不足）",
        "",
        "❷ 因果関係スタイル（Pathophysiologyの連鎖）",
        "",
        "診断に至る思考プロセスではなく、病態そのものが体内で引き起こす現象の連鎖を時系列・因果関係順に示す。キーワードを「↓→」で結び、生体内で実際に起きている内容・症状・所見を順序立てて表現する。",
        "",
        "例（ASO発症機序）：",
        "糖尿病・高血圧・高脂血症・喫煙などの動脈硬化リスク↑",
        "↓",
        "中〜大動脈（主に下肢動脈）で動脈硬化性プラーク形成（脂質核＋線維性被膜）",
        "↓",
        "管腔狭窄 → 安静時は血流保たれるが、運動時は需要＞供給に",
        "↓",
        "下肢の間欠性跛行（claudication）、さらには安静時痛へと進行",
        "↓",
        "血流不足が高度化 → 末梢潰瘍（足趾先端など）・皮膚萎縮・壊疽",
        "↓",
        "夜間や足挙上時に血流がさらに低下 → 安静時痛が悪化 → 足を垂らして寝ると楽になる",
        "",
        "❸ 情報を落とさない",
        "",
        "問題文に記載されている臨床情報（症状、所見、誘因、背景など）は必ず因果関係スタイル内に適切に組み込む。追加の補足情報を入れることは可能だが、元の問題文の情報を削除しないよう注意する。",
        "",
        "❹ 正解選択肢をえこひいきしない",
        "",
        "すべての選択肢に対して、同じレベルの詳細さと明確さで解説を行う。ただし、問題文の所見や症状が明らかに正解選択肢の病態に関連する場合、それらは正解選択肢の因果関係スタイルに明示的に組み込む。",
        "",
        "⸻",
        "",
        "以下は改善後の具体例です。",
        "",
        "✅ 正解：F. Posterior midline of the anal verge",
        "",
        "❶ 一言でいうと？",
        "",
        "硬い便が「紙を破るように」肛門の後ろ側を裂いてしまう",
        "",
        "❷ 因果関係スタイル",
        "",
        "慢性便秘・硬便",
        "↓",
        "肛門部への過度な張力と伸展",
        "↓",
        "肛門粘膜が裂ける（特に後方正中は血流が少なく弱い）",
        "↓",
        "裂肛形成",
        "＋",
        "肛門括約筋のけいれん → 裂創の治癒が遅れ、強い痛み",
        "",
        "❸ 情報を落とさない",
        "• 裂肛は歯状線より遠位（皮膚寄り）の縦方向の裂創",
        "• 硬便の通過、慢性便秘、過度の伸展が誘因となる",
        "• 後方正中が血流不足のため最も起こりやすい",
        "• 鮮血便（トイレットペーパーに付着）と排便時の鋭い痛みが典型的な症状",
        "",
        "（他の選択肢についても同様の基準で説明）"
      ].join("\n")
    },
    {
      enabled: true,
      label: "統合",
      shortcut: "Ctrl+T",
      prompt: [
        "統合因果関係スタイル(正解選択肢を中心にして、所見や症状などをすべて盛り込んだ巨大な１つのフローチャート。当然箇条書きではないので番号をふるなど不要。→↓で因果列、時系列にキーワードを結んだ忠実な図を作成。以下は一例(本当はこの2倍程度の分量を期待します。可能なら他の選択肢で言及されている内容を矛盾なく結合させて。)",
        "例（ASO）：",
        "糖尿病・高血圧・高脂血症・喫煙などの動脈硬化リスク↑",
        "↓",
        "中〜大動脈（主に下肢動脈）で動脈硬化性プラーク形成（脂質核＋線維性被膜）",
        "↓",
        "管腔狭窄 → 安静時は血流保たれるが、運動時は需要＞供給に",
        "↓",
        "下肢の間欠性跛行（claudication）、さらには安静時痛へと進行",
        "↓",
        "血流不足が高度化 → 末梢潰瘍（足趾先端など）・皮膚萎縮・壊疽",
        "↓",
        "夜間や足挙上時に血流がさらに低下 → 安静時痛が悪化 → 足を垂らして寝ると楽になる"
      ].join("\n")
    },
    {
      enabled: false,
      label: "テンプレ4",
      shortcut: "",
      prompt: ""
    },
    {
      enabled: false,
      label: "テンプレ5",
      shortcut: "",
      prompt: ""
    }
  ];
  var MODIFIER_ALIASES = {
    ctrl: "Ctrl",
    control: "Ctrl",
    alt: "Alt",
    option: "Alt",
    shift: "Shift",
    meta: "Meta",
    cmd: "Meta",
    command: "Meta"
  };
  var defaultSettings = {
    enabled: true,
    shortcutsEnabled: true,
    debugEnabled: false,
    noteVisible: true,
    searchVisible: true,
    navPrevKey: "ArrowLeft",
    navNextKey: "ArrowRight",
    revealKey: "Ctrl+S",
    optionKeys: ["A", "B", "C", "D", "E"],
    position: "bottom-right",
    shortcut: "Alt+Q",
    chatOpen: false,
    chatDock: "right",
    chatApiKey: "",
    chatApiKeyEnabled: true,
    chatModel: "gpt-5-mini",
    chatTemplates: DEFAULT_CHAT_TEMPLATES,
    chatTemplateCount: 3,
    commonPrompt: "",
    hintConstraintPrompt: "※400文字以内で回答してください。",
    explanationLevel: "med-junior",
    explanationPrompts: DEFAULT_EXPLANATION_PROMPTS,
    themePreference: "system",
    pageAccentEnabled: true
  };
  function normalizeSettings(input) {
    if (!input) return { ...defaultSettings };
    const legacyNoteVisible = typeof input.noteHeaderVisible === "boolean" ? input.noteHeaderVisible : void 0;
    const optionKeys = Array.isArray(input.optionKeys) && input.optionKeys.length > 0 ? input.optionKeys.map((key) => normalizeShortcut(key)).filter(Boolean) : defaultSettings.optionKeys;
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : defaultSettings.enabled,
      shortcutsEnabled: typeof input.shortcutsEnabled === "boolean" ? input.shortcutsEnabled : defaultSettings.shortcutsEnabled,
      debugEnabled: typeof input.debugEnabled === "boolean" ? input.debugEnabled : defaultSettings.debugEnabled,
      noteVisible: typeof input.noteVisible === "boolean" ? input.noteVisible : legacyNoteVisible ?? defaultSettings.noteVisible,
      searchVisible: typeof input.searchVisible === "boolean" ? input.searchVisible : defaultSettings.searchVisible,
      navPrevKey: normalizeShortcut(input.navPrevKey) || defaultSettings.navPrevKey,
      navNextKey: normalizeShortcut(input.navNextKey) || defaultSettings.navNextKey,
      revealKey: normalizeShortcut(input.revealKey) || defaultSettings.revealKey,
      optionKeys,
      position: isPosition(input.position) ? input.position : defaultSettings.position,
      shortcut: normalizeShortcut(input.shortcut) || defaultSettings.shortcut,
      chatOpen: typeof input.chatOpen === "boolean" ? input.chatOpen : defaultSettings.chatOpen,
      chatDock: isChatDock(input.chatDock) ? input.chatDock : defaultSettings.chatDock,
      chatApiKey: typeof input.chatApiKey === "string" ? input.chatApiKey.trim() : defaultSettings.chatApiKey,
      chatApiKeyEnabled: typeof input.chatApiKeyEnabled === "boolean" ? input.chatApiKeyEnabled : defaultSettings.chatApiKeyEnabled,
      chatModel: normalizeChatModel(input.chatModel) ?? defaultSettings.chatModel,
      chatTemplates: normalizeChatTemplates(input.chatTemplates),
      chatTemplateCount: (() => {
        const raw = typeof input.chatTemplateCount === "number" ? Math.floor(input.chatTemplateCount) : defaultSettings.chatTemplateCount;
        if (Number.isNaN(raw)) return defaultSettings.chatTemplateCount;
        return Math.min(Math.max(raw, 1), CHAT_TEMPLATE_LIMIT);
      })(),
      commonPrompt: typeof input.commonPrompt === "string" ? input.commonPrompt.trim() : defaultSettings.commonPrompt,
      hintConstraintPrompt: typeof input.hintConstraintPrompt === "string" ? input.hintConstraintPrompt.trim() : defaultSettings.hintConstraintPrompt,
      explanationLevel: isExplanationLevel(input.explanationLevel) ? input.explanationLevel : defaultSettings.explanationLevel,
      explanationPrompts: normalizeExplanationPrompts(input.explanationPrompts),
      themePreference: isThemePreference(input.themePreference) ? input.themePreference : defaultSettings.themePreference,
      pageAccentEnabled: typeof input.pageAccentEnabled === "boolean" ? input.pageAccentEnabled : defaultSettings.pageAccentEnabled
    };
  }
  function normalizeChatModel(input) {
    if (typeof input !== "string") return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    return CHAT_MODEL_OPTIONS.includes(trimmed) ? trimmed : null;
  }
  function normalizeChatTemplates(input) {
    const safeDefaults = DEFAULT_CHAT_TEMPLATES.map((template) => ({ ...template }));
    if (!Array.isArray(input)) return safeDefaults;
    const next = [];
    const count = Math.min(input.length, CHAT_TEMPLATE_LIMIT);
    for (let i = 0; i < count; i += 1) {
      const fallback = safeDefaults[i] ?? {
        enabled: false,
        label: `テンプレ${i + 1}`,
        shortcut: "",
        prompt: ""
      };
      const raw = input[i];
      const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : fallback.enabled;
      const label = typeof raw?.label === "string" && raw.label.trim() ? raw.label.trim() : fallback.label;
      const shortcut = normalizeShortcut(raw?.shortcut ?? "") || fallback.shortcut || "";
      const prompt = typeof raw?.prompt === "string" ? raw.prompt : fallback.prompt;
      next.push({ enabled, label, shortcut, prompt });
    }
    for (let i = next.length; i < CHAT_TEMPLATE_LIMIT; i += 1) {
      next.push(
        safeDefaults[i] ?? { enabled: false, label: `テンプレ${i + 1}`, shortcut: "", prompt: "" }
      );
    }
    return next;
  }
  function isExplanationLevel(input) {
    return input === "highschool" || input === "med-junior" || input === "med-senior";
  }
  function normalizeExplanationPrompts(input) {
    const fallback = { ...DEFAULT_EXPLANATION_PROMPTS };
    if (!input || typeof input !== "object") return fallback;
    const raw = input;
    return {
      highschool: typeof raw.highschool === "string" && raw.highschool.trim() ? raw.highschool.trim() : fallback.highschool,
      "med-junior": typeof raw["med-junior"] === "string" && raw["med-junior"].trim() ? raw["med-junior"].trim() : fallback["med-junior"],
      "med-senior": typeof raw["med-senior"] === "string" && raw["med-senior"].trim() ? raw["med-senior"].trim() : fallback["med-senior"]
    };
  }
  function isThemePreference(input) {
    return input === "system" || input === "light" || input === "dark";
  }
  function normalizeShortcut(input) {
    if (!input) return "";
    const parts = input.split("+").map((part) => part.trim()).filter(Boolean);
    const modifiers = /* @__PURE__ */ new Set();
    let key = "";
    for (const part of parts) {
      const lower = part.toLowerCase();
      const mapped = MODIFIER_ALIASES[lower];
      if (mapped) {
        modifiers.add(mapped);
        continue;
      }
      key = normalizeKeyLabel(part);
    }
    if (!key) return "";
    const ordered = MODIFIER_LABELS.filter((label) => modifiers.has(label));
    return [...ordered, key].join("+");
  }
  function shortcutFromEvent(event) {
    const modifiers = MODIFIER_LABELS.filter((label) => {
      if (label === "Ctrl") return event.ctrlKey;
      if (label === "Alt") return event.altKey;
      if (label === "Shift") return event.shiftKey;
      if (label === "Meta") return event.metaKey;
      return false;
    });
    const key = normalizeKeyLabel(event.key);
    if (!key || key === "Ctrl" || key === "Alt" || key === "Shift" || key === "Meta") {
      return "";
    }
    return [...modifiers, key].join("+");
  }
  function isShortcutMatch(event, shortcut) {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return false;
    const parts = normalized.split("+");
    const key = parts.pop();
    if (!key) return false;
    const modifiers = new Set(parts);
    if (event.ctrlKey !== modifiers.has("Ctrl")) return false;
    if (event.altKey !== modifiers.has("Alt")) return false;
    if (event.shiftKey !== modifiers.has("Shift")) return false;
    if (event.metaKey !== modifiers.has("Meta")) return false;
    const eventKey = normalizeKeyLabel(event.key);
    return eventKey === key;
  }
  function normalizeKeyLabel(raw) {
    if (!raw) return "";
    if (raw === " ") return "Space";
    if (raw.length === 1) return raw.toUpperCase();
    const lower = raw.toLowerCase();
    if (lower === "escape") return "Escape";
    if (lower === "esc") return "Escape";
    if (lower === "arrowup") return "ArrowUp";
    if (lower === "arrowdown") return "ArrowDown";
    if (lower === "arrowleft") return "ArrowLeft";
    if (lower === "arrowright") return "ArrowRight";
    if (lower === "enter") return "Enter";
    if (lower === "tab") return "Tab";
    if (lower === "backspace") return "Backspace";
    return raw;
  }
  function isPosition(value) {
    return value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right";
  }
  function isChatDock(value) {
    return value === "left" || value === "right";
  }

  // src/lib/webext.ts
  var globalApi = globalThis;
  var webext = globalApi.browser ?? globalApi.chrome ?? {};
  function getStorageArea(preferSync = true) {
    const storage = webext.storage;
    if (!storage) return null;
    if (preferSync && storage.sync) return storage.sync;
    return storage.local ?? storage.sync ?? null;
  }
  function promisify(runner) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const callback = (value) => {
        if (settled) return;
        settled = true;
        const error = webext.runtime?.lastError;
        if (error?.message) {
          reject(new Error(error.message));
          return;
        }
        resolve(value);
      };
      try {
        const result = runner(callback);
        if (result && typeof result.then === "function") {
          result.then((value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          }).catch((error) => {
            if (settled) return;
            settled = true;
            reject(error);
          });
        }
      } catch (error) {
        if (settled) return;
        settled = true;
        reject(error);
      }
    });
  }
  function storageGet(area, key) {
    if (area.get.length <= 1) {
      try {
        const result = area.get(key);
        if (result && typeof result.then === "function") {
          return result;
        }
        return Promise.resolve(result);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return promisify((callback) => area.get(key, callback));
  }
  function storageSet(area, items) {
    if (area.set.length <= 1) {
      try {
        const result = area.set(items);
        if (result && typeof result.then === "function") {
          return result;
        }
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return promisify((callback) => area.set(items, callback));
  }
  function getManifest() {
    return webext.runtime?.getManifest ? webext.runtime.getManifest() : null;
  }
  function sendRuntimeMessage(message) {
    const runtime = webext.runtime;
    if (!runtime?.sendMessage) return Promise.resolve(void 0);
    if (runtime.sendMessage.length <= 1) {
      try {
        const result = runtime.sendMessage(message);
        if (result && typeof result.then === "function") {
          return result;
        }
        return Promise.resolve(result);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return promisify((callback) => runtime.sendMessage(message, callback));
  }

  // src/content.ts
  var STORAGE_KEY = "qb_support_settings_v1";
  var ROOT_ID = "qb-support-root";
  var MARKER_ID = "qb-support-marker";
  var CHAT_ROOT_ID = "qb-support-chat-root";
  var CHAT_TOGGLE_ID = "qb-support-chat-toggle";
  var CHAT_DOCK_CLASS = "qb-support-chat-dock";
  var CHAT_RESIZER_ID = "qb-support-chat-resizer";
  var CHAT_OVERLAY_HANDLE_ID = "qb-support-chat-overlay-handle";
  var CHAT_TEMPLATE_ID = "qb-support-chat-templates";
  var CHAT_TOGGLE_SHORTCUT = "Ctrl+O";
  var CHAT_INPUT_TOGGLE_SHORTCUT = "Ctrl+Enter";
  var CHAT_NEW_SHORTCUT = "Ctrl+N";
  var CHAT_TEMPLATE_MAX = 5;
  var CHAT_DOCK_MIN_WIDTH = 320;
  var CHAT_DOCK_TARGET_RATIO = 0.45;
  var CHAT_DOCK_GAP = 20;
  var QB_ACTION_ORIGIN = "https://input.medilink-study.com";
  var QB_TOP_ORIGIN = "https://qb.medilink-study.com";
  var FIREBASE_SETTINGS_VERSION = 1;
  var BACKEND_DEFAULT_MODEL = "gpt-5-mini";
  var BACKEND_ALLOWED_MODELS = ["gpt-5-mini", "gpt-4.1"];
  var DEFAULT_BACKEND_URL = "https://ipad-qb-support-400313981210.asia-northeast1.run.app";
  var USAGE_META_EMAIL = "ymgtsny7@gmail.com";
  var AUTH_STORAGE_KEY = "qb_support_auth_session_v1";
  var AUTH_SESSION_TIMEOUT_MS = 12e4;
  var AUTH_SESSION_POLL_INTERVAL_MS = 1e3;
  var AUTH_SESSION_FALLBACK_MS = 6 * 60 * 60 * 1e3;
  var EXPLANATION_LEVEL_LABELS = {
    highschool: "高校生でもわかる",
    "med-junior": "医学部低学年",
    "med-senior": "医学部高学年〜研修医"
  };
  var settings = { ...defaultSettings };
  var currentInfo = null;
  var currentSnapshot = null;
  var cachedAnswerContext = null;
  var pendingAnswerResolvers = [];
  var answerFrameEl = null;
  var answerContextWanted = false;
  var lastAnswerContextText = "";
  var answerObserver = null;
  var answerObserverBound = false;
  var root = null;
  var panel = null;
  var launcher = null;
  var infoFields = {};
  var statusField = null;
  var chatRoot = null;
  var chatPanel = null;
  var chatToggle = null;
  var chatMessagesEl = null;
  var chatInput = null;
  var lastHintDraftSource = null;
  var chatSendButton = null;
  var chatStatusField = null;
  var chatInputWrap = null;
  var chatApiInput = null;
  var chatApiKeyToggle = null;
  var chatApiKeyVisibilityButton = null;
  var chatApiKeyStatus = null;
  var chatModelInput = null;
  var chatHeaderModelSelect = null;
  var chatSettingsPanel = null;
  var chatSettingsButton = null;
  var chatSettingsOpen = false;
  var chatApiKeyVisible = false;
  var chatAuthPromptActive = false;
  var chatTemplateBar = null;
  var chatTemplateRows = [];
  var templateCountLabel = null;
  var templateAddButton = null;
  var templateRemoveButton = null;
  var hintQuickButton = null;
  var chatResizer = null;
  var chatOverlayHandle = null;
  var chatHistory = [];
  var chatRequestPending = false;
  var chatComposing = false;
  var chatLayoutBound = false;
  var chatDockWidth = 0;
  var chatResizeActive = false;
  var lastChatOpen = false;
  var lastChatLayout = null;
  var chatLastResponseId = null;
  var activeChatRequestId = null;
  var activeChatPort = null;
  var shortcutsToggle = null;
  var debugToggle = null;
  var noteToggle = null;
  var searchToggle = null;
  var pageAccentToggle = null;
  var themeToggle = null;
  var navPrevInput = null;
  var navNextInput = null;
  var revealInput = null;
  var optionInputs = [];
  var authProfile = null;
  var authStatusField = null;
  var authMetaField = null;
  var authSyncField = null;
  var authSignInButton = null;
  var authSignOutButton = null;
  var authLoginButton = null;
  var authLoginUrl = null;
  var authInitialized = false;
  var authSyncTimer = null;
  var authSyncInFlight = false;
  var authSyncPending = false;
  var authRemoteFetchPending = false;
  var authNetworkBound = false;
  var remoteSettingsLoadedFor = null;
  var authAccessToken = null;
  var explanationLevelSelect = null;
  var explanationPromptInputs = {};
  var commonPromptInput = null;
  var shortcutSectionEl = null;
  var displaySectionEl = null;
  var templateSectionEl = null;
  var explanationSectionEl = null;
  var authSectionEl = null;
  var themeQuery = null;
  var lastPointerDownAt = 0;
  var start = () => {
    logInjectionOnce();
    ensureMarker();
    logFramesOnce();
    attachMessageHandlers();
    removeHeaderGearButton();
    if (isQbHost()) {
      init().catch((error) => console.warn("[QB_SUPPORT] init failed", error));
      return;
    }
    if (isInputHost()) {
      initFrame().catch((error) => console.warn("[QB_SUPPORT] frame init failed", error));
    }
  };
  async function init() {
    await loadSettings();
    ensureUI();
    ensureChatUI();
    initAuth();
    ensureThemeListener();
    applySettings();
    refreshQuestionInfo();
    startObservers();
    attachEventHandlers();
    attachChatHandlers();
  }
  async function initFrame() {
    await loadSettings();
    ensureThemeListener();
    applySettings();
    refreshQuestionInfo();
    startObservers();
  }
  async function loadSettings() {
    const primary = getStorageArea(true);
    const fallback = getStorageArea(false);
    let stored = {};
    let storageLabel = "none";
    if (!primary && !fallback) {
      settings = normalizeSettings(void 0);
      return;
    }
    if (primary) {
      try {
        stored = await storageGet(primary, STORAGE_KEY);
        storageLabel = primary === webext.storage?.sync ? "sync" : "local";
      } catch (error) {
        console.warn("[QB_SUPPORT][settings] load failed", {
          storage: primary === webext.storage?.sync ? "sync" : "local",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    if ((!stored || typeof stored !== "object" || !(STORAGE_KEY in stored)) && fallback) {
      try {
        stored = await storageGet(fallback, STORAGE_KEY);
        storageLabel = fallback === webext.storage?.sync ? "sync" : "local";
      } catch (error) {
        console.warn("[QB_SUPPORT][settings] load fallback failed", {
          storage: fallback === webext.storage?.sync ? "sync" : "local",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    settings = normalizeSettings(stored?.[STORAGE_KEY]);
    logInfo("[QB_SUPPORT][settings] loaded", {
      storage: storageLabel,
      apiKeyLength: settings.chatApiKey?.length ?? 0,
      apiKeyEnabled: settings.chatApiKeyEnabled
    });
  }
  async function saveSettings(next, options) {
    settings = normalizeSettings(next);
    const area = getStorageArea(true);
    if (area) {
      try {
        await storageSet(area, { [STORAGE_KEY]: settings });
        logInfo("[QB_SUPPORT][settings] saved", {
          storage: area === webext.storage?.sync ? "sync" : "local",
          apiKeyLength: settings.chatApiKey?.length ?? 0,
          apiKeyEnabled: settings.chatApiKeyEnabled
        });
      } catch (error) {
        console.warn("[QB_SUPPORT][settings] save failed", {
          storage: area === webext.storage?.sync ? "sync" : "local",
          message: error instanceof Error ? error.message : String(error)
        });
        const fallback = getStorageArea(false);
        if (fallback && fallback !== area) {
          try {
            await storageSet(fallback, { [STORAGE_KEY]: settings });
            logInfo("[QB_SUPPORT][settings] saved fallback", {
              storage: fallback === webext.storage?.sync ? "sync" : "local",
              apiKeyLength: settings.chatApiKey?.length ?? 0,
              apiKeyEnabled: settings.chatApiKeyEnabled
            });
          } catch (fallbackError) {
            console.warn("[QB_SUPPORT][settings] save fallback failed", {
              storage: fallback === webext.storage?.sync ? "sync" : "local",
              message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            });
          }
        }
      }
    }
    applySettings();
    if (!options?.skipRemote) {
      scheduleRemoteSettingsSync();
    }
  }
  function initAuth() {
    if (authInitialized || window !== window.top) return;
    authInitialized = true;
    ensureAuthNetworkListeners();
    void refreshAuthState(false);
  }
  function updateAuthUI() {
    if (!authStatusField || !authSignInButton || !authSignOutButton || !authMetaField) return;
    authStatusField.classList.remove("is-error");
    if (!authProfile) {
      authStatusField.textContent = "未ログイン";
      authMetaField.textContent = "";
      authSignInButton.disabled = false;
      authSignInButton.style.display = "inline-flex";
      authSignOutButton.style.display = "none";
      if (authLoginButton) {
        authLoginButton.style.display = authLoginUrl ? "inline-flex" : "none";
        authLoginButton.disabled = !authLoginUrl;
      }
      return;
    }
    const name = authProfile.email || "Googleユーザー";
    authStatusField.textContent = `ログイン中: ${name}`;
    authMetaField.textContent = authProfile.email ?? "";
    authSignInButton.style.display = "none";
    authSignOutButton.style.display = "inline-flex";
    if (authLoginButton) authLoginButton.style.display = "none";
  }
  function setAuthStatus(message, isError) {
    if (!authStatusField) return;
    authStatusField.textContent = message;
    authStatusField.classList.toggle("is-error", isError);
  }
  function setAuthSyncStatus(message, isError) {
    if (!authSyncField) return;
    authSyncField.textContent = message;
    authSyncField.classList.toggle("is-error", isError);
  }
  async function loadStoredAuthSession() {
    const area = getStorageArea(false);
    if (!area) return null;
    try {
      const stored = await storageGet(area, AUTH_STORAGE_KEY);
      const raw = stored?.[AUTH_STORAGE_KEY];
      if (!raw || typeof raw !== "object") return null;
      const token = typeof raw.token === "string" ? raw.token : "";
      const profile = raw.profile;
      const expiresAt = typeof raw.expiresAt === "number" ? raw.expiresAt : 0;
      if (!token || !profile?.uid || !profile.email || !expiresAt) return null;
      return {
        token,
        profile: {
          uid: profile.uid,
          email: profile.email,
          source: profile.source === "firebase" ? "firebase" : "google"
        },
        expiresAt
      };
    } catch (error) {
      console.warn("[QB_SUPPORT][auth-session] load failed", error);
      return null;
    }
  }
  async function saveStoredAuthSession(session) {
    const area = getStorageArea(false);
    if (!area) return;
    try {
      await storageSet(area, { [AUTH_STORAGE_KEY]: session });
    } catch (error) {
      console.warn("[QB_SUPPORT][auth-session] save failed", error);
    }
  }
  async function clearStoredAuthSession() {
    const area = getStorageArea(false);
    if (!area) return;
    try {
      await storageSet(area, { [AUTH_STORAGE_KEY]: null });
    } catch (error) {
      console.warn("[QB_SUPPORT][auth-session] clear failed", error);
    }
  }
  function waitAuth(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
  async function fetchBackendAuthStart() {
    const url = resolveBackendAuthStartUrl();
    if (!url) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
    const response = await fetch(url);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`認証開始に失敗しました: ${response.status} ${detail}`);
    }
    const data = await response.json();
    if (!data?.authUrl || !data?.state) {
      throw new Error("認証開始のレスポンスが不正です。");
    }
    return data;
  }
  async function pollBackendAuthSession(state) {
    const startedAt = Date.now();
    const url = resolveBackendAuthSessionUrl(state);
    if (!url) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
    while (Date.now() - startedAt < AUTH_SESSION_TIMEOUT_MS) {
      const response = await fetch(url);
      if (response.status === 204) {
        await waitAuth(AUTH_SESSION_POLL_INTERVAL_MS);
        continue;
      }
      if (response.status === 404) {
        throw new Error("認証セッションが見つかりませんでした。もう一度お試しください。");
      }
      if (response.status === 410) {
        throw new Error("認証セッションの有効期限が切れました。もう一度お試しください。");
      }
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`認証セッション取得に失敗しました: ${response.status} ${detail}`);
      }
      const data = await response.json();
      if (!data?.token || !data?.profile?.uid) {
        throw new Error("認証セッションの内容が不正です。");
      }
      return data;
    }
    throw new Error("ログインが完了しませんでした。もう一度お試しください。");
  }
  async function requestBackendAuthSession() {
    authLoginUrl = null;
    if (authLoginButton) authLoginButton.style.display = "none";
    let popup = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
    } catch {
      popup = null;
    }
    let start2;
    try {
      start2 = await fetchBackendAuthStart();
    } catch (error) {
      if (popup && popup.close) popup.close();
      throw error;
    }
    if (popup) {
      try {
        popup.location.href = start2.authUrl;
      } catch (error) {
        console.warn("[QB_SUPPORT][auth-ui] popup navigation failed", error);
        popup = null;
      }
    }
    if (!popup) {
      console.warn("[QB_SUPPORT][auth-ui] popup blocked", { authUrl: start2.authUrl });
      setAuthStatus(
        "ポップアップがブロックされました。下の「ログインURLを開く」をタップしてください。",
        true
      );
      authLoginUrl = start2.authUrl;
      if (authLoginButton) {
        authLoginButton.style.display = "inline-flex";
        authLoginButton.disabled = false;
      }
      logInfo("[QB_SUPPORT][auth-ui] login url", start2.authUrl);
    } else {
      setAuthStatus("ブラウザでログインを完了してください", false);
    }
    const session = await pollBackendAuthSession(start2.state);
    const expiresAt = typeof session.expiresAt === "number" ? session.expiresAt : Date.now() + AUTH_SESSION_FALLBACK_MS;
    return { token: session.token, profile: session.profile, expiresAt };
  }
  async function fetchBackendAuthProfile(token) {
    const baseUrl = resolveBackendBaseUrl();
    if (!baseUrl) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
    const url = new URL(baseUrl);
    url.pathname = url.pathname.replace(/\/+$/, "") + "/auth/me";
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`認証に失敗しました: ${response.status} ${detail}`);
    }
    const data = await response.json();
    return data;
  }
  function applyAuthSession(session) {
    authLoginUrl = null;
    if (authLoginButton) authLoginButton.style.display = "none";
    authAccessToken = session.token;
    authProfile = session.profile;
    updateAuthUI();
    applyChatSettings();
  }
  async function restoreAuthSession() {
    const stored = await loadStoredAuthSession();
    if (!stored) return null;
    if (stored.expiresAt <= Date.now()) {
      await clearStoredAuthSession();
      return null;
    }
    try {
      const profile = await fetchBackendAuthProfile(stored.token);
      return {
        token: stored.token,
        profile,
        expiresAt: stored.expiresAt
      };
    } catch (error) {
      await clearStoredAuthSession();
      return null;
    }
  }
  async function ensureAuthAccessToken(interactive) {
    if (authAccessToken) return authAccessToken;
    const restored = await restoreAuthSession();
    if (restored) {
      applyAuthSession(restored);
      return restored.token;
    }
    if (!interactive) {
      throw new Error("ログインが必要です。");
    }
    const session = await requestBackendAuthSession();
    await saveStoredAuthSession(session);
    applyAuthSession(session);
    return session.token;
  }
  async function refreshAuthState(interactive) {
    try {
      const session = interactive ? await requestBackendAuthSession() : await restoreAuthSession();
      if (!session) {
        if (!interactive) {
          authAccessToken = null;
          authProfile = null;
          updateAuthUI();
          setAuthSyncStatus("未ログイン", false);
          return;
        }
        throw new Error("ログインが必要です。");
      }
      await saveStoredAuthSession(session);
      applyAuthSession(session);
      if (remoteSettingsLoadedFor !== session.profile.uid) {
        remoteSettingsLoadedFor = session.profile.uid;
        void syncSettingsFromRemote();
      } else {
        setAuthSyncStatus("同期済み", false);
      }
    } catch (error) {
      if (!interactive) {
        authAccessToken = null;
        authProfile = null;
        updateAuthUI();
        setAuthSyncStatus("未ログイン", false);
        return;
      }
      throw error;
    }
  }
  async function handleAuthSignIn() {
    const button = authSignInButton;
    if (button) button.disabled = true;
    setAuthStatus("ログイン中...", false);
    logInfo("[QB_SUPPORT][auth] ORIGIN", location.origin);
    logInfo("[QB_SUPPORT][auth] HREF", location.href);
    logInfo("[QB_SUPPORT][auth] EXT_ID", webext.runtime?.id ?? null);
    try {
      await refreshAuthState(true);
      setAuthStatus("ログイン完了", false);
      logInfo("[QB_SUPPORT][auth] sign-in success");
    } catch (error) {
      logInfo("[QB_SUPPORT][auth] AUTH_ERR_RAW", error);
      const err = error;
      logInfo("[QB_SUPPORT][auth] AUTH_ERR_MSG", err?.message);
      logInfo("[QB_SUPPORT][auth] AUTH_ERR_STACK", err?.stack);
      const detail = err?.message ? err.message : String(error);
      setAuthStatus(`ログイン失敗: ${detail}`, true);
      throw error;
    } finally {
      if (button) button.disabled = false;
    }
  }
  async function handleAuthSignOut() {
    const button = authSignOutButton;
    if (button) button.disabled = true;
    try {
      authAccessToken = null;
      authProfile = null;
      remoteSettingsLoadedFor = null;
      await clearStoredAuthSession();
      setAuthStatus("ログアウトしました", false);
      updateAuthUI();
      applyChatSettings();
    } catch (error) {
      console.warn("[QB_SUPPORT][auth]", error);
      setAuthStatus(`ログアウト失敗: ${String(error)}`, true);
    } finally {
      if (button) button.disabled = false;
    }
  }
  function scheduleRemoteSettingsSync() {
    if (!authProfile || window !== window.top) return;
    if (!navigator.onLine) {
      authSyncPending = true;
      setAuthSyncStatus("オフライン: 同期保留", false);
      return;
    }
    if (authSyncTimer) window.clearTimeout(authSyncTimer);
    authSyncTimer = window.setTimeout(() => {
      void syncSettingsToRemote();
    }, 700);
  }
  async function syncSettingsFromRemote() {
    setAuthSyncStatus("同期中...", false);
    try {
      const remoteSettings = await fetchRemoteSettings();
      logInfo("[QB_SUPPORT][auth-sync] pull", {
        hasSettings: Boolean(remoteSettings),
        apiKeyLength: remoteSettings && typeof remoteSettings.chatApiKey === "string" ? remoteSettings.chatApiKey.length : 0
      });
      if (remoteSettings) {
        const merged = normalizeSettings({
          ...settings,
          ...remoteSettings,
          chatOpen: settings.chatOpen
        });
        await saveSettings(merged, { skipRemote: true });
      } else {
        await syncSettingsToRemote();
      }
      setAuthSyncStatus("同期完了", false);
    } catch (error) {
      console.warn("[QB_SUPPORT][auth-sync]", error);
      if (isOfflineSyncError(error)) {
        authRemoteFetchPending = true;
        setAuthSyncStatus("オフライン: 同期保留", false);
        return;
      }
      setAuthSyncStatus(`同期エラー: ${String(error)}`, true);
    }
  }
  async function fetchRemoteSettings() {
    if (!authProfile) return null;
    const token = await ensureAuthAccessToken(false);
    const url = resolveBackendSettingsUrl();
    if (!url) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`設定取得に失敗しました: ${response.status} ${detail}`);
    }
    const data = await response.json();
    if (!data?.settings || typeof data.settings !== "object") return null;
    return data.settings;
  }
  function buildRemoteSettingsPayload(current) {
    const { chatOpen, ...rest } = current;
    return rest;
  }
  async function syncSettingsToRemote() {
    if (!authProfile) return;
    if (authSyncInFlight) {
      authSyncPending = true;
      return;
    }
    if (!navigator.onLine) {
      authSyncPending = true;
      setAuthSyncStatus("オフライン: 同期保留", false);
      return;
    }
    authSyncInFlight = true;
    setAuthSyncStatus("同期中...", false);
    try {
      logInfo("[QB_SUPPORT][auth-sync] push", {
        apiKeyLength: settings.chatApiKey?.length ?? 0,
        apiKeyEnabled: settings.chatApiKeyEnabled
      });
      const token = await ensureAuthAccessToken(false);
      const url = resolveBackendSettingsUrl();
      if (!url) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          settings: buildRemoteSettingsPayload(settings),
          schemaVersion: FIREBASE_SETTINGS_VERSION,
          updatedAt: Date.now()
        })
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`設定保存に失敗しました: ${response.status} ${detail}`);
      }
      setAuthSyncStatus("同期完了", false);
    } catch (error) {
      console.warn("[QB_SUPPORT][auth-sync]", error);
      if (isOfflineSyncError(error)) {
        authSyncPending = true;
        setAuthSyncStatus("オフライン: 同期保留", false);
        return;
      }
      setAuthSyncStatus(`同期エラー: ${String(error)}`, true);
    } finally {
      authSyncInFlight = false;
      if (authSyncPending) {
        authSyncPending = false;
        void syncSettingsToRemote();
      }
    }
  }
  function ensureAuthNetworkListeners() {
    if (authNetworkBound) return;
    authNetworkBound = true;
    window.addEventListener("online", () => {
      if (!authProfile) return;
      if (authRemoteFetchPending) {
        authRemoteFetchPending = false;
        void syncSettingsFromRemote();
        return;
      }
      if (authSyncPending) {
        authSyncPending = false;
        void syncSettingsToRemote();
      }
    });
    window.addEventListener("offline", () => {
      if (!authProfile) return;
      setAuthSyncStatus("オフライン: 同期保留", false);
    });
  }
  function isOfflineSyncError(error) {
    if (!navigator.onLine) return true;
    const message = String(error ?? "");
    return message.includes("client is offline") || message.includes("offline") || message.includes("unavailable");
  }
  function ensureUI() {
    if (document.getElementById(ROOT_ID)) {
      root = document.getElementById(ROOT_ID);
      return;
    }
    root = document.createElement("div");
    root.id = ROOT_ID;
    panel = document.createElement("div");
    panel.className = "qb-support-panel";
    const header = document.createElement("div");
    header.className = "qb-support-header";
    const title = document.createElement("div");
    title.className = "qb-support-title";
    title.textContent = "QB Support Settings";
    const subtitle = document.createElement("div");
    subtitle.className = "qb-support-subtitle";
    subtitle.textContent = "ショートカット & サイドバー";
    const titleWrap = document.createElement("div");
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);
    const settingsSection = document.createElement("div");
    settingsSection.className = "qb-support-section";
    settingsSection.appendChild(makeSectionTitle("表示"));
    displaySectionEl = settingsSection;
    setSectionCollapsed(settingsSection, true);
    shortcutsToggle = document.createElement("input");
    shortcutsToggle.type = "checkbox";
    shortcutsToggle.className = "qb-support-toggle-input";
    shortcutsToggle.addEventListener("change", () => {
      void saveSettings({
        ...settings,
        shortcutsEnabled: shortcutsToggle?.checked ?? true
      });
    });
    const shortcutsLabel = document.createElement("label");
    shortcutsLabel.className = "qb-support-toggle";
    shortcutsLabel.appendChild(shortcutsToggle);
    shortcutsLabel.appendChild(makeSpan("ショートカット有効"));
    debugToggle = document.createElement("input");
    debugToggle.type = "checkbox";
    debugToggle.className = "qb-support-toggle-input";
    debugToggle.addEventListener("change", () => {
      void saveSettings({
        ...settings,
        debugEnabled: debugToggle?.checked ?? false
      });
    });
    const searchSwitch = createSwitch("検索バー表示", settings.searchVisible, (checked) => {
      void saveSettings({
        ...settings,
        searchVisible: checked
      });
    });
    searchToggle = searchSwitch.input;
    const searchLabel = searchSwitch.label;
    const noteSwitch = createSwitch("ノート表示", settings.noteVisible, (checked) => {
      void saveSettings({
        ...settings,
        noteVisible: checked
      });
    });
    noteToggle = noteSwitch.input;
    const noteLabel = noteSwitch.label;
    pageAccentToggle = document.createElement("input");
    pageAccentToggle.type = "checkbox";
    pageAccentToggle.className = "qb-support-toggle-input";
    pageAccentToggle.addEventListener("change", () => {
      void saveSettings({
        ...settings,
        pageAccentEnabled: pageAccentToggle?.checked ?? false
      });
    });
    const pageAccentLabel = document.createElement("label");
    pageAccentLabel.className = "qb-support-toggle";
    pageAccentLabel.appendChild(pageAccentToggle);
    pageAccentLabel.appendChild(makeSpan("ページに緑アクセント"));
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = settings.themePreference === "dark" || settings.themePreference === "system" && prefersDark;
    const themeSwitch = createSwitch("ダークモード", isDark, (checked) => {
      const nextTheme = checked ? "dark" : "light";
      void saveSettings({
        ...settings,
        themePreference: nextTheme
      });
    });
    themeToggle = themeSwitch.input;
    const themeLabel = themeSwitch.label;
    const shortcutSection = document.createElement("div");
    shortcutSection.className = "qb-support-section";
    shortcutSection.appendChild(makeSectionTitle("ショートカット"));
    shortcutSectionEl = shortcutSection;
    setSectionCollapsed(shortcutSection, true);
    const modifierLabelFromKey = (rawKey) => {
      const lower = rawKey.toLowerCase();
      if (lower === "control") return "Ctrl";
      if (lower === "alt") return "Alt";
      if (lower === "shift") return "Shift";
      if (lower === "meta") return "Meta";
      return "";
    };
    const buildKeyField = (labelText) => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "qb-support-input";
      input.placeholder = "例: A / Ctrl+A";
      input.addEventListener("keydown", (event) => {
        if (event.key === "Tab") return;
        if (event.key === "Backspace" || event.key === "Delete") {
          input.value = "";
          return;
        }
        event.preventDefault();
        const shortcut = shortcutFromEvent(event);
        if (shortcut) {
          input.value = shortcut;
          return;
        }
        const fallback = modifierLabelFromKey(event.key);
        if (fallback) input.value = fallback;
      });
      const label = document.createElement("label");
      label.className = "qb-support-field";
      label.appendChild(makeSpan(labelText));
      label.appendChild(input);
      return { label, input };
    };
    const buildShortcutField = (labelText, placeholder = "例: Ctrl+S") => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "qb-support-input";
      input.placeholder = placeholder;
      input.addEventListener("keydown", (event) => {
        if (event.key === "Tab") return;
        if (event.key === "Backspace" || event.key === "Delete") {
          input.value = "";
          return;
        }
        event.preventDefault();
        const shortcut = shortcutFromEvent(event);
        if (shortcut) {
          input.value = shortcut;
          return;
        }
        const fallback = modifierLabelFromKey(event.key);
        if (fallback) input.value = fallback;
      });
      const label = document.createElement("label");
      label.className = "qb-support-field";
      label.appendChild(makeSpan(labelText));
      label.appendChild(input);
      return { label, input };
    };
    const navPrevField = buildKeyField("前へ");
    const navNextField = buildKeyField("次へ");
    const revealField = buildShortcutField("解答", "例: Ctrl+S");
    navPrevInput = navPrevField.input;
    navNextInput = navNextField.input;
    revealInput = revealField.input;
    const optionsWrap = document.createElement("div");
    optionsWrap.className = "qb-support-options";
    optionInputs = [];
    ["A", "B", "C", "D", "E"].forEach((label) => {
      const field = buildKeyField(label);
      optionInputs.push(field.input);
      optionsWrap.appendChild(field.label);
    });
    const toggleShortcutLabel = document.createElement("label");
    toggleShortcutLabel.className = "qb-support-toggle";
    toggleShortcutLabel.appendChild(shortcutsToggle);
    toggleShortcutLabel.appendChild(makeSpan("ショートカット有効"));
    statusField = document.createElement("div");
    statusField.className = "qb-support-status";
    settingsSection.appendChild(searchLabel);
    settingsSection.appendChild(noteLabel);
    settingsSection.appendChild(pageAccentLabel);
    settingsSection.appendChild(themeLabel);
    settingsSection.appendChild(statusField);
    shortcutSection.appendChild(toggleShortcutLabel);
    shortcutSection.appendChild(navPrevField.label);
    shortcutSection.appendChild(navNextField.label);
    shortcutSection.appendChild(revealField.label);
    shortcutSection.appendChild(optionsWrap);
    const templateSection = document.createElement("div");
    templateSection.className = "qb-support-section";
    templateSection.appendChild(makeSectionTitle("チャットテンプレ"));
    templateSectionEl = templateSection;
    setSectionCollapsed(templateSection, true);
    const templateControls = document.createElement("div");
    templateControls.className = "qb-support-template-controls";
    templateCountLabel = document.createElement("span");
    templateCountLabel.className = "qb-support-template-count";
    templateAddButton = document.createElement("button");
    templateAddButton.type = "button";
    templateAddButton.className = "qb-support-template-control";
    templateAddButton.textContent = "追加";
    applyButtonVariant(templateAddButton, "primary");
    templateAddButton.addEventListener("click", () => {
      updateTemplateCount(settings.chatTemplateCount + 1);
    });
    templateRemoveButton = document.createElement("button");
    templateRemoveButton.type = "button";
    templateRemoveButton.className = "qb-support-template-control";
    templateRemoveButton.textContent = "削除";
    applyButtonVariant(templateRemoveButton, "ghost");
    templateRemoveButton.addEventListener("click", () => {
      updateTemplateCount(settings.chatTemplateCount - 1);
    });
    templateControls.appendChild(templateCountLabel);
    templateControls.appendChild(templateAddButton);
    templateControls.appendChild(templateRemoveButton);
    templateSection.appendChild(templateControls);
    const templateList = document.createElement("div");
    templateList.className = "qb-support-template-list";
    chatTemplateRows = [];
    const buildTemplateField = (labelText, input) => {
      const label = document.createElement("label");
      label.className = "qb-support-field qb-support-template-field";
      label.appendChild(makeSpan(labelText));
      label.appendChild(input);
      return label;
    };
    for (let i = 0; i < 5; i += 1) {
      const row = document.createElement("div");
      row.className = "qb-support-template-row";
      const headerRow = document.createElement("div");
      headerRow.className = "qb-support-template-header";
      const titleEl = document.createElement("div");
      titleEl.className = "qb-support-template-title";
      titleEl.textContent = `テンプレ${i + 1}`;
      const enabledInput = document.createElement("input");
      enabledInput.type = "checkbox";
      enabledInput.className = "qb-support-toggle-input";
      const enabledLabel = document.createElement("label");
      enabledLabel.className = "qb-support-toggle";
      enabledLabel.appendChild(enabledInput);
      enabledLabel.appendChild(makeSpan("有効"));
      headerRow.appendChild(titleEl);
      headerRow.appendChild(enabledLabel);
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.className = "qb-support-input qb-support-template-label";
      labelInput.placeholder = "ボタン名";
      const shortcutInput = document.createElement("input");
      shortcutInput.type = "text";
      shortcutInput.className = "qb-support-input qb-support-template-shortcut";
      shortcutInput.placeholder = "例: Ctrl+Z";
      shortcutInput.addEventListener("keydown", (event) => {
        if (event.key === "Tab") return;
        if (event.key === "Backspace" || event.key === "Delete") {
          shortcutInput.value = "";
          return;
        }
        event.preventDefault();
        const shortcut = shortcutFromEvent(event);
        if (shortcut) {
          shortcutInput.value = shortcut;
          return;
        }
        const fallback = modifierLabelFromKey(event.key);
        if (fallback) shortcutInput.value = fallback;
      });
      const promptInput = document.createElement("textarea");
      promptInput.className = "qb-support-template-prompt";
      promptInput.rows = 3;
      promptInput.placeholder = "プロンプト";
      const fields = document.createElement("div");
      fields.className = "qb-support-template-fields";
      fields.appendChild(buildTemplateField("ボタン名", labelInput));
      fields.appendChild(buildTemplateField("ショートカット", shortcutInput));
      fields.appendChild(buildTemplateField("プロンプト", promptInput));
      row.appendChild(headerRow);
      row.appendChild(fields);
      templateList.appendChild(row);
      chatTemplateRows.push({
        container: row,
        enabled: enabledInput,
        label: labelInput,
        shortcut: shortcutInput,
        prompt: promptInput
      });
    }
    templateSection.appendChild(templateList);
    const explanationSection = document.createElement("div");
    explanationSection.className = "qb-support-section";
    explanationSection.appendChild(makeSectionTitle("プロンプト"));
    explanationSectionEl = explanationSection;
    setSectionCollapsed(explanationSection, true);
    const commonPromptLabel = document.createElement("label");
    commonPromptLabel.className = "qb-support-field qb-support-template-field";
    commonPromptLabel.appendChild(makeSpan("共通プロンプト"));
    commonPromptInput = document.createElement("textarea");
    commonPromptInput.className = "qb-support-template-prompt qb-support-common-prompt";
    commonPromptInput.rows = 3;
    commonPromptInput.placeholder = "全ての会話に付与する共通プロンプト";
    commonPromptLabel.appendChild(commonPromptInput);
    explanationLevelSelect = createOverlaySelect(
      Object.entries(EXPLANATION_LEVEL_LABELS).map(([value, label]) => ({
        value,
        label
      })),
      "qb-support-explanation-level"
    );
    const explanationSelectLabel = document.createElement("label");
    explanationSelectLabel.className = "qb-support-field";
    explanationSelectLabel.appendChild(makeSpan("レベル"));
    explanationSelectLabel.appendChild(explanationLevelSelect);
    const buildExplanationPromptField = (labelText, key) => {
      const textarea = document.createElement("textarea");
      textarea.className = "qb-support-template-prompt qb-support-explanation-prompt";
      textarea.rows = 3;
      textarea.placeholder = "プロンプト";
      explanationPromptInputs[key] = textarea;
      const label = document.createElement("label");
      label.className = "qb-support-field qb-support-template-field";
      label.appendChild(makeSpan(labelText));
      label.appendChild(textarea);
      return label;
    };
    const promptWrap = document.createElement("div");
    promptWrap.className = "qb-support-template-fields qb-support-explanation-prompts";
    promptWrap.appendChild(
      buildExplanationPromptField("高校生でもわかる", "highschool")
    );
    promptWrap.appendChild(buildExplanationPromptField("医学部低学年", "med-junior"));
    promptWrap.appendChild(
      buildExplanationPromptField("医学部高学年〜研修医", "med-senior")
    );
    explanationSection.appendChild(commonPromptLabel);
    explanationSection.appendChild(explanationSelectLabel);
    explanationSection.appendChild(promptWrap);
    const authSection = document.createElement("div");
    authSection.className = "qb-support-section";
    authSection.appendChild(makeSectionTitle("認証"));
    authSectionEl = authSection;
    setSectionCollapsed(authSection, false);
    authStatusField = document.createElement("div");
    authStatusField.className = "qb-support-auth-status";
    authStatusField.textContent = "未ログイン";
    authMetaField = document.createElement("div");
    authMetaField.className = "qb-support-auth-meta";
    authSyncField = document.createElement("div");
    authSyncField.className = "qb-support-auth-sync";
    authSyncField.textContent = "未ログイン";
    authSignInButton = document.createElement("button");
    authSignInButton.type = "button";
    authSignInButton.className = "qb-support-save qb-support-auth-button";
    applyButtonVariant(authSignInButton, "primary");
    authSignInButton.textContent = "Googleでログイン";
    authSignInButton.addEventListener("click", () => {
      void handleAuthSignIn();
    });
    authLoginButton = document.createElement("button");
    authLoginButton.type = "button";
    authLoginButton.className = "qb-support-save qb-support-auth-button qb-support-auth-open";
    applyButtonVariant(authLoginButton, "ghost");
    authLoginButton.textContent = "ログインURLを開く";
    authLoginButton.style.display = "none";
    authLoginButton.addEventListener("click", () => {
      if (!authLoginUrl) return;
      const opened = window.open(authLoginUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        setAuthStatus(
          "新規タブを開けませんでした。Safariのポップアップ設定を確認してください。",
          true
        );
      }
    });
    authSignOutButton = document.createElement("button");
    authSignOutButton.type = "button";
    authSignOutButton.className = "qb-support-save qb-support-auth-button qb-support-auth-signout";
    applyButtonVariant(authSignOutButton, "danger");
    authSignOutButton.textContent = "ログアウト";
    authSignOutButton.style.display = "none";
    authSignOutButton.addEventListener("click", () => {
      void handleAuthSignOut();
    });
    const authActions = document.createElement("div");
    authActions.className = "qb-support-auth-actions";
    authActions.appendChild(authSignInButton);
    authActions.appendChild(authLoginButton);
    authActions.appendChild(authSignOutButton);
    authSection.appendChild(authStatusField);
    authSection.appendChild(authMetaField);
    authSection.appendChild(authSyncField);
    authSection.appendChild(authActions);
    panel.appendChild(header);
    panel.appendChild(settingsSection);
    panel.appendChild(shortcutSection);
    panel.appendChild(templateSection);
    panel.appendChild(explanationSection);
    panel.appendChild(authSection);
    launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "qb-support-launcher";
    launcher.title = "QB設定";
    launcher.setAttribute("aria-label", "QB設定");
    launcher.appendChild(createGearIcon());
    launcher.style.display = "none";
    launcher.addEventListener("click", () => {
      if (!chatSettingsPanel) {
        ensureChatUI();
      }
      if (!settings.chatOpen) {
        void saveSettings({ ...settings, chatOpen: true }).then(() => {
          toggleChatSettings(true);
        });
      } else {
        toggleChatSettings(true);
      }
    });
    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);
  }
  function ensureChatUI() {
    if (document.getElementById(CHAT_ROOT_ID)) {
      chatRoot = document.getElementById(CHAT_ROOT_ID);
      chatPanel = chatRoot.querySelector(".qb-support-chat-panel");
      chatMessagesEl = chatRoot.querySelector(
        ".qb-support-chat-messages"
      );
      chatInput = chatRoot.querySelector(
        ".qb-support-chat-textarea"
      );
      chatSendButton = chatRoot.querySelector(
        ".qb-support-chat-send"
      );
      chatStatusField = chatRoot.querySelector(
        ".qb-support-chat-status"
      );
      chatApiInput = chatRoot.querySelector(
        ".qb-support-chat-api-key"
      );
      if (!chatApiInput) {
        chatApiInput = chatRoot.querySelector(
          ".qb-support-chat-api input"
        );
      }
      chatApiKeyToggle = chatRoot.querySelector(
        ".qb-support-chat-api-key-toggle"
      );
      chatApiKeyVisibilityButton = chatRoot.querySelector(
        ".qb-support-chat-api-visibility"
      );
      chatApiKeyStatus = chatRoot.querySelector(
        ".qb-support-chat-api-key-status"
      );
      const modelNode = chatRoot.querySelector(".qb-support-chat-model");
      chatModelInput = modelNode instanceof HTMLSelectElement ? modelNode : null;
      const headerModelNode = chatRoot.querySelector(".qb-support-chat-model-inline");
      chatHeaderModelSelect = headerModelNode instanceof HTMLSelectElement ? headerModelNode : null;
      const headerNode = chatRoot.querySelector(".qb-support-chat-header");
      if (headerNode instanceof HTMLDivElement) {
        let titleWrap2 = headerNode.querySelector(".qb-support-chat-title-wrap");
        if (!(titleWrap2 instanceof HTMLDivElement)) {
          const legacyTitle = headerNode.querySelector(".qb-support-chat-title");
          const wrap = document.createElement("div");
          wrap.className = "qb-support-chat-title-wrap";
          if (legacyTitle) {
            wrap.appendChild(legacyTitle);
          }
          headerNode.insertBefore(wrap, headerNode.firstChild);
          titleWrap2 = wrap;
        }
        if (titleWrap2 instanceof HTMLDivElement && !chatHeaderModelSelect) {
          chatHeaderModelSelect = createOverlaySelect(
            CHAT_MODEL_OPTIONS.map((model) => ({ value: model, label: model })),
            "qb-support-chat-model-inline"
          );
          chatHeaderModelSelect.value = settings.chatModel;
          chatHeaderModelSelect.setAttribute("aria-label", "モデル選択");
          titleWrap2.appendChild(chatHeaderModelSelect);
        }
      }
      chatSettingsPanel = chatRoot.querySelector(
        ".qb-support-chat-settings"
      );
      chatSettingsButton = chatRoot.querySelector(
        ".qb-support-chat-settings-btn"
      );
      if (chatApiInput) {
        chatApiInput.classList.add("qb-support-chat-api-key");
        if (chatApiInput.dataset.handlers !== "true") {
          chatApiInput.dataset.handlers = "true";
          chatApiInput.addEventListener("input", () => {
            updateChatApiKeyStatus();
            if (chatApiKeyVisibilityButton) {
              chatApiKeyVisibilityButton.disabled = !chatApiInput?.value.trim();
            }
          });
        }
      }
      const apiSaveButton = chatRoot.querySelector(".qb-support-chat-api-save");
      if (apiSaveButton instanceof HTMLButtonElement) {
        apiSaveButton.remove();
      }
      const modelSaveButton = chatRoot.querySelector(".qb-support-chat-model-save");
      if (modelSaveButton instanceof HTMLButtonElement) {
        modelSaveButton.remove();
      }
      const apiSection2 = chatRoot.querySelector(".qb-support-chat-api");
      if (apiSection2) {
        let apiKeyRow2 = apiSection2.querySelector(
          ".qb-support-chat-api-row"
        );
        if (!apiKeyRow2) {
          apiKeyRow2 = document.createElement("div");
          apiKeyRow2.className = "qb-support-chat-api-row";
          if (chatApiInput && chatApiInput.parentElement === apiSection2) {
            apiSection2.insertBefore(apiKeyRow2, chatApiInput);
            apiKeyRow2.appendChild(chatApiInput);
          } else {
            apiSection2.appendChild(apiKeyRow2);
            if (chatApiInput) apiKeyRow2.appendChild(chatApiInput);
          }
        }
        if (!chatApiKeyVisibilityButton) {
          chatApiKeyVisibilityButton = document.createElement("button");
          chatApiKeyVisibilityButton.type = "button";
          chatApiKeyVisibilityButton.className = "qb-support-chat-api-visibility";
          chatApiKeyVisibilityButton.textContent = "表示";
        }
        if (chatApiKeyVisibilityButton) {
          applyButtonVariant(chatApiKeyVisibilityButton, "ghost");
        }
        if (apiKeyRow2 && chatApiKeyVisibilityButton && !apiKeyRow2.contains(chatApiKeyVisibilityButton)) {
          apiKeyRow2.appendChild(chatApiKeyVisibilityButton);
        }
        if (chatApiKeyVisibilityButton && chatApiKeyVisibilityButton.dataset.handlers !== "true") {
          chatApiKeyVisibilityButton.dataset.handlers = "true";
          chatApiKeyVisibilityButton.addEventListener("click", () => {
            chatApiKeyVisible = !chatApiKeyVisible;
            if (chatApiInput) {
              chatApiInput.type = chatApiKeyVisible ? "text" : "password";
            }
            if (chatApiKeyVisibilityButton) {
              chatApiKeyVisibilityButton.textContent = chatApiKeyVisible ? "非表示" : "表示";
            }
          });
        }
        if (!chatApiKeyStatus) {
          chatApiKeyStatus = document.createElement("div");
          chatApiKeyStatus.className = "qb-support-chat-api-key-status";
        }
        if (chatApiKeyStatus && !apiSection2.contains(chatApiKeyStatus)) {
          apiSection2.appendChild(chatApiKeyStatus);
        }
        if (!chatApiKeyToggle) {
          const apiKeyToggleLabel2 = document.createElement("label");
          apiKeyToggleLabel2.className = "qb-support-toggle qb-support-chat-api-toggle";
          chatApiKeyToggle = document.createElement("input");
          chatApiKeyToggle.type = "checkbox";
          chatApiKeyToggle.className = "qb-support-toggle-input qb-support-chat-api-key-toggle";
          apiKeyToggleLabel2.appendChild(chatApiKeyToggle);
          apiKeyToggleLabel2.appendChild(makeSpan("手動APIキーを使用"));
          apiSection2.appendChild(apiKeyToggleLabel2);
        }
        if (chatApiKeyToggle && chatApiKeyToggle.dataset.handlers !== "true") {
          chatApiKeyToggle.dataset.handlers = "true";
          chatApiKeyToggle.addEventListener("change", () => {
            void saveSettings({
              ...settings,
              chatApiKeyEnabled: chatApiKeyToggle?.checked ?? true
            });
          });
        }
      }
      if (!chatModelInput) {
        if (apiSection2) {
          let modelLabel2 = apiSection2.querySelector(
            ".qb-support-chat-model-label"
          );
          if (!modelLabel2) {
            modelLabel2 = document.createElement("label");
            modelLabel2.textContent = "Model";
            modelLabel2.className = "qb-support-chat-api-label qb-support-chat-model-label";
            apiSection2.appendChild(modelLabel2);
          }
          const existingInput = apiSection2.querySelector(".qb-support-chat-model");
          if (existingInput && !(existingInput instanceof HTMLSelectElement)) {
            existingInput.remove();
          }
          chatModelInput = createChatModelSelect();
          apiSection2.appendChild(chatModelInput);
        }
      }
      if (!chatSettingsButton) {
        const actions2 = chatRoot.querySelector(".qb-support-chat-actions");
        if (actions2) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "qb-support-chat-settings-btn";
          button.appendChild(createGearIcon());
          button.setAttribute("aria-label", "チャット設定");
          actions2.insertBefore(button, actions2.firstChild);
          chatSettingsButton = button;
        }
      }
      if (!chatSettingsPanel) {
        const existingPanel = chatRoot.querySelector(".qb-support-chat-settings");
        if (existingPanel instanceof HTMLDivElement) {
          chatSettingsPanel = existingPanel;
        } else {
          const panel2 = document.createElement("div");
          panel2.className = "qb-support-chat-settings";
          panel2.dataset.open = "false";
          const apiSection3 = chatRoot.querySelector(".qb-support-chat-api");
          if (apiSection3) {
            apiSection3.classList.add("qb-support-chat-settings-section");
            panel2.appendChild(apiSection3);
          }
          if (chatPanel && chatMessagesEl) {
            chatPanel.insertBefore(panel2, chatMessagesEl);
          } else {
            chatPanel?.appendChild(panel2);
          }
          chatSettingsPanel = panel2;
        }
      }
      if (chatSettingsPanel) {
        let closeButton = chatSettingsPanel.querySelector(
          ".qb-support-chat-settings-close"
        );
        if (!closeButton) {
          closeButton = document.createElement("button");
          closeButton.type = "button";
          closeButton.className = "qb-support-chat-settings-close";
          closeButton.textContent = "×";
          closeButton.setAttribute("aria-label", "設定を閉じる");
          closeButton.addEventListener("click", () => {
            toggleChatSettings(false);
          });
          chatSettingsPanel.appendChild(closeButton);
        }
        chatSettingsOpen = chatSettingsPanel.dataset.open === "true";
      }
      attachChatModelHandlers();
      ensureChatToggle();
      ensureChatResizer();
      ensureChatTemplates();
      if (chatSettingsButton) {
        chatSettingsButton.dataset.shortcut = "Ctrl+S";
        applyButtonVariant(chatSettingsButton, "ghost");
      }
      const chatNewButton = chatRoot.querySelector(
        ".qb-support-chat-new"
      );
      applyButtonVariant(chatNewButton, "ghost");
      applyButtonVariant(chatSendButton, "primary");
      attachChatSettingsHandlers();
      populateChatSettingsPanel();
      return;
    }
    chatRoot = document.createElement("div");
    chatRoot.id = CHAT_ROOT_ID;
    chatPanel = document.createElement("div");
    chatPanel.className = "qb-support-chat-panel";
    const header = document.createElement("div");
    header.className = "qb-support-chat-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "qb-support-chat-title-wrap";
    const title = document.createElement("div");
    title.className = "qb-support-chat-title";
    title.textContent = "QB Chat";
    chatHeaderModelSelect = createOverlaySelect(
      CHAT_MODEL_OPTIONS.map((model) => ({ value: model, label: model })),
      "qb-support-chat-model-inline"
    );
    chatHeaderModelSelect.value = settings.chatModel;
    chatHeaderModelSelect.setAttribute("aria-label", "モデル選択");
    titleWrap.appendChild(title);
    titleWrap.appendChild(chatHeaderModelSelect);
    const actions = document.createElement("div");
    actions.className = "qb-support-chat-actions";
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "qb-support-chat-settings-btn";
    settingsButton.appendChild(createGearIcon());
    settingsButton.setAttribute("aria-label", "チャット設定");
    chatSettingsButton = settingsButton;
    settingsButton.dataset.shortcut = "Ctrl+S";
    applyButtonVariant(settingsButton, "ghost");
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "qb-support-chat-new";
    resetButton.textContent = "新規";
    resetButton.dataset.shortcut = "Ctrl+N";
    resetButton.addEventListener("click", () => {
      resetChatHistory("会話をリセットしました");
    });
    applyButtonVariant(resetButton, "ghost");
    actions.appendChild(settingsButton);
    actions.appendChild(resetButton);
    header.appendChild(titleWrap);
    header.appendChild(actions);
    chatSettingsPanel = document.createElement("div");
    chatSettingsPanel.className = "qb-support-chat-settings";
    chatSettingsPanel.dataset.open = "false";
    const settingsCloseButton = document.createElement("button");
    settingsCloseButton.type = "button";
    settingsCloseButton.className = "qb-support-chat-settings-close";
    settingsCloseButton.textContent = "×";
    settingsCloseButton.setAttribute("aria-label", "設定を閉じる");
    settingsCloseButton.addEventListener("click", () => {
      toggleChatSettings(false);
    });
    chatSettingsPanel.appendChild(settingsCloseButton);
    const apiSection = document.createElement("div");
    apiSection.className = "qb-support-chat-api qb-support-chat-settings-section";
    const apiLabel = document.createElement("label");
    apiLabel.textContent = "OpenAI API Key";
    apiLabel.className = "qb-support-chat-api-label";
    chatApiInput = document.createElement("input");
    chatApiInput.type = "password";
    chatApiInput.className = "qb-support-chat-input qb-support-chat-api-key";
    chatApiInput.placeholder = "sk-...";
    chatApiInput.addEventListener("input", () => {
      updateChatApiKeyStatus();
      if (chatApiKeyVisibilityButton) {
        chatApiKeyVisibilityButton.disabled = !chatApiInput?.value.trim();
      }
    });
    const apiKeyRow = document.createElement("div");
    apiKeyRow.className = "qb-support-chat-api-row";
    apiKeyRow.appendChild(chatApiInput);
    chatApiKeyVisibilityButton = document.createElement("button");
    chatApiKeyVisibilityButton.type = "button";
    chatApiKeyVisibilityButton.className = "qb-support-chat-api-visibility";
    chatApiKeyVisibilityButton.textContent = "表示";
    applyButtonVariant(chatApiKeyVisibilityButton, "ghost");
    chatApiKeyVisibilityButton.addEventListener("click", () => {
      chatApiKeyVisible = !chatApiKeyVisible;
      if (chatApiInput) {
        chatApiInput.type = chatApiKeyVisible ? "text" : "password";
      }
      if (chatApiKeyVisibilityButton) {
        chatApiKeyVisibilityButton.textContent = chatApiKeyVisible ? "非表示" : "表示";
      }
    });
    apiKeyRow.appendChild(chatApiKeyVisibilityButton);
    chatApiKeyStatus = document.createElement("div");
    chatApiKeyStatus.className = "qb-support-chat-api-key-status";
    const apiKeyToggleLabel = document.createElement("label");
    apiKeyToggleLabel.className = "qb-support-toggle qb-support-chat-api-toggle";
    chatApiKeyToggle = document.createElement("input");
    chatApiKeyToggle.type = "checkbox";
    chatApiKeyToggle.className = "qb-support-toggle-input qb-support-chat-api-key-toggle";
    apiKeyToggleLabel.appendChild(chatApiKeyToggle);
    apiKeyToggleLabel.appendChild(makeSpan("手動APIキーを使用"));
    chatApiKeyToggle.addEventListener("change", () => {
      void saveSettings({
        ...settings,
        chatApiKeyEnabled: chatApiKeyToggle?.checked ?? true
      });
    });
    const modelLabel = document.createElement("label");
    modelLabel.textContent = "Model";
    modelLabel.className = "qb-support-chat-api-label qb-support-chat-model-label";
    chatModelInput = createChatModelSelect();
    apiSection.appendChild(apiLabel);
    apiSection.appendChild(apiKeyRow);
    apiSection.appendChild(chatApiKeyStatus);
    apiSection.appendChild(apiKeyToggleLabel);
    apiSection.appendChild(modelLabel);
    apiSection.appendChild(chatModelInput);
    attachChatModelHandlers();
    chatSettingsPanel.appendChild(apiSection);
    chatMessagesEl = document.createElement("div");
    chatMessagesEl.className = "qb-support-chat-messages";
    chatStatusField = document.createElement("div");
    chatStatusField.className = "qb-support-chat-status";
    const inputWrap = document.createElement("div");
    inputWrap.className = "qb-support-chat-input-wrap";
    chatInputWrap = inputWrap;
    chatInput = document.createElement("textarea");
    chatInput.className = "qb-support-chat-textarea";
    chatInput.placeholder = "質問を入力...";
    chatInput.rows = 3;
    chatSendButton = document.createElement("button");
    chatSendButton.type = "button";
    chatSendButton.className = "qb-support-chat-send";
    chatSendButton.textContent = "送信";
    applyButtonVariant(chatSendButton, "primary");
    inputWrap.appendChild(chatInput);
    inputWrap.appendChild(chatSendButton);
    chatPanel.appendChild(header);
    chatPanel.appendChild(chatSettingsPanel);
    chatPanel.appendChild(chatMessagesEl);
    chatPanel.appendChild(chatStatusField);
    chatPanel.appendChild(inputWrap);
    chatRoot.appendChild(chatPanel);
    document.body.appendChild(chatRoot);
    ensureChatToggle();
    ensureChatResizer();
    ensureChatOverlayHandle();
    ensureChatTemplates();
    attachChatSettingsHandlers();
    populateChatSettingsPanel();
  }
  function ensureChatResizer() {
    const existing = document.getElementById(CHAT_RESIZER_ID);
    if (existing) {
      chatResizer = existing;
      return;
    }
    chatResizer = document.createElement("div");
    chatResizer.id = CHAT_RESIZER_ID;
    chatResizer.className = "qb-support-chat-resizer";
    chatResizer.addEventListener("pointerdown", (event) => {
      startChatResize(event);
    });
    document.body.appendChild(chatResizer);
  }
  function ensureChatOverlayHandle() {
    const existing = document.getElementById(CHAT_OVERLAY_HANDLE_ID);
    if (existing) {
      chatOverlayHandle = existing;
      return;
    }
    chatOverlayHandle = document.createElement("button");
    chatOverlayHandle.id = CHAT_OVERLAY_HANDLE_ID;
    chatOverlayHandle.type = "button";
    chatOverlayHandle.className = "qb-support-chat-overlay-handle";
    chatOverlayHandle.setAttribute("aria-label", "チャットを開閉");
    chatOverlayHandle.addEventListener("click", () => {
      void saveSettings({ ...settings, chatOpen: !settings.chatOpen });
    });
    document.body.appendChild(chatOverlayHandle);
  }
  function ensureChatToggle() {
    const existing = document.getElementById(CHAT_TOGGLE_ID);
    if (existing) {
      chatToggle = existing;
      return;
    }
    chatToggle = document.createElement("button");
    chatToggle.id = CHAT_TOGGLE_ID;
    chatToggle.type = "button";
    chatToggle.className = "qb-support-chat-toggle";
    chatToggle.textContent = "<";
    chatToggle.setAttribute("aria-label", "チャットを開く");
    chatToggle.dataset.shortcut = CHAT_TOGGLE_SHORTCUT;
    chatToggle.addEventListener("click", () => {
      void saveSettings({ ...settings, chatOpen: !settings.chatOpen });
    });
    document.body.appendChild(chatToggle);
  }
  function applyChatSettings() {
    if (!chatRoot || !chatPanel || !chatToggle) return;
    const docEl = document.documentElement;
    docEl.dataset.qbChatOpen = settings.chatOpen ? "true" : "false";
    docEl.dataset.qbChatSide = "right";
    chatRoot.dataset.side = "right";
    chatRoot.dataset.open = settings.chatOpen ? "true" : "false";
    chatToggle.dataset.side = "right";
    chatToggle.dataset.open = settings.chatOpen ? "true" : "false";
    chatToggle.dataset.shortcut = CHAT_TOGGLE_SHORTCUT;
    updateChatToggleLabel();
    applyChatDockLayout();
    ensureChatLayoutHandler();
    if (!settings.chatOpen && chatSettingsOpen) {
      toggleChatSettings(false);
    }
    if (chatApiInput && document.activeElement !== chatApiInput) {
      const apiKeySaved = Boolean(settings.chatApiKey);
      chatApiInput.value = apiKeySaved ? settings.chatApiKey : "";
      chatApiInput.placeholder = apiKeySaved ? "保存済み (編集可)" : "sk-...";
    }
    updateChatApiKeyStatus();
    if (chatApiKeyToggle) {
      chatApiKeyToggle.checked = settings.chatApiKeyEnabled;
    }
    if (chatApiKeyVisibilityButton) {
      const hasKey = Boolean(settings.chatApiKey || chatApiInput?.value);
      if (!hasKey) chatApiKeyVisible = false;
      if (chatApiInput) {
        chatApiInput.type = chatApiKeyVisible ? "text" : "password";
      }
      chatApiKeyVisibilityButton.textContent = chatApiKeyVisible ? "非表示" : "表示";
      chatApiKeyVisibilityButton.disabled = !hasKey;
    }
    const backendMode = isBackendMode();
    const modelOptions = getChatModelOptions(backendMode);
    const resolvedModel = backendMode ? resolveBackendModel(settings.chatModel) : settings.chatModel;
    if (backendMode && resolvedModel !== settings.chatModel) {
      void saveSettings({ ...settings, chatModel: resolvedModel });
    }
    updateModelSelectOptions(chatModelInput, modelOptions, resolvedModel);
    updateModelSelectOptions(chatHeaderModelSelect, modelOptions, resolvedModel);
  }
  function updateChatApiKeyStatus() {
    if (!chatApiKeyStatus) return;
    const saved = Boolean(settings.chatApiKey);
    const savedValue = settings.chatApiKey?.trim() ?? "";
    const valid = savedValue ? isValidApiKey(savedValue) : false;
    const currentValue = chatApiInput?.value.trim() ?? "";
    let status = "未入力";
    if (saved) {
      status = valid ? "入力済み" : "無効";
    } else if (currentValue) {
      status = "入力中";
    }
    const suffix = saved && !settings.chatApiKeyEnabled ? " (使用オフ)" : "";
    chatApiKeyStatus.textContent = `APIキー: ${status}${suffix}`;
  }
  function ensureThemeListener() {
    if (themeQuery) return;
    themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    themeQuery.addEventListener("change", () => {
      if (settings.themePreference === "system") {
        applyTheme();
      }
    });
  }
  function resolveTheme() {
    if (settings.themePreference === "system") {
      return themeQuery?.matches ? "dark" : "light";
    }
    return settings.themePreference === "dark" ? "dark" : "light";
  }
  function applyTheme() {
    const docEl = document.documentElement;
    docEl.dataset.qbTheme = resolveTheme();
    docEl.dataset.qbAccent = settings.pageAccentEnabled ? "on" : "off";
  }
  function ensureChatLayoutHandler() {
    if (chatLayoutBound) return;
    chatLayoutBound = true;
    window.addEventListener("resize", () => applyChatDockLayout());
  }
  function ensureChatTemplates() {
    if (window !== window.top) return;
    const existing = document.getElementById(CHAT_TEMPLATE_ID);
    if (existing) {
      chatTemplateBar = existing;
    }
    if (!chatTemplateBar) {
      const bar = document.createElement("div");
      bar.id = CHAT_TEMPLATE_ID;
      bar.className = "qb-support-chat-templates";
      chatTemplateBar = bar;
    }
    if (chatInputWrap && chatTemplateBar.parentElement !== chatInputWrap) {
      const anchor = chatInputWrap.firstChild;
      if (anchor) {
        chatInputWrap.insertBefore(chatTemplateBar, anchor);
      } else {
        chatInputWrap.appendChild(chatTemplateBar);
      }
    }
    updateChatTemplatesUI();
  }
  function getEnabledChatTemplates() {
    return getEnabledChatTemplatesWithIndex().map(({ template }) => template);
  }
  function getEnabledChatTemplatesWithIndex() {
    const count = getTemplateCount();
    const templates = settings.chatTemplates ?? [];
    const list = [];
    for (let i = 0; i < Math.min(count, templates.length); i += 1) {
      const template = templates[i];
      if (!template || !template.enabled || !template.prompt.trim()) continue;
      list.push({ template, index: i });
    }
    return list;
  }
  function getTemplateCount() {
    const raw = settings.chatTemplateCount ?? 0;
    if (!raw) return Math.min(Math.max(1, settings.chatTemplates?.length ?? 1), CHAT_TEMPLATE_MAX);
    return Math.min(Math.max(raw, 1), CHAT_TEMPLATE_MAX);
  }
  function updateTemplateControls() {
    if (templateCountLabel) {
      templateCountLabel.textContent = `テンプレ数: ${getTemplateCount()}`;
    }
    if (templateAddButton) {
      templateAddButton.disabled = getTemplateCount() >= CHAT_TEMPLATE_MAX;
    }
    if (templateRemoveButton) {
      templateRemoveButton.disabled = getTemplateCount() <= 1;
    }
  }
  function updateTemplateCount(nextCount) {
    const clamped = Math.min(Math.max(nextCount, 1), CHAT_TEMPLATE_MAX);
    if (clamped === getTemplateCount()) return;
    const nextTemplates = (settings.chatTemplates ?? []).map((template) => ({ ...template }));
    for (let i = clamped; i < nextTemplates.length; i += 1) {
      nextTemplates[i].enabled = false;
    }
    void saveSettings({
      ...settings,
      chatTemplateCount: clamped,
      chatTemplates: nextTemplates
    });
  }
  function isHintTemplate(template) {
    if (!template) return false;
    const hintPhrase = "絶妙なヒント";
    const label = template.label ?? "";
    const prompt = template.prompt ?? "";
    return label.includes("ヒント") || label.includes(hintPhrase) || prompt.includes(hintPhrase);
  }
  function getHintTemplate() {
    for (const entry of getEnabledChatTemplatesWithIndex()) {
      if (isHintTemplate(entry.template)) {
        return entry;
      }
    }
    return null;
  }
  function setSectionCollapsed(section, collapsed) {
    if (!section) return;
    section.dataset.collapsed = collapsed ? "true" : "false";
    const title = section.querySelector(".qb-support-section-title");
    if (title) {
      title.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
  }
  function openTemplateEditor(index) {
    if (window !== window.top) return;
    if (!chatSettingsPanel) {
      ensureChatUI();
    }
    const openPanel = () => {
      toggleChatSettings(true);
      setSectionCollapsed(templateSectionEl, false);
      const row = chatTemplateRows[index];
      if (!row) return;
      row.container.scrollIntoView({ block: "center" });
      row.prompt.focus();
    };
    if (!settings.chatOpen) {
      void saveSettings({ ...settings, chatOpen: true }).then(openPanel);
    } else {
      openPanel();
    }
  }
  function attachTemplateEditJump(button, index) {
    if (!settings.debugEnabled) return;
    if (button.dataset.editJump === "true") return;
    button.dataset.editJump = "true";
    let hoverTimer = null;
    let pressTimer = null;
    let longPressTriggered = false;
    const clearHover = () => {
      if (hoverTimer) window.clearTimeout(hoverTimer);
      hoverTimer = null;
    };
    const clearPress = () => {
      if (pressTimer) window.clearTimeout(pressTimer);
      pressTimer = null;
    };
    button.addEventListener("mouseenter", () => {
      clearHover();
      hoverTimer = window.setTimeout(() => {
        openTemplateEditor(index);
      }, 900);
    });
    button.addEventListener("mouseleave", clearHover);
    button.addEventListener("pointerdown", (event) => {
      if (event.button && event.button !== 0) return;
      longPressTriggered = false;
      clearPress();
      pressTimer = window.setTimeout(() => {
        longPressTriggered = true;
        openTemplateEditor(index);
      }, 650);
    });
    const cancelPress = () => {
      clearPress();
    };
    button.addEventListener("pointerup", cancelPress);
    button.addEventListener("pointerleave", cancelPress);
    button.addEventListener("pointercancel", cancelPress);
    button.addEventListener(
      "click",
      (event) => {
        if (!longPressTriggered) return;
        event.preventDefault();
        event.stopPropagation();
        longPressTriggered = false;
      },
      true
    );
  }
  function buildHintQuickMessage(draft) {
    const base = "絶妙なヒント（答えありきでなく、所見や症状から推論する視点で思考力を養う答えに迫りすぎないもの）をどうぞ。";
    if (!draft) return base;
    return `${base}今の考察は以下です.\"${draft}\"`;
  }
  function logInfo(...args) {
    if (!settings.debugEnabled) return;
    globalThis.console.log(...args);
  }
  function logVerbose(...args) {
    if (!settings.debugEnabled) return;
    globalThis.console.debug(...args);
  }
  function isEligibleHintDraftSource(target) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
    if (target instanceof HTMLInputElement) {
      const type = (target.type || "text").toLowerCase();
      if (type === "password" || type === "hidden" || type === "checkbox" || type === "radio" || type === "button" || type === "submit" || type === "file") {
        return false;
      }
    }
    if (target.classList.contains("qb-support-chat-api-key")) return false;
    return true;
  }
  function resolveHintDraft() {
    const chatDraft = chatInput?.value?.trim() ?? "";
    if (chatDraft) return chatDraft;
    const chatTextarea = document.querySelector(
      ".qb-support-chat-textarea"
    );
    const fallbackDraft = chatTextarea?.value?.trim() ?? "";
    if (fallbackDraft) return fallbackDraft;
    if (lastHintDraftSource && document.contains(lastHintDraftSource)) {
      const value = lastHintDraftSource.value?.trim() ?? "";
      if (value) return value;
    }
    return "";
  }
  function updateHintQuickButton() {
    if (window !== window.top) return;
    const hintEntry = getHintTemplate();
    if (!hintEntry) {
      if (hintQuickButton) {
        hintQuickButton.remove();
        hintQuickButton = null;
      }
      return;
    }
    const revealButton = getAnswerRevealButton(document);
    if (!revealButton) {
      if (hintQuickButton) {
        hintQuickButton.remove();
        hintQuickButton = null;
      }
      return;
    }
    if (!hintQuickButton) {
      hintQuickButton = document.createElement("button");
      hintQuickButton.type = "button";
      hintQuickButton.className = "qb-support-chat-template-btn qb-support-hint-quick";
      applyButtonVariant(hintQuickButton, "accent");
    }
    hintQuickButton.textContent = "ヒント";
    if (hintEntry.template.shortcut) {
      hintQuickButton.dataset.shortcut = hintEntry.template.shortcut;
    } else {
      hintQuickButton.removeAttribute("data-shortcut");
    }
    hintQuickButton.onclick = () => {
      if (!chatInput) {
        ensureChatUI();
      }
      const message = buildHintQuickMessage(resolveHintDraft());
      void sendTemplateMessage(message);
    };
    attachTemplateEditJump(hintQuickButton, hintEntry.index);
    const parent = revealButton.parentElement;
    if (!parent) return;
    if (hintQuickButton.parentElement !== parent || hintQuickButton.nextSibling !== revealButton) {
      parent.insertBefore(hintQuickButton, revealButton);
    }
  }
  function updateChatTemplatesUI() {
    if (!chatTemplateBar) return;
    const templates = getEnabledChatTemplatesWithIndex();
    chatTemplateBar.innerHTML = "";
    if (templates.length === 0) {
      chatTemplateBar.style.display = "none";
      updateHintQuickButton();
      return;
    }
    chatTemplateBar.style.display = "flex";
    templates.forEach(({ template, index }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "qb-support-chat-template-btn";
      applyButtonVariant(button, "accent");
      button.textContent = template.label || `テンプレ${index + 1}`;
      if (template.shortcut) {
        button.dataset.shortcut = template.shortcut;
      }
      button.addEventListener("click", () => {
        void sendTemplateMessage(template);
      });
      attachTemplateEditJump(button, index);
      chatTemplateBar.appendChild(button);
    });
    updateHintQuickButton();
  }
  function createChatModelSelect() {
    const backendMode = isBackendMode();
    const options = getChatModelOptions(backendMode);
    const select = createOverlaySelect(
      options.map((model) => ({ value: model, label: model })),
      "qb-support-chat-input qb-support-chat-model"
    );
    select.value = backendMode ? resolveBackendModel(settings.chatModel) : settings.chatModel;
    return select;
  }
  function attachChatModelHandlers() {
    const bind = (select) => {
      if (!select) return;
      if (select.dataset.handlers === "true") return;
      select.dataset.handlers = "true";
      select.addEventListener("change", () => {
        const nextModel = select.value ?? "";
        if (!nextModel) return;
        void saveSettings({ ...settings, chatModel: nextModel });
        setChatStatus(`モデルを ${nextModel} に設定しました`, false);
      });
    };
    bind(chatModelInput);
    bind(chatHeaderModelSelect);
  }
  function attachChatSettingsHandlers() {
    if (!chatSettingsButton) return;
    if (chatSettingsButton.dataset.handlers === "true") return;
    chatSettingsButton.dataset.handlers = "true";
    chatSettingsButton.addEventListener("click", () => {
      toggleChatSettings();
    });
  }
  function toggleChatSettings(force) {
    if (!chatSettingsPanel || !chatSettingsButton) return;
    const nextOpen = typeof force === "boolean" ? force : !chatSettingsOpen;
    if (chatSettingsOpen && !nextOpen) {
      void commitSettingsFromPanel();
    }
    chatSettingsOpen = nextOpen;
    chatSettingsPanel.dataset.open = chatSettingsOpen ? "true" : "false";
    chatSettingsButton.dataset.open = chatSettingsOpen ? "true" : "false";
    chatSettingsButton.setAttribute("aria-expanded", chatSettingsOpen ? "true" : "false");
  }
  async function closeSettingsPanel() {
    await commitSettingsFromPanel();
    await saveSettings({ ...settings, enabled: false });
  }
  async function commitSettingsFromPanel() {
    let next = { ...settings };
    let hasChanges = false;
    const applyUpdate = (key, value) => {
      if (settings[key] !== value) {
        next = { ...next, [key]: value };
        hasChanges = true;
      }
    };
    const pendingApiKey = chatApiInput?.value.trim() ?? "";
    if (pendingApiKey && pendingApiKey !== settings.chatApiKey) {
      applyUpdate("chatApiKey", pendingApiKey);
    }
    if (chatApiKeyToggle) {
      applyUpdate("chatApiKeyEnabled", chatApiKeyToggle.checked);
    }
    const commonPrompt = commonPromptInput?.value.trim() ?? "";
    if (commonPrompt !== (settings.commonPrompt ?? "")) {
      applyUpdate("commonPrompt", commonPrompt);
    }
    const nextLevel = explanationLevelSelect?.value ?? settings.explanationLevel;
    if (nextLevel !== settings.explanationLevel) {
      applyUpdate("explanationLevel", nextLevel);
    }
    const nextPrompts = {
      highschool: explanationPromptInputs.highschool?.value.trim() ?? "",
      "med-junior": explanationPromptInputs["med-junior"]?.value.trim() ?? "",
      "med-senior": explanationPromptInputs["med-senior"]?.value.trim() ?? ""
    };
    const currentPrompts = settings.explanationPrompts ?? {
      highschool: "",
      "med-junior": "",
      "med-senior": ""
    };
    const promptsChanged = nextPrompts.highschool !== (currentPrompts.highschool ?? "") || nextPrompts["med-junior"] !== (currentPrompts["med-junior"] ?? "") || nextPrompts["med-senior"] !== (currentPrompts["med-senior"] ?? "");
    if (promptsChanged) {
      applyUpdate("explanationPrompts", nextPrompts);
    }
    if (navPrevInput && navNextInput && revealInput && optionInputs.length) {
      const optionKeys = optionInputs.map((input) => normalizeShortcut(input.value)).filter(Boolean);
      const navPrevKey = normalizeShortcut(navPrevInput.value ?? "");
      const navNextKey = normalizeShortcut(navNextInput.value ?? "");
      const revealKey = normalizeShortcut(revealInput.value ?? "");
      if (navPrevKey && navNextKey && revealKey && optionKeys.length) {
        applyUpdate("navPrevKey", navPrevKey);
        applyUpdate("navNextKey", navNextKey);
        applyUpdate("revealKey", revealKey);
        applyUpdate("optionKeys", optionKeys);
        if (shortcutsToggle) {
          applyUpdate("shortcutsEnabled", shortcutsToggle.checked);
        }
        if (searchToggle) {
          applyUpdate("searchVisible", searchToggle.checked);
        }
        if (noteToggle) {
          applyUpdate("noteVisible", noteToggle.checked);
        }
      }
    }
    if (chatTemplateRows.length) {
      const nextTemplates = chatTemplateRows.map((row, index) => {
        const label = row.label.value.trim() || `テンプレ${index + 1}`;
        const shortcut = normalizeShortcut(row.shortcut.value);
        const prompt = row.prompt.value.trim();
        return {
          enabled: row.enabled.checked,
          label,
          shortcut,
          prompt
        };
      });
      const hasInvalidTemplate = nextTemplates.some(
        (template) => template.enabled && !template.prompt
      );
      if (hasInvalidTemplate) {
        setStatus("有効なテンプレはプロンプト必須です", true);
      } else if (JSON.stringify(nextTemplates) !== JSON.stringify(settings.chatTemplates ?? [])) {
        applyUpdate("chatTemplates", nextTemplates);
      }
    }
    if (hasChanges) {
      await saveSettings(next);
    }
  }
  function populateChatSettingsPanel() {
    if (!chatSettingsPanel) return;
    if (chatSettingsPanel.dataset.populated === "true") return;
    const sections = [
      authSectionEl,
      displaySectionEl,
      shortcutSectionEl,
      explanationSectionEl,
      templateSectionEl
    ];
    sections.forEach((section) => {
      if (section) chatSettingsPanel?.appendChild(section);
    });
    chatSettingsPanel.dataset.populated = "true";
  }
  function resolveBackendBaseUrl() {
    const raw = DEFAULT_BACKEND_URL.trim();
    if (!raw) return null;
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  function resolveBackendSettingsUrl() {
    const base = resolveBackendBaseUrl();
    if (!base) return null;
    try {
      const url = new URL(base);
      let path = url.pathname.replace(/\/+$/, "");
      if (!path) {
        path = "/settings";
      } else if (!path.endsWith("/settings")) {
        path = `${path}/settings`;
      }
      url.pathname = path;
      return url.toString();
    } catch {
      return null;
    }
  }
  function isValidApiKey(raw) {
    return raw.startsWith("sk-pro");
  }
  function resolveBackendAuthStartUrl() {
    const base = resolveBackendBaseUrl();
    if (!base) return null;
    try {
      const url = new URL(base);
      let path = url.pathname.replace(/\/+$/, "");
      if (!path) {
        path = "/auth/start";
      } else if (!path.endsWith("/auth/start")) {
        path = `${path}/auth/start`;
      }
      url.pathname = path;
      return url.toString();
    } catch {
      return null;
    }
  }
  function resolveBackendAuthSessionUrl(state) {
    const base = resolveBackendBaseUrl();
    if (!base) return null;
    try {
      const url = new URL(base);
      let path = url.pathname.replace(/\/+$/, "");
      if (!path) {
        path = "/auth/session";
      } else if (!path.endsWith("/auth/session")) {
        path = `${path}/auth/session`;
      }
      url.pathname = path;
      url.searchParams.set("state", state);
      return url.toString();
    } catch {
      return null;
    }
  }
  function isBackendMode() {
    const apiKey = settings.chatApiKey?.trim() ?? "";
    if (apiKey && settings.chatApiKeyEnabled && isValidApiKey(apiKey)) return false;
    if (!authProfile) return false;
    return Boolean(resolveBackendBaseUrl());
  }
  function resolveBackendModel(model) {
    const trimmed = typeof model === "string" ? model.trim() : "";
    return BACKEND_ALLOWED_MODELS.includes(trimmed) ? trimmed : BACKEND_DEFAULT_MODEL;
  }
  function getChatModelOptions(backendMode) {
    return backendMode ? BACKEND_ALLOWED_MODELS : CHAT_MODEL_OPTIONS;
  }
  function updateModelSelectOptions(select, options, selected) {
    if (!select) return;
    const signature = options.join("|");
    if (select.dataset.optionSignature !== signature) {
      select.dataset.optionSignature = signature;
      select.innerHTML = "";
      options.forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
      });
    }
    if (select.value !== selected && document.activeElement !== select) {
      select.value = selected;
    }
  }
  async function resolveChatAuth() {
    const apiKey = settings.chatApiKey?.trim() ?? "";
    const apiKeyValid = apiKey ? isValidApiKey(apiKey) : false;
    if (apiKey && settings.chatApiKeyEnabled && apiKeyValid) {
      return { mode: "apiKey", apiKey };
    }
    if (!authProfile) {
      if (apiKey && !apiKeyValid) {
        throw new Error("APIキーが無効です。Googleでログインしてください");
      }
      if (apiKey) {
        throw new Error("APIキーを有効にするか、Googleでログインしてください");
      }
      throw new Error("APIキーを設定するか、Googleでログインしてください");
    }
    const backendBaseUrl = resolveBackendBaseUrl();
    if (!backendBaseUrl) {
      throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
    }
    const token = await ensureAuthAccessToken(false);
    if (!token) {
      throw new Error("認証トークンを取得できませんでした");
    }
    return { mode: "backend", backendUrl: backendBaseUrl, authToken: token };
  }
  async function resolveChatAuthWithStatus() {
    try {
      return await resolveChatAuth();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[QB_SUPPORT][auth]", message);
      if (isAuthPromptMessage(message)) {
        showChatAuthPrompt(message);
      } else {
        setChatStatus(message, true);
      }
      return null;
    }
  }
  async function sendTemplateMessage(template) {
    let rawMessage = "";
    if (typeof template === "string") {
      rawMessage = template;
    } else if (isHintTemplate(template)) {
      rawMessage = buildHintQuickMessage(resolveHintDraft());
    } else {
      rawMessage = template?.prompt ?? "";
    }
    if (!rawMessage.trim()) return;
    const message = applyTemplateConstraints(rawMessage, template);
    const auth = await resolveChatAuthWithStatus();
    if (!auth) return;
    if (!chatInput || !chatMessagesEl) {
      ensureChatUI();
    }
    await saveSettings({ ...settings, chatOpen: true });
    if (!chatInput) return;
    chatInput.value = message;
    void handleChatSend();
  }
  function applyTemplateConstraints(message, template) {
    return message;
  }
  function applyButtonVariant(button, variant) {
    if (!button) return;
    button.classList.add("qb-support-btn", `qb-support-btn--${variant}`);
  }
  function applyChatDockLayout() {
    if (window !== window.top) return;
    const body = document.body;
    if (!body || !chatRoot) return;
    const isBottomOverlay = shouldUseBottomOverlay();
    const showDock = settings.chatOpen && !isBottomOverlay;
    const layoutMode = isBottomOverlay ? "overlay-bottom" : showDock ? "dock" : "overlay";
    document.documentElement.dataset.qbChatLayout = layoutMode;
    chatRoot.dataset.mode = layoutMode;
    body.style.marginRight = "";
    body.style.transition = "";
    document.documentElement.style.overflowX = "";
    body.classList.toggle(CHAT_DOCK_CLASS, showDock);
    if (chatResizer) {
      chatResizer.dataset.active = showDock ? "true" : "false";
    }
    if (chatOverlayHandle) {
      chatOverlayHandle.dataset.active = isBottomOverlay ? "true" : "false";
      chatOverlayHandle.dataset.open = settings.chatOpen ? "true" : "false";
    }
    if (showDock) {
      const dockWidth = getDockWidth();
      setChatDockWidth(dockWidth);
    }
    const shouldFocus = settings.chatOpen && (!lastChatOpen || lastChatLayout !== layoutMode);
    lastChatOpen = settings.chatOpen;
    lastChatLayout = layoutMode;
    if (shouldFocus) {
      focusChatInput();
    }
  }
  function shouldUseBottomOverlay() {
    const width = window.innerWidth || 0;
    const height = window.innerHeight || 1;
    return width / height <= 0.9;
  }
  function getDockWidth() {
    const min = CHAT_DOCK_MIN_WIDTH;
    const max = getDockMaxWidth();
    if (!chatDockWidth) {
      const target = Math.floor(window.innerWidth * CHAT_DOCK_TARGET_RATIO);
      chatDockWidth = Math.min(max, Math.max(min, target));
    }
    if (chatDockWidth < min) chatDockWidth = min;
    if (chatDockWidth > max) chatDockWidth = max;
    return chatDockWidth;
  }
  function getDockMaxWidth() {
    return Math.max(CHAT_DOCK_MIN_WIDTH, window.innerWidth - CHAT_DOCK_GAP);
  }
  function setChatDockWidth(width) {
    const max = getDockMaxWidth();
    chatDockWidth = Math.min(Math.max(CHAT_DOCK_MIN_WIDTH, width), max);
    const value = `${chatDockWidth}px`;
    chatRoot?.style.setProperty("--qb-support-chat-dock-width", value);
    chatResizer?.style.setProperty("--qb-support-chat-dock-width", value);
    document.body?.style.setProperty("--qb-support-chat-dock-width", value);
    chatTemplateBar?.style.setProperty("--qb-support-chat-dock-width", value);
  }
  function startChatResize(event) {
    if (!settings.chatOpen || !chatResizer) return;
    if (!document.body.classList.contains(CHAT_DOCK_CLASS)) return;
    captureQuestionImageBaseSizes();
    chatResizeActive = true;
    chatResizer.dataset.dragging = "true";
    chatResizer.setPointerCapture(event.pointerId);
    event.preventDefault();
    const onMove = (ev) => {
      if (!chatResizeActive) return;
      const width = Math.round(window.innerWidth - ev.clientX);
      const min = CHAT_DOCK_MIN_WIDTH;
      const max = getDockMaxWidth();
      setChatDockWidth(Math.min(Math.max(min, width), max));
    };
    const onUp = (ev) => {
      chatResizeActive = false;
      if (chatResizer) {
        delete chatResizer.dataset.dragging;
      }
      chatResizer?.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function updateChatToggleLabel() {
    if (!chatToggle) return;
    const layout = document.documentElement.dataset.qbChatLayout;
    const open = settings.chatOpen;
    if (layout === "overlay-bottom") {
      chatToggle.textContent = open ? "▼" : "▲";
    } else {
      chatToggle.textContent = open ? ">" : "<";
    }
    chatToggle.setAttribute("aria-label", open ? "チャットを閉じる" : "チャットを開く");
  }
  function focusChatInput() {
    if (!chatInput) return;
    window.setTimeout(() => {
      chatInput?.focus();
    }, 0);
  }
  function toggleChatInputFocus() {
    ensureChatUI();
    if (!chatInput) return;
    const isActive = document.activeElement === chatInput;
    if (isActive) {
      chatInput.blur();
      return;
    }
    if (!settings.chatOpen) {
      void saveSettings({ ...settings, chatOpen: true }).then(() => {
        focusChatInput();
      });
      return;
    }
    focusChatInput();
  }
  function attachChatHandlers() {
    if (!chatPanel || chatPanel.dataset.handlers === "true") return;
    chatPanel.dataset.handlers = "true";
    chatSendButton?.addEventListener("click", () => {
      void handleChatSend();
    });
    chatInput?.addEventListener("compositionstart", () => {
      chatComposing = true;
    });
    chatInput?.addEventListener("compositionend", () => {
      chatComposing = false;
    });
    chatInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !chatComposing) {
        event.preventDefault();
        void handleChatSend();
      }
    });
  }
  async function handleChatSend() {
    if (!chatInput || !chatMessagesEl) return;
    if (chatRequestPending) return;
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;
    const auth = await resolveChatAuthWithStatus();
    if (!auth) return;
    chatInput.value = "";
    setChatStatus("", false);
    chatHistory.push({ role: "user", content: userMessage });
    trimChatHistory();
    appendChatMessage("user", userMessage);
    chatRequestPending = true;
    const requestId = createChatRequestId();
    activeChatRequestId = requestId;
    const placeholder = appendChatMessage("assistant", "回答中...", { pending: true });
    const effectiveModel = auth.mode === "backend" ? resolveBackendModel(settings.chatModel) : settings.chatModel;
    const useThinking = effectiveModel.startsWith("gpt-5");
    let thinkingTimer = null;
    let gotDelta = false;
    try {
      const snapshot = await resolveQuestionSnapshot();
      const includeContext = !chatLastResponseId;
      const { input, instructions } = await buildChatRequest(
        snapshot,
        userMessage,
        includeContext
      );
      if (useThinking && placeholder) {
        thinkingTimer = window.setTimeout(() => {
          if (!gotDelta) {
            setChatMessageContent(placeholder, "assistant", "thinking...");
          }
        }, 1200);
      }
      logVerbose("[QB_SUPPORT][chat-send]", {
        hasSnapshot: Boolean(snapshot),
        history: chatHistory.length
      });
      const streamState = { text: "" };
      const response = await requestChatResponseStream(
        {
          requestId,
          input,
          instructions,
          previousResponseId: chatLastResponseId
        },
        auth,
        (delta) => {
          gotDelta = true;
          if (thinkingTimer) {
            window.clearTimeout(thinkingTimer);
            thinkingTimer = null;
          }
          streamState.text += delta;
          if (placeholder) {
            const autoScroll = shouldAutoScroll(chatMessagesEl);
            setChatMessageContent(placeholder, "assistant", streamState.text || "回答中...");
            placeholder.classList.remove("is-pending");
            if (autoScroll) {
              chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
            }
          }
        }
      );
      if (activeChatRequestId !== requestId) return;
      const finalText = response.text || streamState.text;
      if (placeholder) {
        setChatMessageContent(placeholder, "assistant", finalText || "応答がありません");
        placeholder.classList.remove("is-pending");
      } else if (finalText) {
        const message = appendChatMessage("assistant", finalText);
        if (message && response.usage) {
          const meta = formatUsageMeta(response.usage, effectiveModel, auth.mode);
          if (meta) {
            setChatMessageMeta(message, meta);
          }
        }
      }
      if (placeholder && response.usage) {
        const meta = formatUsageMeta(response.usage, effectiveModel, auth.mode);
        if (meta) {
          setChatMessageMeta(placeholder, meta);
        }
      }
      if (finalText) {
        chatHistory.push({ role: "assistant", content: finalText });
        trimChatHistory();
      }
      if (response.responseId) {
        chatLastResponseId = response.responseId;
      }
    } catch (error) {
      if (activeChatRequestId !== requestId) return;
      if (placeholder) {
        placeholder.textContent = "応答に失敗しました";
        placeholder.classList.remove("is-pending");
      }
      console.warn("[QB_SUPPORT][chat-error]", error);
      setChatStatus(`エラー: ${String(error)}`, true);
    } finally {
      if (thinkingTimer) window.clearTimeout(thinkingTimer);
      if (activeChatRequestId === requestId) {
        chatRequestPending = false;
        activeChatRequestId = null;
      }
    }
  }
  function trimChatHistory() {
    const maxMessages = 12;
    if (chatHistory.length > maxMessages) {
      chatHistory = chatHistory.slice(-maxMessages);
    }
  }
  function shouldAutoScroll(container) {
    const threshold = 32;
    const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
    return distance <= threshold;
  }
  function appendChatMessage(role, content, options) {
    if (!chatMessagesEl) return null;
    const autoScroll = shouldAutoScroll(chatMessagesEl);
    const message = document.createElement("div");
    message.className = `qb-support-chat-msg is-${role}`;
    if (options?.pending) message.classList.add("is-pending");
    setChatMessageContent(message, role, content);
    if (role === "assistant") {
      ensureCopyButton(message);
    }
    if (role === "user") {
      applyUserMessageCollapse(message, content);
    }
    chatMessagesEl.appendChild(message);
    if (autoScroll) {
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
    return message;
  }
  function setChatMessageContent(message, role, content) {
    message.dataset.raw = content;
    let contentEl = message.querySelector(".qb-support-chat-content");
    if (!contentEl) {
      contentEl = document.createElement("div");
      contentEl.className = "qb-support-chat-content";
      message.insertBefore(contentEl, message.firstChild);
    }
    if (role === "assistant") {
      contentEl.innerHTML = renderMarkdown(content);
    } else {
      contentEl.textContent = content;
    }
  }
  function renderMarkdown(text) {
    const escaped = escapeHtml(text.replace(/\r\n/g, "\n"));
    const codeBlocks = [];
    const withBlocks = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
      const block = `<pre class="qb-support-code"><code>${code.trim()}</code></pre>`;
      codeBlocks.push(block);
      return `@@QB_CODEBLOCK_${codeBlocks.length - 1}@@`;
    });
    let html = withBlocks;
    html = html.replace(/^######\s+(.+)$/gm, '<h6 class="qb-support-md-h6">$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="qb-support-md-h5">$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4 class="qb-support-md-h4">$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3 class="qb-support-md-h3">$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 class="qb-support-md-h2">$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1 class="qb-support-md-h1">$1</h1>');
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/@@QB_CODEBLOCK_(\d+)@@/g, (_, index) => {
      const block = codeBlocks[Number(index)];
      return block ?? "";
    });
    return html;
  }
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }
  function setChatMessageMeta(message, meta) {
    let metaEl = message.querySelector(".qb-support-chat-meta");
    const copyButton = message.querySelector(".qb-support-chat-copy");
    if (!metaEl) {
      metaEl = document.createElement("div");
      metaEl.className = "qb-support-chat-meta";
      if (copyButton) {
        message.insertBefore(metaEl, copyButton);
      } else {
        message.appendChild(metaEl);
      }
    }
    metaEl.textContent = meta;
  }
  function ensureCopyButton(message) {
    if (message.querySelector(".qb-support-chat-copy")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qb-support-chat-copy";
    applyButtonVariant(button, "ghost");
    button.textContent = "コピー";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = message.dataset.raw ?? "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "コピー済み";
        window.setTimeout(() => {
          button.textContent = "コピー";
        }, 1200);
      } catch {
        button.textContent = "失敗";
        window.setTimeout(() => {
          button.textContent = "コピー";
        }, 1200);
      }
    });
    message.appendChild(button);
  }
  function applyUserMessageCollapse(message, content) {
    const words = content.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 400) return;
    const preview = `${words.slice(0, 400).join(" ")} … (クリックで展開)`;
    const contentEl = message.querySelector(".qb-support-chat-content");
    if (!contentEl) return;
    message.classList.add("is-collapsible", "is-collapsed");
    contentEl.textContent = preview;
    message.dataset.full = content;
    message.dataset.preview = preview;
    message.addEventListener("click", () => {
      const collapsed = message.classList.toggle("is-collapsed");
      const nextText = collapsed ? message.dataset.preview : message.dataset.full;
      if (nextText) {
        const targetEl = message.querySelector(".qb-support-chat-content");
        if (targetEl) targetEl.textContent = nextText;
      }
    });
  }
  var MODEL_PRICING_USD_PER_1M = {
    "gpt-5.2": { input: 10, output: 30 },
    "gpt-5.2-chat-latest": { input: 10, output: 30 },
    "gpt-5": { input: 10, output: 30 },
    "gpt-4.1": { input: 5, output: 15 },
    "gpt-4o": { input: 5, output: 15 }
  };
  var USD_TO_JPY = 155;
  function shouldShowUsageMeta() {
    const email = authProfile?.email?.trim().toLowerCase() ?? "";
    return email === USAGE_META_EMAIL;
  }
  function formatUsageMeta(usage, model, mode) {
    if (!shouldShowUsageMeta()) return null;
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
    if (!totalTokens) return null;
    const pricing = MODEL_PRICING_USD_PER_1M[model];
    const cost = pricing ? (inputTokens * pricing.input + outputTokens * pricing.output) / 1e6 * USD_TO_JPY : null;
    const costLabel = cost !== null ? `\xA5${cost.toFixed(2)} (概算)` : "\xA5-";
    const source = mode === "backend" ? "backend" : "frontend";
    return `source: ${source} ・ model: ${model} ・ tokens: ${totalTokens} (in ${inputTokens} / out ${outputTokens}) ・ ${costLabel}`;
  }
  function createChatRequestId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  async function resolveQuestionSnapshot() {
    const local = extractQuestionSnapshot(document, location.href);
    if (local) return local;
    if (window !== window.top) return currentSnapshot;
    const snapshot = await requestQuestionSnapshotFromFrame(900);
    return snapshot ?? null;
  }
  function ensureAnswerFrame(questionId) {
    if (!questionId) return;
    if (!document.body) return;
    if (answerFrameEl && answerFrameEl.dataset.qid === questionId) return;
    if (answerFrameEl) {
      answerFrameEl.remove();
      answerFrameEl = null;
    }
    const iframe = document.createElement("iframe");
    iframe.src = `https://input.medilink-study.com/qbdispv2.php?id=${encodeURIComponent(questionId)}`;
    iframe.dataset.qid = questionId;
    iframe.dataset.loaded = "false";
    Object.assign(iframe.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      border: "0",
      right: "0",
      bottom: "0"
    });
    iframe.addEventListener("load", () => {
      iframe.dataset.loaded = "true";
      if (!answerContextWanted) return;
      const watchMessage = {
        __qb_support: true,
        type: "QB_ANSWER_WATCH_START",
        timeoutMs: 1500
      };
      postToAnswerFrame(watchMessage);
    });
    document.body.appendChild(iframe);
    answerFrameEl = iframe;
  }
  function waitForAnswerContext(timeoutMs) {
    if (cachedAnswerContext?.text) {
      return Promise.resolve(cachedAnswerContext);
    }
    return new Promise((resolve) => {
      const resolver = (context) => {
        resolve(context ?? { text: "", meta: null });
      };
      pendingAnswerResolvers.push(resolver);
      window.setTimeout(() => {
        const index = pendingAnswerResolvers.indexOf(resolver);
        if (index !== -1) pendingAnswerResolvers.splice(index, 1);
        resolve(cachedAnswerContext ?? { text: "", meta: null });
      }, timeoutMs);
    });
  }
  function sendAnswerContextPush(context) {
    if (!context?.text) return;
    const payload = {
      __qb_support: true,
      type: "QB_ANSWER_CONTEXT_PUSH",
      context
    };
    try {
      window.top?.postMessage(payload, QB_TOP_ORIGIN);
    } catch (error) {
      console.warn("[QB_SUPPORT][answer-push]", error);
    }
  }
  function startAnswerObserver(options = {}) {
    if (answerObserverBound) return;
    answerObserverBound = true;
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", () => startAnswerObserver(), { once: true });
      return;
    }
    const emit = () => {
      const context = extractAnswerExplanationContext(document);
      if (!context.text) return;
      if (context.text === lastAnswerContextText) return;
      lastAnswerContextText = context.text;
      sendAnswerContextPush(context);
      if (options.once) {
        stopAnswerObserver();
      }
    };
    let observerTimer = null;
    const observer = new MutationObserver(() => {
      if (observerTimer) window.clearTimeout(observerTimer);
      observerTimer = window.setTimeout(emit, 200);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    answerObserver = observer;
    emit();
  }
  function stopAnswerObserver() {
    if (answerObserver) {
      try {
        answerObserver.disconnect();
      } catch {
      }
    }
    answerObserver = null;
    answerObserverBound = false;
  }
  async function resolveHintAnswerContext(snapshot) {
    if (cachedAnswerContext?.text) {
      return cachedAnswerContext.text;
    }
    answerContextWanted = true;
    const local = extractAnswerExplanationContext(document);
    if (local.text) {
      cachedAnswerContext = local;
      answerContextWanted = false;
      return local.text;
    }
    if (window !== window.top) return "";
    const questionId = snapshot?.id ?? questionIdFromUrl(location.href);
    if (questionId) {
      ensureAnswerFrame(questionId);
      const watchMessage = {
        __qb_support: true,
        type: "QB_ANSWER_WATCH_START",
        timeoutMs: 1500
      };
      postToAnswerFrame(watchMessage);
      postToInputFrame(watchMessage);
    }
    const awaited = await waitForAnswerContext(1200);
    if (awaited?.text) {
      cachedAnswerContext = awaited;
      answerContextWanted = false;
      return awaited.text;
    }
    const response = await requestAnswerContextFromFrame(900);
    if (response?.text) {
      cachedAnswerContext = response;
    }
    answerContextWanted = false;
    return response?.text ?? "";
  }
  async function buildChatRequest(snapshot, userMessage, includeContext) {
    const input = [];
    if (includeContext) {
      input.push(await buildContextInput(snapshot));
    }
    input.push({
      role: "user",
      content: [{ type: "input_text", text: userMessage }]
    });
    const hintAnswerText = isHintMessage(userMessage) ? await resolveHintAnswerContext(snapshot) : "";
    return { input, instructions: buildChatInstructions(hintAnswerText) };
  }
  function buildChatInstructions(hintAnswerText = "") {
    const levelKey = settings.explanationLevel ?? "med-junior";
    const levelLabel = EXPLANATION_LEVEL_LABELS[levelKey] ?? levelKey;
    const prompt = settings.explanationPrompts?.[levelKey] ?? "";
    const commonPrompt = settings.commonPrompt?.trim() ?? "";
    const lines = [
      "あなたはQB問題集の学習支援アシスタントです。",
      "与えられた問題文・選択肢・添付画像に基づいて、日本語で簡潔に答えてください。",
      "情報が不足している場合は、その旨を伝えてください。",
      commonPrompt,
      `解説レベル: ${levelLabel}`,
      prompt
    ];
    const hintText = hintAnswerText?.trim() ?? "";
    if (hintText) {
      lines.push(
        "以下は解説本文の抽出です。この内容に完全準拠する必要はないが、矛盾しないヒントを提示してください。",
        "この解説本文を見ていることや内容を直接引用していることは出力に現さないでください。",
        hintText
      );
    }
    return lines.join("\n");
  }
  async function buildContextInput(snapshot) {
    const resolvedImages = await loadSnapshotImages(snapshot);
    const content = [];
    content.push({
      type: "input_text",
      text: buildQuestionContext(snapshot, resolvedImages.length)
    });
    for (const imageUrl of resolvedImages) {
      content.push({ type: "input_image", image_url: imageUrl });
    }
    return { role: "user", content };
  }
  function buildQuestionContext(snapshot, imageCountOverride) {
    if (!snapshot) return "問題情報: 取得できませんでした。";
    const lines = ["問題情報:"];
    lines.push(`URL: ${snapshot.url}`);
    if (snapshot.id) lines.push(`ID: ${snapshot.id}`);
    if (snapshot.progressText) lines.push(`進捗: ${snapshot.progressText}`);
    if (snapshot.pageRef) lines.push(`掲載頁: ${snapshot.pageRef}`);
    if (snapshot.tags.length) lines.push(`タグ: ${snapshot.tags.join(", ")}`);
    if (snapshot.questionText) lines.push(`問題文: ${snapshot.questionText}`);
    if (snapshot.optionTexts.length) {
      const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const options = snapshot.optionTexts.map((text, index) => {
        const label = labels[index] ?? `${index + 1}`;
        return `${label}. ${text}`;
      });
      lines.push("選択肢:");
      lines.push(...options);
    }
    const imageCount = imageCountOverride ?? snapshot.imageUrls.length;
    if (imageCount) {
      lines.push(`画像: ${imageCount}件`);
    }
    return lines.join("\n");
  }
  async function loadSnapshotImages(snapshot) {
    const images = snapshot?.imageUrls ?? [];
    const results = [];
    for (const imageUrl of images) {
      const dataUrl = await loadImageAsDataUrl(imageUrl);
      if (dataUrl) results.push(dataUrl);
    }
    return results;
  }
  async function loadImageAsDataUrl(imageUrl) {
    try {
      const response = await fetch(imageUrl, { credentials: "include" });
      if (!response.ok) {
        console.warn("[QB_SUPPORT][chat-image]", {
          event: "fetch-failed",
          url: imageUrl,
          status: response.status
        });
        return null;
      }
      const blob = await response.blob();
      const maxBytes = 4 * 1024 * 1024;
      if (blob.size > maxBytes) {
        console.warn("[QB_SUPPORT][chat-image]", {
          event: "too-large",
          url: imageUrl,
          bytes: blob.size
        });
        return null;
      }
      return await blobToDataUrl(blob);
    } catch (error) {
      console.warn("[QB_SUPPORT][chat-image]", {
        event: "fetch-error",
        url: imageUrl,
        error: String(error)
      });
      return null;
    }
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(blob);
    });
  }
  function updateSnapshot(snapshot) {
    const prevId = currentSnapshot?.id ?? null;
    currentSnapshot = snapshot;
    if (prevId && snapshot.id && prevId !== snapshot.id) {
      cachedAnswerContext = null;
      lastAnswerContextText = "";
      if (answerFrameEl) {
        answerFrameEl.remove();
        answerFrameEl = null;
      }
      stopAnswerObserver();
      resetChatHistory("問題が切り替わったため履歴をリセットしました");
    }
  }
  function resetChatHistory(message = "問題が切り替わったため履歴をリセットしました") {
    cancelActiveChatRequest();
    chatHistory = [];
    chatLastResponseId = null;
    if (chatMessagesEl) chatMessagesEl.innerHTML = "";
    setChatStatus(message, false);
  }
  function cancelActiveChatRequest() {
    if (activeChatPort) {
      try {
        activeChatPort.disconnect();
      } catch {
      }
    }
    if (activeChatRequestId) {
      console.warn("[QB_SUPPORT][chat-stream]", {
        event: "cancel",
        requestId: activeChatRequestId
      });
    }
    activeChatPort = null;
    activeChatRequestId = null;
    chatRequestPending = false;
  }
  async function requestChatResponseStream(request, auth, onDelta) {
    if (!webext.runtime?.connect) {
      throw new Error("background接続が利用できません");
    }
    const port = webext.runtime.connect({ name: "qb-chat" });
    activeChatPort = port;
    logVerbose("[QB_SUPPORT][chat-stream]", {
      event: "connect",
      requestId: request.requestId
    });
    return new Promise((resolve, reject) => {
      let text = "";
      let responseId = null;
      let usage = null;
      let finished = false;
      const cleanup = () => {
        if (activeChatPort === port) {
          activeChatPort = null;
        }
        port.onMessage.removeListener(onMessage);
        port.onDisconnect.removeListener(onDisconnect);
        try {
          port.disconnect();
        } catch {
        }
        window.clearTimeout(timeoutId);
      };
      const finish = (error) => {
        if (finished) return;
        finished = true;
        if (error) {
          console.warn("[QB_SUPPORT][chat-stream]", {
            event: "finish",
            requestId: request.requestId,
            error: error.message
          });
        } else {
          logVerbose("[QB_SUPPORT][chat-stream]", {
            event: "finish",
            requestId: request.requestId,
            responseId,
            length: text.length
          });
        }
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve({ text, responseId, usage });
      };
      const onMessage = (message) => {
        if (!message || typeof message !== "object") return;
        const payload = message;
        if (payload.requestId !== request.requestId || !payload.type) return;
        logVerbose("[QB_SUPPORT][chat-stream]", {
          event: "message",
          type: payload.type,
          requestId: payload.requestId
        });
        if (payload.type === "QB_CHAT_STREAM_DELTA") {
          const delta = typeof payload.delta === "string" ? payload.delta : "";
          if (!delta) return;
          text += delta;
          onDelta(delta);
          return;
        }
        if (payload.type === "QB_CHAT_STREAM_DONE") {
          responseId = typeof payload.responseId === "string" || payload.responseId === null ? payload.responseId : responseId;
          if (payload.usage && typeof payload.usage === "object") {
            usage = payload.usage;
          }
          finish(null);
          return;
        }
        if (payload.type === "QB_CHAT_STREAM_ERROR") {
          finish(new Error(payload.error ?? "応答に失敗しました"));
        }
      };
      const onDisconnect = () => {
        const lastError = webext.runtime?.lastError?.message;
        console.warn("[QB_SUPPORT][chat-stream]", {
          event: "disconnect",
          requestId: request.requestId,
          lastError
        });
        finish(
          new Error(
            lastError ? `backgroundとの接続が切れました: ${lastError}` : "backgroundとの接続が切れました"
          )
        );
      };
      const timeoutId = window.setTimeout(() => {
        finish(new Error("応答がタイムアウトしました"));
      }, 18e4);
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      const model = auth.mode === "backend" ? resolveBackendModel(settings.chatModel) : settings.chatModel;
      const apiKey = auth.mode === "apiKey" ? auth.apiKey ?? "" : "";
      const backendUrl = auth.mode === "backend" ? auth.backendUrl ?? "" : "";
      const authToken = auth.mode === "backend" ? auth.authToken ?? "" : "";
      try {
        port.postMessage({
          type: "QB_CHAT_STREAM_REQUEST",
          requestId: request.requestId,
          apiKey,
          backendUrl,
          authToken,
          model,
          input: request.input,
          instructions: request.instructions,
          previousResponseId: request.previousResponseId ?? null
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  function setChatStatus(message, isError) {
    if (!chatStatusField) return;
    chatAuthPromptActive = false;
    chatStatusField.classList.remove("is-auth-prompt");
    chatStatusField.textContent = message;
    chatStatusField.classList.toggle("is-error", isError);
    if (message) {
      window.setTimeout(() => {
        if (chatStatusField?.textContent === message) {
          chatStatusField.textContent = "";
        }
      }, 2600);
    }
  }
  function isAuthPromptMessage(message) {
    return message.includes("ログイン") || message.includes("APIキーを設定") || message.includes("APIキーを有効");
  }
  function showChatAuthPrompt(message) {
    if (!chatStatusField) return;
    chatStatusField.textContent = "";
    chatStatusField.classList.remove("is-error");
    chatStatusField.classList.add("is-auth-prompt");
    chatAuthPromptActive = true;
    const text = document.createElement("div");
    text.className = "qb-support-chat-status-text";
    text.textContent = message || "ログインして利用を開始してください。";
    const actions = document.createElement("div");
    actions.className = "qb-support-chat-status-actions";
    const loginButton = document.createElement("button");
    loginButton.type = "button";
    loginButton.className = "qb-support-chat-auth-button";
    loginButton.textContent = "Googleでログイン";
    applyButtonVariant(loginButton, "primary");
    loginButton.addEventListener("click", () => {
      void handleAuthSignIn();
    });
    actions.appendChild(loginButton);
    chatStatusField.appendChild(text);
    chatStatusField.appendChild(actions);
  }
  function applySettings() {
    if (!root || !panel || !launcher) return;
    root.dataset.position = settings.position;
    panel.classList.toggle("is-hidden", !settings.enabled);
    launcher.classList.toggle("is-disabled", settings.enabled);
    launcher.classList.toggle("is-hidden", settings.enabled);
    if (settings.shortcut) {
      launcher.dataset.shortcut = settings.shortcut;
    } else {
      launcher.removeAttribute("data-shortcut");
    }
    toggleMarker(settings.debugEnabled);
    if (shortcutsToggle) shortcutsToggle.checked = settings.shortcutsEnabled;
    if (debugToggle) debugToggle.checked = settings.debugEnabled;
    if (searchToggle) searchToggle.checked = settings.searchVisible;
    if (noteToggle) noteToggle.checked = settings.noteVisible;
    if (pageAccentToggle) pageAccentToggle.checked = settings.pageAccentEnabled;
    if (navPrevInput) navPrevInput.value = settings.navPrevKey;
    if (navNextInput) navNextInput.value = settings.navNextKey;
    if (revealInput) revealInput.value = settings.revealKey;
    if (themeToggle) {
      const prefersDark = themeQuery?.matches ?? window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = settings.themePreference === "dark" || settings.themePreference === "system" && prefersDark;
      themeToggle.checked = isDark;
    }
    optionInputs.forEach((input, index) => {
      input.value = settings.optionKeys[index] ?? "";
    });
    syncTemplateSettingsUI();
    if (commonPromptInput) {
      commonPromptInput.value = settings.commonPrompt ?? "";
    }
    if (explanationLevelSelect) {
      explanationLevelSelect.value = settings.explanationLevel;
    }
    Object.entries(explanationPromptInputs).forEach(([key, input]) => {
      const prompt = settings.explanationPrompts?.[key];
      if (input && typeof prompt === "string") {
        input.value = prompt;
      }
    });
    applySidebarVisibility(settings.searchVisible, settings.noteVisible);
    applyChatSettings();
    applyTheme();
    updateChatTemplatesUI();
  }
  function syncTemplateSettingsUI() {
    if (!chatTemplateRows.length) return;
    const templates = settings.chatTemplates ?? [];
    const count = getTemplateCount();
    chatTemplateRows.forEach((row, index) => {
      const template = templates[index];
      row.enabled.checked = template?.enabled ?? false;
      row.label.value = template?.label ?? `テンプレ${index + 1}`;
      row.shortcut.value = template?.shortcut ?? "";
      row.prompt.value = template?.prompt ?? "";
      row.container.style.display = index < count ? "block" : "none";
    });
    updateTemplateControls();
  }
  function refreshQuestionInfo() {
    const nextInfo = extractQuestionInfo(document, location.href);
    if (nextInfo) {
      if (!currentInfo || !isSameInfo(currentInfo, nextInfo)) {
        currentInfo = nextInfo;
        updateInfoPanel(nextInfo);
      }
    }
    const nextSnapshot = extractQuestionSnapshot(document, location.href);
    if (nextSnapshot) {
      updateSnapshot(nextSnapshot);
    } else if (currentSnapshot) {
      currentSnapshot = null;
    }
    if (window === window.top) {
      captureQuestionImageBaseSizes();
    }
    updateHintQuickButton();
  }
  function captureQuestionImageBaseSizes() {
    const container = document.querySelector(".question-container");
    if (!container) return;
    const images = container.querySelectorAll("img");
    images.forEach((img) => {
      if (img.dataset.qbSupportBaseWidth) return;
      const record = () => {
        if (img.dataset.qbSupportBaseWidth) return;
        const rect = img.getBoundingClientRect();
        const width = Math.round(rect.width);
        if (width > 0) {
          img.dataset.qbSupportBaseWidth = String(width);
          img.style.setProperty("--qb-support-img-base-width", `${width}px`);
        }
      };
      if (img.complete) {
        record();
      } else {
        img.addEventListener("load", record, { once: true });
      }
    });
  }
  function startObservers() {
    const rootEl = root;
    const chatEl = chatRoot;
    const scheduleRefresh = debounce(() => {
      refreshQuestionInfo();
    }, 200);
    const observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => {
        const target = mutation.target;
        if (rootEl && rootEl.contains(target)) return true;
        if (chatEl && chatEl.contains(target)) return true;
        return false;
      })) {
        return;
      }
      scheduleRefresh();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    let lastUrl = location.href;
    window.setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleRefresh();
      }
    }, 500);
  }
  function attachEventHandlers() {
    const markPointerDown = (event) => {
      if (event && "pointerType" in event) {
        const pointerEvent = event;
        if (pointerEvent.pointerType && pointerEvent.pointerType !== "touch" && pointerEvent.pointerType !== "pen") {
          return;
        }
      }
      lastPointerDownAt = Date.now();
    };
    const trackHintDraftSource = (event) => {
      const target = event.target;
      if (!isEligibleHintDraftSource(target)) return;
      lastHintDraftSource = target;
    };
    document.addEventListener("focusin", trackHintDraftSource, true);
    document.addEventListener("input", trackHintDraftSource, true);
    window.addEventListener("pointerdown", markPointerDown, { capture: true, passive: true });
    window.addEventListener("touchstart", markPointerDown, { capture: true, passive: true });
    window.addEventListener(
      "keydown",
      (event) => {
        const debug = settings.debugEnabled;
        const shouldLogKey = isTargetKey(event.key);
        if (shouldLogKey) {
          logInfo("[QB_SUPPORT][key-capture]", {
            key: event.key,
            url: location.href,
            frame: window === window.top ? "top" : "iframe",
            active: document.hasFocus(),
            activeEl: document.activeElement?.tagName ?? null,
            modifiers: {
              meta: event.metaKey,
              ctrl: event.ctrlKey,
              alt: event.altKey,
              shift: event.shiftKey
            }
          });
        }
        if (debug) {
          logVerbose("[QB_SUPPORT][key]", {
            key: event.key,
            composing: event.isComposing,
            activeTag: document.activeElement?.tagName ?? null,
            targetTag: event.target instanceof HTMLElement ? event.target.tagName : null,
            pageReady: isQuestionPage(),
            shortcutsEnabled: settings.shortcutsEnabled
          });
        }
        if (!settings.shortcutsEnabled) return;
        if (event.isComposing) return;
        const key = normalizeKey(event.key);
        const navPrevMatch = isShortcutMatch(event, settings.navPrevKey);
        const navNextMatch = isShortcutMatch(event, settings.navNextKey);
        const isNavKey = navPrevMatch || navNextMatch;
        const navShortcut = navPrevMatch ? settings.navPrevKey : navNextMatch ? settings.navNextKey : "";
        const navBaseKey = navShortcut ? getShortcutBaseKey(navShortcut) : "";
        const optionIndex = settings.optionKeys.findIndex(
          (shortcut) => isShortcutMatch(event, shortcut)
        );
        const isOptionKey = optionIndex >= 0;
        const optionBaseKey = isOptionKey && settings.optionKeys[optionIndex] ? getShortcutBaseKey(settings.optionKeys[optionIndex]) : "";
        const isTyping = isTypingTarget(event.target);
        if (isTyping && !event.ctrlKey) return;
        const templateShortcut = getChatTemplateShortcut(event);
        if (templateShortcut && window === window.top && (!isTyping || event.ctrlKey)) {
          consumeShortcutEvent(event);
          void sendTemplateMessage(templateShortcut);
          return;
        }
        if (isShortcutMatch(event, CHAT_NEW_SHORTCUT) && window === window.top) {
          consumeShortcutEvent(event);
          resetChatHistory("会話をリセットしました");
          void saveSettings({ ...settings, chatOpen: true });
          return;
        }
        if (isShortcutMatch(event, "Ctrl+S") && window === window.top) {
          const sincePointerDown = Date.now() - lastPointerDownAt;
          if (sincePointerDown >= 0 && sincePointerDown < 600) {
            if (debug) {
              logVerbose("[QB_SUPPORT][key-skip]", {
                key: event.key,
                reason: "recent-touch",
                sincePointerDown
              });
            }
            return;
          }
          consumeShortcutEvent(event);
          if (!chatSettingsPanel) {
            ensureChatUI();
          }
          if (!settings.chatOpen) {
            void saveSettings({ ...settings, chatOpen: true }).then(() => {
              toggleChatSettings(true);
            });
          } else {
            toggleChatSettings();
          }
          return;
        }
        if (isShortcutMatch(event, CHAT_INPUT_TOGGLE_SHORTCUT) && window === window.top) {
          consumeShortcutEvent(event);
          toggleChatInputFocus();
          return;
        }
        if (!isQuestionPage()) {
          if (shouldLogKey) {
            logInfo("[QB_SUPPORT][frame-skip]", {
              key: event.key,
              url: location.href,
              frame: window === window.top ? "top" : "iframe",
              reason: "no-question-container"
            });
          }
          return;
        }
        if (isShortcutMatch(event, CHAT_TOGGLE_SHORTCUT) && window === window.top) {
          consumeShortcutEvent(event);
          void saveSettings({ ...settings, chatOpen: !settings.chatOpen });
          return;
        }
        if (isShortcutMatch(event, settings.shortcut)) {
          consumeShortcutEvent(event);
          if (debug) {
            logVerbose("[QB_SUPPORT][toggle]", {
              prevented: true,
              target: describeElement(event.target)
            });
          }
          const next = !settings.enabled;
          if (next) {
            void saveSettings({ ...settings, enabled: true });
          } else {
            void closeSettingsPanel();
          }
          return;
        }
        const revealMatch = isShortcutMatch(event, settings.revealKey);
        if (hasModifier(event) && !isNavKey && !isOptionKey && !revealMatch) {
          if (shouldLogKey) {
            logInfo("[QB_SUPPORT][key-skip]", {
              key: event.key,
              reason: "modifier",
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          return;
        }
        if (isNavKey && navBaseKey) {
          if (window === window.top) {
            sendAction({
              action: "nav",
              key: navBaseKey.toLowerCase()
            }, event);
            return;
          }
          const target = getNavigationTarget(
            document,
            navNextMatch ? "next" : "prev"
          );
          if (shouldLogKey) {
            logInfo("[QB_SUPPORT][nav-target]", {
              key: navBaseKey,
              target: describeElement(target),
              meta: describeElementMeta(target),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (debug) {
            logVerbose("[QB_SUPPORT][nav]", {
              key: navBaseKey,
              target: describeElement(target)
            });
          }
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          const beforeUrl = location.href;
          clickWithFallback(target, { tag: "nav", logAlways: shouldLogKey });
          if (shouldLogKey) {
            window.setTimeout(() => {
              logInfo("[QB_SUPPORT][nav-effect]", {
                key: navBaseKey,
                beforeUrl,
                afterUrl: location.href,
                changed: location.href !== beforeUrl,
                frame: window === window.top ? "top" : "iframe"
              });
            }, 200);
          }
          return;
        }
        if (isOptionKey && optionBaseKey) {
          const index = optionIndex;
          if (window === window.top) {
            sendAction(
              {
                action: "option",
                key: optionBaseKey.toLowerCase(),
                index
              },
              event
            );
            return;
          }
          const options = getOptionElements(document);
          if (options.length <= index) return;
          const clickable = getClickableOptionElement(options[index]);
          if (shouldLogKey) {
            logInfo("[QB_SUPPORT][option-target]", {
              key: optionBaseKey,
              index,
              optionCount: options.length,
              target: describeElement(clickable),
              meta: describeElementMeta(clickable),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (debug) {
            logVerbose("[QB_SUPPORT][option]", {
              key: optionBaseKey,
              index,
              optionCount: options.length,
              target: describeElement(clickable)
            });
          }
          if (!clickable) return;
          event.preventDefault();
          event.stopPropagation();
          const beforeState = getOptionState(options[index]);
          clickWithFallback(clickable, { tag: "option", logAlways: shouldLogKey });
          if (shouldLogKey) {
            window.setTimeout(() => {
              const afterState = getOptionState(options[index]);
              logInfo("[QB_SUPPORT][option-effect]", {
                key: optionBaseKey,
                before: beforeState,
                after: afterState,
                changed: !isSameOptionState(beforeState, afterState),
                frame: window === window.top ? "top" : "iframe"
              });
            }, 120);
          }
          return;
        }
        if (revealMatch) {
          if (window === window.top) {
            sendAction(
              {
                action: "reveal",
                key: getShortcutBaseKey(settings.revealKey).toLowerCase()
              },
              event
            );
            return;
          }
          const revealButton = getAnswerRevealButton(document);
          if (shouldLogKey) {
            logInfo("[QB_SUPPORT][reveal-target]", {
              key: getShortcutBaseKey(settings.revealKey),
              target: describeElement(revealButton),
              meta: describeElementMeta(revealButton),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (revealButton) {
            if (debug) {
              logVerbose("[QB_SUPPORT][reveal]", {
                target: describeElement(revealButton)
              });
            }
            event.preventDefault();
            event.stopPropagation();
            const beforeState = getRevealState();
            clickWithFallback(revealButton, { tag: "reveal", logAlways: shouldLogKey });
            if (shouldLogKey) {
              window.setTimeout(() => {
                const afterState = getRevealState();
                logInfo("[QB_SUPPORT][reveal-effect]", {
                  key: getShortcutBaseKey(settings.revealKey),
                  before: beforeState,
                  after: afterState,
                  changed: !isSameRevealState(beforeState, afterState),
                  frame: window === window.top ? "top" : "iframe"
                });
              }, 200);
            }
            return;
          }
          const submitButton = getSubmitButton(document);
          if (shouldLogKey) {
            logInfo("[QB_SUPPORT][submit-target]", {
              key,
              target: describeElement(submitButton),
              meta: describeElementMeta(submitButton),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (debug) {
            logVerbose("[QB_SUPPORT][submit]", {
              target: describeElement(submitButton)
            });
          }
          if (submitButton) {
            event.preventDefault();
            event.stopPropagation();
            const beforeState = getRevealState();
            clickWithFallback(submitButton, { tag: "submit", logAlways: shouldLogKey });
            if (shouldLogKey) {
              window.setTimeout(() => {
                const afterState = getRevealState();
                logInfo("[QB_SUPPORT][submit-effect]", {
                  key,
                  before: beforeState,
                  after: afterState,
                  changed: !isSameRevealState(beforeState, afterState),
                  frame: window === window.top ? "top" : "iframe"
                });
              }, 200);
            }
            void clickRevealWhenReady();
          }
        }
      },
      { capture: true }
    );
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target || !isInteractiveTarget(target)) return;
        logInfo("[QB_SUPPORT][click-capture]", {
          type: event.type,
          trusted: event.isTrusted,
          target: describeElement(target),
          url: location.href,
          frame: window === window.top ? "top" : "iframe"
        });
      },
      { capture: true }
    );
    document.addEventListener(
      "mousedown",
      (event) => {
        if (!panel || panel.classList.contains("is-hidden")) return;
        const target = event.target;
        if (!target) return;
        if (panel.contains(target)) return;
        if (launcher && launcher.contains(target)) return;
        void closeSettingsPanel();
      },
      { capture: true }
    );
  }
  function removeHeaderGearButton() {
    const legacy = document.getElementById("qb-support-gear");
    if (legacy) legacy.remove();
  }
  function createGearIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M19.4 13.5c.04-.5.04-1 0-1.5l2.1-1.6c.2-.2.3-.5.2-.8l-2-3.4c-.1-.3-.5-.4-.8-.3l-2.5 1a7.2 7.2 0 0 0-1.3-.7l-.4-2.7c0-.3-.3-.5-.6-.5h-4c-.3 0-.6.2-.6.5l-.4 2.7c-.5.2-.9.4-1.3.7l-2.5-1c-.3-.1-.6 0-.8.3l-2 3.4c-.1.3 0 .6.2.8l2.1 1.6c-.04.5-.04 1 0 1.5L2 15.1c-.2.2-.3.5-.2.8l2 3.4c.1.3.5.4.8.3l2.5-1c.4.3.8.5 1.3.7l.4 2.7c0 .3.3.5.6.5h4c.3 0 .6-.2.6-.5l.4-2.7c.5-.2.9-.4 1.3-.7l2.5 1c.3.1.6 0 .8-.3l2-3.4c.1-.3 0-.6-.2-.8l-2.1-1.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
    );
    svg.appendChild(path);
    return svg;
  }
  function updateInfoPanel(info) {
    if (!panel) return;
    setField("id", info.id ?? "-");
    setField("progress", info.progressText ?? "-");
    setField("options", info.optionCount?.toString() ?? "-");
    setField("pageRef", info.pageRef ?? "-");
    setField("tags", info.tags.length > 0 ? info.tags.join(", ") : "-");
    setField("updated", formatTime(info.updatedAt));
  }
  function setField(key, value) {
    const field = infoFields[key];
    if (field) field.textContent = value;
  }
  function setStatus(message, isError) {
    if (!statusField) return;
    statusField.textContent = message;
    statusField.classList.toggle("is-error", isError);
    if (message) {
      window.setTimeout(() => {
        if (statusField?.textContent === message) {
          statusField.textContent = "";
        }
      }, 2400);
    }
  }
  function isSameInfo(a, b) {
    return a.id === b.id && a.progressText === b.progressText && a.pageRef === b.pageRef && a.optionCount === b.optionCount && a.tags.join(",") === b.tags.join(",");
  }
  function makeSectionTitle(text) {
    const title = document.createElement("button");
    title.type = "button";
    title.className = "qb-support-section-title qb-support-section-toggle";
    title.textContent = text;
    title.setAttribute("aria-expanded", "true");
    const toggle = () => {
      const section = title.parentElement;
      if (!section) return;
      const collapsed = section.dataset.collapsed === "true";
      section.dataset.collapsed = collapsed ? "false" : "true";
      title.setAttribute("aria-expanded", collapsed ? "true" : "false");
    };
    title.addEventListener("click", toggle);
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
    return title;
  }
  function makeSpan(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }
  function createSwitch(labelText, checked, onChange) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "qb-support-toggle-input";
    input.checked = checked;
    input.addEventListener("change", () => {
      onChange(input.checked);
    });
    const label = document.createElement("label");
    label.className = "qb-support-toggle qb-support-switch";
    label.appendChild(input);
    label.appendChild(makeSpan(labelText));
    const track = document.createElement("span");
    track.className = "qb-support-switch-track";
    label.appendChild(track);
    return { label, input };
  }
  function createOverlaySelect(options, className) {
    const select = document.createElement("select");
    select.className = `qb-support-select qb-support-select-overlay qb-support-select-pill${className ? ` ${className}` : ""}`;
    options.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
    return select;
  }
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    const seconds = `${date.getSeconds()}`.padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }
  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }
  function consumeShortcutEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
  function isTypingTarget(target) {
    if (!target || !(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") {
      const type = (target.type || "text").toLowerCase();
      if (["checkbox", "radio", "button", "submit", "file", "hidden", "image", "range", "color", "reset", "week", "month", "date", "datetime-local", "time"].includes(type)) {
        return false;
      }
      return true;
    }
    return false;
  }
  function isQuestionPage() {
    return document.querySelector(".question-container") !== null;
  }
  function isQbHost() {
    return location.hostname.includes("qb.medilink-study.com");
  }
  function isInputHost() {
    return location.hostname.includes("input.medilink-study.com");
  }
  function attachMessageHandlers() {
    window.addEventListener("message", (event) => {
      if (event.origin !== QB_TOP_ORIGIN && event.origin !== QB_ACTION_ORIGIN) return;
      const data = event.data;
      if (!data || data.__qb_support !== true) return;
      if (data.type === "QB_ACTION") {
        const action = data.action;
        const key = typeof data.key === "string" ? data.key : "";
        const index = typeof data.index === "number" ? data.index : null;
        logInfo("[QB_SUPPORT][action-recv]", {
          url: location.href,
          frame: window === window.top ? "top" : "iframe",
          action,
          key,
          index
        });
        handleActionInFrame(action, key, index, "message");
        return;
      }
      if (data.type === "QB_QUESTION_REQUEST") {
        if (!isInputHost() && window === window.top) return;
        const snapshot = extractQuestionSnapshot(document, location.href);
        const response = {
          __qb_support: true,
          type: "QB_QUESTION_SNAPSHOT",
          requestId: data.requestId ?? null,
          snapshot
        };
        const target = event.source && "postMessage" in event.source ? event.source : window.parent;
        try {
          target.postMessage(response, QB_TOP_ORIGIN);
        } catch (error) {
          console.warn("[QB_SUPPORT][question-reply]", error);
        }
        return;
      }
      if (data.type === "QB_ANSWER_REQUEST") {
        if (!isInputHost() && window === window.top) return;
        const answerContext = extractAnswerExplanationContext(document);
        const response = {
          __qb_support: true,
          type: "QB_ANSWER_CONTEXT",
          requestId: data.requestId ?? null,
          text: answerContext.text ?? "",
          meta: answerContext.meta ?? null
        };
        const target = event.source && "postMessage" in event.source ? event.source : window.parent;
        try {
          target.postMessage(response, QB_TOP_ORIGIN);
        } catch (error) {
          console.warn("[QB_SUPPORT][answer-reply]", error);
        }
        return;
      }
      if (data.type === "QB_ANSWER_WATCH_START") {
        if (!isInputHost() && window === window.top) return;
        const timeoutMs = typeof data.timeoutMs === "number" ? data.timeoutMs : 1500;
        startAnswerObserver({ once: true });
        window.setTimeout(() => {
          stopAnswerObserver();
        }, timeoutMs);
        return;
      }
      if (data.type === "QB_ANSWER_CONTEXT_PUSH") {
        const context = data.context ?? null;
        if (context?.text) {
          cachedAnswerContext = context;
        }
        if (pendingAnswerResolvers.length) {
          const pending = pendingAnswerResolvers.slice();
          pendingAnswerResolvers = [];
          pending.forEach((resolve) => resolve(cachedAnswerContext ?? { text: "", meta: null }));
        }
        return;
      }
      if (data.type === "QB_QUESTION_SNAPSHOT") {
        if (data.snapshot) {
          updateSnapshot(data.snapshot);
        }
      }
    });
  }
  function findTargetFrames() {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.filter((frame) => {
      const src = frame.getAttribute("src") ?? "";
      return src.includes("input.medilink-study.com");
    });
  }
  function getFrameOrigin(frame) {
    const src = frame.getAttribute("src") ?? "";
    if (!src) return "";
    try {
      return new URL(src, location.href).origin;
    } catch {
      return "";
    }
  }
  function postToInputFrame(message) {
    const errors = [];
    const frames = findTargetFrames();
    for (let i = 0; i < frames.length; i += 1) {
      const frame = frames[i];
      if (!frame.contentWindow) continue;
      const origin = getFrameOrigin(frame) || "*";
      const targetOrigin = frame.dataset.loaded === "true" ? origin : "*";
      try {
        frame.contentWindow.postMessage(message, targetOrigin);
        return { sent: true, method: "querySelector", frameIndex: i, errors };
      } catch (error) {
        errors.push(`querySelector[${i}]: ${String(error)}`);
      }
    }
    return { sent: false, method: "none", frameIndex: null, errors };
  }
  function postToAnswerFrame(message) {
    if (!answerFrameEl || !answerFrameEl.contentWindow) return false;
    const origin = getFrameOrigin(answerFrameEl) || "*";
    const targetOrigin = answerFrameEl.dataset.loaded === "true" ? origin : "*";
    try {
      answerFrameEl.contentWindow.postMessage(message, targetOrigin);
      return true;
    } catch {
      return false;
    }
  }
  function requestQuestionSnapshotFromFrame(timeoutMs) {
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const handler = (event) => {
        if (event.origin !== QB_ACTION_ORIGIN) return;
        const data = event.data;
        if (!data || data.__qb_support !== true) return;
        if (data.type !== "QB_QUESTION_SNAPSHOT") return;
        if (data.requestId !== requestId) return;
        window.removeEventListener("message", handler);
        resolve(data.snapshot ?? null);
      };
      window.addEventListener("message", handler);
      const result = postToInputFrame({
        __qb_support: true,
        type: "QB_QUESTION_REQUEST",
        requestId
      });
      if (!result.sent) {
        window.removeEventListener("message", handler);
        resolve(null);
        return;
      }
      window.setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(null);
      }, timeoutMs);
    });
  }
  function requestAnswerContextFromFrame(timeoutMs) {
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const handler = (event) => {
        if (event.origin !== QB_ACTION_ORIGIN) return;
        const data = event.data;
        if (!data || data.__qb_support !== true) return;
        if (data.type !== "QB_ANSWER_CONTEXT") return;
        if (data.requestId !== requestId) return;
        window.removeEventListener("message", handler);
        resolve({ text: data.text ?? "", meta: data.meta ?? null });
      };
      window.addEventListener("message", handler);
      const message = {
        __qb_support: true,
        type: "QB_ANSWER_REQUEST",
        requestId
      };
      const sent = postToAnswerFrame(message) || postToInputFrame(message).sent;
      if (!sent) {
        window.removeEventListener("message", handler);
        resolve({ text: "", meta: null });
        return;
      }
      window.setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({ text: "", meta: null });
      }, timeoutMs);
    });
  }
  function logFramesOnce() {
    if (document.documentElement.dataset.qbSupportFrames === "true") return;
    document.documentElement.dataset.qbSupportFrames = "true";
    if (window !== window.top) return;
    logInfo("[QB_SUPPORT][frames]", {
      url: location.href,
      frameCount: document.querySelectorAll("iframe").length,
      sources: listFrameSources(),
      windowFrames: window.frames.length
    });
  }
  function listFrameSources() {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.map((frame) => frame.getAttribute("src") ?? "");
  }
  function getTemplateShortcutKeys() {
    const keys = [];
    for (const template of getEnabledChatTemplates()) {
      const normalized = normalizeShortcut(template.shortcut);
      if (!normalized) continue;
      const parts = normalized.split("+");
      const key = parts[parts.length - 1];
      if (key) keys.push(key);
    }
    return keys;
  }
  function getShortcutBaseKey(shortcut) {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return "";
    const parts = normalized.split("+");
    return parts[parts.length - 1] ?? "";
  }
  function isTargetKey(rawKey) {
    const key = normalizeKey(rawKey);
    const optionKeys = settings.optionKeys.map((shortcut) => getShortcutBaseKey(shortcut)).filter(Boolean);
    return key === getShortcutBaseKey(settings.navPrevKey) || key === getShortcutBaseKey(settings.navNextKey) || key === getShortcutBaseKey(settings.revealKey) || key === getShortcutBaseKey(CHAT_TOGGLE_SHORTCUT) || getTemplateShortcutKeys().includes(key) || optionKeys.includes(key);
  }
  function hasModifier(event) {
    return event.metaKey || event.ctrlKey || event.altKey;
  }
  function getChatTemplateShortcut(event) {
    for (const template of getEnabledChatTemplates()) {
      if (!template.shortcut) continue;
      if (isShortcutMatch(event, template.shortcut)) return template;
    }
    return null;
  }
  function normalizeKey(rawKey) {
    if (rawKey === " ") return "Space";
    if (rawKey.length === 1) return rawKey.toUpperCase();
    const lower = rawKey.toLowerCase();
    if (lower === "arrowleft") return "ArrowLeft";
    if (lower === "arrowright") return "ArrowRight";
    if (lower === "arrowup") return "ArrowUp";
    if (lower === "arrowdown") return "ArrowDown";
    if (lower === "escape" || lower === "esc") return "Escape";
    if (lower === "enter") return "Enter";
    if (lower === "tab") return "Tab";
    if (lower === "backspace") return "Backspace";
    return rawKey;
  }
  function handleActionInFrame(action, key, index, source) {
    if (!isQuestionPage()) return;
    const frameLabel = window === window.top ? "top" : "iframe";
    if (action === "nav") {
      const target = getNavigationTarget(document, key === "arrowright" ? "next" : "prev");
      logInfo("[QB_SUPPORT][nav-target]", {
        key,
        target: describeElement(target),
        meta: describeElementMeta(target),
        url: location.href,
        frame: frameLabel,
        source
      });
      if (!target) return;
      const beforeUrl = location.href;
      void (async () => {
        const ok = await clickWithCdp(target, "nav");
        if (!ok) clickWithFallback(target, { tag: "nav", logAlways: true });
      })();
      window.setTimeout(() => {
        logInfo("[QB_SUPPORT][nav-effect]", {
          key,
          beforeUrl,
          afterUrl: location.href,
          changed: location.href !== beforeUrl,
          frame: frameLabel,
          source
        });
      }, 200);
      return;
    }
    if (action === "option") {
      if (index === null) return;
      const options = getOptionElements(document);
      if (options.length <= index) return;
      const clickable = getClickableOptionElement(options[index]);
      logInfo("[QB_SUPPORT][option-target]", {
        key,
        index,
        optionCount: options.length,
        target: describeElement(clickable),
        meta: describeElementMeta(clickable),
        url: location.href,
        frame: frameLabel,
        source
      });
      if (!clickable) return;
      const beforeState = getOptionState(options[index]);
      void (async () => {
        const ok = await clickWithCdp(clickable, "option");
        if (!ok) clickWithFallback(clickable, { tag: "option", logAlways: true });
      })();
      window.setTimeout(() => {
        const afterState = getOptionState(options[index]);
        logInfo("[QB_SUPPORT][option-effect]", {
          key,
          before: beforeState,
          after: afterState,
          changed: !isSameOptionState(beforeState, afterState),
          frame: frameLabel,
          source
        });
      }, 120);
      return;
    }
    if (action === "reveal") {
      const revealButton = getAnswerRevealButton(document);
      logInfo("[QB_SUPPORT][reveal-target]", {
        key,
        target: describeElement(revealButton),
        meta: describeElementMeta(revealButton),
        url: location.href,
        frame: frameLabel,
        source
      });
      if (revealButton) {
        const beforeState = getRevealState();
        void (async () => {
          const ok = await clickWithCdp(revealButton, "reveal");
          if (!ok) clickWithFallback(revealButton, { tag: "reveal", logAlways: true });
        })();
        window.setTimeout(() => {
          const afterState = getRevealState();
          logInfo("[QB_SUPPORT][reveal-effect]", {
            key,
            before: beforeState,
            after: afterState,
            changed: !isSameRevealState(beforeState, afterState),
            frame: frameLabel,
            source
          });
        }, 200);
        return;
      }
      const submitButton = getSubmitButton(document);
      logInfo("[QB_SUPPORT][submit-target]", {
        key,
        target: describeElement(submitButton),
        meta: describeElementMeta(submitButton),
        url: location.href,
        frame: frameLabel,
        source
      });
      if (submitButton) {
        const beforeState = getRevealState();
        void (async () => {
          const ok = await clickWithCdp(submitButton, "submit");
          if (!ok) clickWithFallback(submitButton, { tag: "submit", logAlways: true });
        })();
        window.setTimeout(() => {
          const afterState = getRevealState();
          logInfo("[QB_SUPPORT][submit-effect]", {
            key,
            before: beforeState,
            after: afterState,
            changed: !isSameRevealState(beforeState, afterState),
            frame: frameLabel,
            source
          });
        }, 200);
        void clickRevealWhenReady();
      }
    }
  }
  function isInteractiveTarget(element) {
    return Boolean(
      element.closest(
        ".multiple-answer-options, .single-answer-options, #answerSection, .custom-icon-arrow_left, .custom-icon-arrow_right"
      )
    );
  }
  function sendAction(payload, event) {
    if (hasModifier(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (window !== window.top) return;
    const message = {
      __qb_support: true,
      type: "QB_ACTION",
      action: payload.action,
      key: payload.key,
      index: payload.index ?? null
    };
    const result = postToInputFrame(message);
    if (!result.sent) {
      logInfo("[QB_SUPPORT][action-sent]", {
        url: location.href,
        frame: "top",
        action: payload.action,
        key: payload.key,
        index: payload.index ?? null,
        status: "no-target-frame",
        frames: listFrameSources(),
        frameCount: window.frames.length,
        errors: result.errors
      });
      logInfo("[QB_SUPPORT][action-local]", {
        url: location.href,
        frame: "top",
        action: payload.action,
        key: payload.key,
        index: payload.index ?? null,
        reason: "no-target-frame"
      });
      handleActionInFrame(payload.action, payload.key, payload.index ?? null, "local");
      return;
    }
    logInfo("[QB_SUPPORT][action-sent]", {
      url: location.href,
      frame: "top",
      action: payload.action,
      key: payload.key,
      index: payload.index ?? null,
      status: "sent",
      method: result.method,
      frameIndex: result.frameIndex
    });
  }
  function getOptionState(option) {
    if (!option) return null;
    const ans = option.querySelector(".ans") ?? option;
    const input = option.querySelector("input");
    return {
      active: ans.classList.contains("active"),
      checked: input ? input.checked : null,
      text: (ans.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80)
    };
  }
  function isSameOptionState(a, b) {
    return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  }
  function getRevealState() {
    const answerSection = document.getElementById("answerSection");
    const button = answerSection?.querySelector(".btn");
    return {
      hasAnswerSection: Boolean(answerSection),
      buttonText: button?.textContent?.trim() ?? null,
      answerSectionText: answerSection?.textContent?.trim().slice(0, 80) ?? null
    };
  }
  function isSameRevealState(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function logInjectionOnce() {
    if (document.documentElement.dataset.qbSupportInjected === "true") return;
    document.documentElement.dataset.qbSupportInjected = "true";
    const manifest = getManifest();
    const version = manifest?.version ?? "unknown";
    logInfo("[QB_SUPPORT][inject]", {
      url: location.href,
      frame: window === window.top ? "top" : "iframe",
      ts: Date.now(),
      version
    });
  }
  function ensureMarker() {
    if (document.getElementById(MARKER_ID)) return;
    const marker = document.createElement("div");
    const manifest = getManifest();
    const version = manifest?.version ?? "unknown";
    marker.id = MARKER_ID;
    marker.dataset.version = version;
    marker.textContent = `QB_SUPPORT injected v${version}`;
    Object.assign(marker.style, {
      position: "fixed",
      bottom: "8px",
      left: "8px",
      zIndex: "2147483647",
      fontSize: "10px",
      opacity: "0.4",
      padding: "2px 6px",
      borderRadius: "6px",
      background: "rgba(8, 18, 28, 0.6)",
      color: "#f5fbff",
      pointerEvents: "none"
    });
    document.body.appendChild(marker);
  }
  function toggleMarker(visible) {
    const marker = document.getElementById(MARKER_ID);
    if (!marker) return;
    marker.style.display = visible ? "block" : "none";
  }
  function applySidebarVisibility(searchVisible, noteVisible) {
    const styleId = "qb-support-sidebar-style";
    let style = document.getElementById(styleId);
    if (!searchVisible && !noteVisible) {
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
        .contents__right { display: none !important; }
        .contents__left { width: 100% !important; }
        .question-container { max-width: none !important; }
        .question-wrapper .header,
        .question-main {
          margin-left: auto !important;
          margin-right: 0 !important;
        }
      `;
        document.head.appendChild(style);
      }
    } else if (style) {
      style.remove();
    }
    toggleWidgetVisibility("qb-support-search-style", ".widget-search", searchVisible);
    toggleWidgetVisibility("qb-support-note-style", ".widget-note", noteVisible);
  }
  function toggleWidgetVisibility(styleId, selector, visible) {
    let style = document.getElementById(styleId);
    if (!visible) {
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
        ${selector} { display: none !important; }
      `;
        document.head.appendChild(style);
      }
      return;
    }
    if (style) style.remove();
  }
  async function clickRevealWhenReady() {
    const revealButton = await waitForRevealButton(2e3);
    if (settings.debugEnabled) {
      logVerbose("[QB_SUPPORT][reveal-wait]", {
        found: !!revealButton,
        target: describeElement(revealButton)
      });
    }
    if (!revealButton) return;
    clickWithFallback(revealButton, {
      tag: "reveal-wait",
      logAlways: settings.debugEnabled
    });
  }
  function waitForRevealButton(timeoutMs) {
    return new Promise((resolve) => {
      const initial = getAnswerRevealButton(document);
      if (initial) {
        if (settings.debugEnabled) {
          logVerbose("[QB_SUPPORT][reveal-check]", {
            phase: "initial",
            target: describeElement(initial)
          });
        }
        resolve(initial);
        return;
      }
      const observer = new MutationObserver(() => {
        const found = getAnswerRevealButton(document);
        if (found) {
          observer.disconnect();
          if (settings.debugEnabled) {
            logVerbose("[QB_SUPPORT][reveal-check]", {
              phase: "mutation",
              target: describeElement(found)
            });
          }
          resolve(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => {
        observer.disconnect();
        if (settings.debugEnabled) {
          logVerbose("[QB_SUPPORT][reveal-check]", {
            phase: "timeout"
          });
        }
        resolve(null);
      }, timeoutMs);
    });
  }
  function clickWithFallback(target, options) {
    const tag = options?.tag;
    const logAlways = options?.logAlways ?? false;
    target.click();
    logClick(tag, "element.click", target, logAlways);
    const events = ["pointerdown", "pointerup", "mousedown", "mouseup", "click"];
    for (const type of events) {
      const event = createPointerLikeEvent(type);
      const result = target.dispatchEvent(event);
      logClick(tag, `dispatch:${type}`, target, logAlways, result);
    }
  }
  function describeElement(element) {
    if (!element) return null;
    const tag = element.tagName.toLowerCase();
    const cls = element.className ? `.${element.className.toString().trim().replace(/\\s+/g, ".")}` : "";
    const text = (element.textContent ?? "").trim().replace(/\\s+/g, " ").slice(0, 80);
    return `${tag}${cls}${text ? ` "${text}"` : ""}`;
  }
  async function clickWithCdp(target, tag) {
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    try {
      const response = await sendRuntimeMessage({
        type: "QB_CDP_CLICK",
        x,
        y
      });
      if (response?.ok) {
        logInfo("[QB_SUPPORT][cdp-click]", { tag, ok: true, x, y });
        return true;
      }
      const error = response?.error ?? "Unknown error";
      console.warn("[QB_SUPPORT][cdp-click]", { tag, ok: false, error, x, y });
      setStatus(`CDP click失敗: ${error}`, true);
    } catch (error) {
      console.warn("[QB_SUPPORT][cdp-click]", { tag, ok: false, error });
      setStatus("CDP click失敗", true);
    }
    return false;
  }
  function describeElementMeta(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      connected: element.isConnected,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      offsetParent: element.offsetParent ? element.offsetParent.tagName : null
    };
  }
  function createPointerLikeEvent(type) {
    const init2 = { bubbles: true, cancelable: true };
    if (type.startsWith("pointer") && "PointerEvent" in window) {
      return new PointerEvent(type, init2);
    }
    return new MouseEvent(type, init2);
  }
  function logClick(tag, method, target, logAlways, result) {
    if (!settings.debugEnabled && !logAlways) return;
    const payload = {
      tag,
      method,
      target: describeElement(target)
    };
    if (typeof result === "boolean") payload.result = result;
    logInfo("[QB_SUPPORT][click]", payload);
  }
  start();
})();
