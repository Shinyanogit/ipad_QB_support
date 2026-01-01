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
  var NEXT_KEYWORDS = ["\u6B21\u3078", "\u6B21\u306E\u554F\u984C", "\u6B21", "Next"];
  var PREV_KEYWORDS = ["\u524D\u3078", "\u524D\u306E\u554F\u984C", "\u524D", "Prev", "Previous"];
  var SUBMIT_KEYWORDS = [
    "\u56DE\u7B54\u3092\u9001\u4FE1",
    "\u89E3\u7B54\u3092\u9001\u4FE1",
    "\u56DE\u7B54\u3092\u63D0\u51FA",
    "\u89E3\u7B54\u3092\u63D0\u51FA",
    "\u9001\u4FE1\u3059\u308B",
    "\u63D0\u51FA\u3059\u308B",
    "\u5224\u5B9A\u3059\u308B",
    "\u63A1\u70B9\u3059\u308B"
  ];
  var REVEAL_KEYWORDS = ["\u89E3\u7B54\u3092\u78BA\u8A8D\u3059\u308B", "\u89E3\u7B54\u3092\u78BA\u8A8D", "\u89E3\u7B54\u3092\u898B\u308B", "\u89E3\u8AAC\u3092\u898B\u308B"];
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
    "gpt-5.2",
    "gpt-5.2-chat-latest",
    "gpt-5",
    "gpt-4.1",
    "gpt-4o"
  ];
  var CHAT_TEMPLATE_LIMIT = 5;
  var DEFAULT_EXPLANATION_PROMPTS = {
    highschool: "\u9AD8\u6821\u751F\u3067\u3082\u308F\u304B\u308B\u3088\u3046\u306B\u3001\u5C02\u9580\u7528\u8A9E\u306F\u3067\u304D\u308B\u3060\u3051\u907F\u3051\u3001\u5FC5\u8981\u306A\u3089\u7C21\u5358\u306A\u8A00\u3044\u63DB\u3048\u3068\u77ED\u3044\u4F8B\u3048\u3092\u6DFB\u3048\u3066\u8AAC\u660E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    "med-junior": "\u533B\u5B66\u90E8\u4F4E\u5B66\u5E74\u5411\u3051\u306B\u3001\u57FA\u672C\u7684\u306A\u5C02\u9580\u7528\u8A9E\u306F\u4F7F\u3063\u3066\u3088\u3044\u306E\u3067\u3001\u91CD\u8981\u30DD\u30A4\u30F3\u30C8\u3092\u7C21\u6F54\u306B\u6574\u7406\u3057\u3066\u8AAC\u660E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    "med-senior": "\u533B\u5B66\u90E8\u9AD8\u5B66\u5E74\u301C\u7814\u4FEE\u533B\u30EC\u30D9\u30EB\u3067\u3001\u75C5\u614B\u751F\u7406\u3084\u9451\u5225\u30DD\u30A4\u30F3\u30C8\u306B\u8E0F\u307F\u8FBC\u307F\u3001\u7C21\u6F54\u3060\u304C\u5BC6\u5EA6\u306E\u9AD8\u3044\u8AAC\u660E\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
  };
  var DEFAULT_CHAT_TEMPLATES = [
    {
      enabled: true,
      label: "\u30D2\u30F3\u30C8",
      shortcut: "Ctrl+Z",
      prompt: "\u7D76\u5999\u306A\u30D2\u30F3\u30C8\uFF08\u7B54\u3048\u3042\u308A\u304D\u3067\u306A\u304F\u3001\u6240\u898B\u3084\u75C7\u72B6\u304B\u3089\u63A8\u8AD6\u3059\u308B\u8996\u70B9\u3067\u601D\u8003\u529B\u3092\u990A\u3046\u7B54\u3048\u306B\u8FEB\u308A\u3059\u304E\u306A\u3044\u3082\u306E\uFF09\u3092\u3069\u3046\u305E\u3002\u203B400\u6587\u5B57\u4EE5\u5185\u3067\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    },
    {
      enabled: true,
      label: "4\u7B87\u6761",
      shortcut: "Ctrl+4",
      prompt: [
        "\u5404\u3005\u306E\u9078\u629E\u80A2\u306B\u3064\u3044\u3066\u3001\u4EE5\u4E0B\u306E4\u7B87\u6761\u3092\u5B88\u3063\u3066\u308F\u304B\u308A\u3084\u3059\u304F\u89E3\u8AAC\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        "",
        "\u2776 \u4E00\u8A00\u3067\u3044\u3046\u3068\uFF1F\uFF08\u76F4\u611F\u7684\u306A\u30A4\u30E1\u30FC\u30B8\uFF09",
        "",
        "\u305D\u306E\u75C5\u614B\u30FB\u75C7\u72B6\u30FB\u6240\u898B\u306B\u3064\u3044\u3066\u3001\u521D\u3081\u3066\u805E\u3044\u305F\u4EBA\u3067\u3082\u76F4\u611F\u7684\u306B\u7406\u89E3\u3067\u304D\u308B\u3088\u3046\u306A\u3001\u5177\u4F53\u7684\u306A\u30A4\u30E1\u30FC\u30B8\u3084\u6BD4\u55A9\u3092\u4E00\u6587\u3067\u8868\u73FE\u3059\u308B\uFF08\u57FA\u672C\u7684\u306B\u4F53\u8A00\u6B62\u3081\uFF09\u3002\u5C02\u9580\u7528\u8A9E\u3084\u53B3\u5BC6\u306A\u5B9A\u7FA9\u3067\u306F\u306A\u304F\u3001\u300C\u306A\u308B\u307B\u3069\u3001\u305D\u3046\u3044\u3046\u611F\u3058\u304B\u300D\u3068\u30A4\u30E1\u30FC\u30B8\u304C\u6E67\u304F\u8868\u73FE\u3092\u5FC3\u304C\u3051\u308B\u3002",
        "",
        "\u4F8B\uFF08\u88C2\u809B\u306E\u5834\u5408\uFF09\uFF1A",
        "\u2705 \u300C\u786C\u3044\u4FBF\u3067\u809B\u9580\u304C\u201C\u7D19\u306E\u3088\u3046\u306B\u30D4\u30EA\u30C3\u3068\u88C2\u3051\u308B\u201D\u300D",
        "\u274C \u300C\u88C2\u809B\u306E\u591A\u304F\u306F\u5F8C\u65B9\u6B63\u4E2D\u306B\u3067\u304D\u308B\u300D\uFF08\u5177\u4F53\u6027\u3084\u30A4\u30E1\u30FC\u30B8\u304C\u4E0D\u8DB3\uFF09",
        "",
        "\u2777 \u56E0\u679C\u95A2\u4FC2\u30B9\u30BF\u30A4\u30EB\uFF08Pathophysiology\u306E\u9023\u9396\uFF09",
        "",
        "\u8A3A\u65AD\u306B\u81F3\u308B\u601D\u8003\u30D7\u30ED\u30BB\u30B9\u3067\u306F\u306A\u304F\u3001\u75C5\u614B\u305D\u306E\u3082\u306E\u304C\u4F53\u5185\u3067\u5F15\u304D\u8D77\u3053\u3059\u73FE\u8C61\u306E\u9023\u9396\u3092\u6642\u7CFB\u5217\u30FB\u56E0\u679C\u95A2\u4FC2\u9806\u306B\u793A\u3059\u3002\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u300C\u2193\u2192\u300D\u3067\u7D50\u3073\u3001\u751F\u4F53\u5185\u3067\u5B9F\u969B\u306B\u8D77\u304D\u3066\u3044\u308B\u5185\u5BB9\u30FB\u75C7\u72B6\u30FB\u6240\u898B\u3092\u9806\u5E8F\u7ACB\u3066\u3066\u8868\u73FE\u3059\u308B\u3002",
        "",
        "\u4F8B\uFF08ASO\u767A\u75C7\u6A5F\u5E8F\uFF09\uFF1A",
        "\u7CD6\u5C3F\u75C5\u30FB\u9AD8\u8840\u5727\u30FB\u9AD8\u8102\u8840\u75C7\u30FB\u55AB\u7159\u306A\u3069\u306E\u52D5\u8108\u786C\u5316\u30EA\u30B9\u30AF\u2191",
        "\u2193",
        "\u4E2D\u301C\u5927\u52D5\u8108\uFF08\u4E3B\u306B\u4E0B\u80A2\u52D5\u8108\uFF09\u3067\u52D5\u8108\u786C\u5316\u6027\u30D7\u30E9\u30FC\u30AF\u5F62\u6210\uFF08\u8102\u8CEA\u6838\uFF0B\u7DDA\u7DAD\u6027\u88AB\u819C\uFF09",
        "\u2193",
        "\u7BA1\u8154\u72ED\u7A84 \u2192 \u5B89\u9759\u6642\u306F\u8840\u6D41\u4FDD\u305F\u308C\u308B\u304C\u3001\u904B\u52D5\u6642\u306F\u9700\u8981\uFF1E\u4F9B\u7D66\u306B",
        "\u2193",
        "\u4E0B\u80A2\u306E\u9593\u6B20\u6027\u8DDB\u884C\uFF08claudication\uFF09\u3001\u3055\u3089\u306B\u306F\u5B89\u9759\u6642\u75DB\u3078\u3068\u9032\u884C",
        "\u2193",
        "\u8840\u6D41\u4E0D\u8DB3\u304C\u9AD8\u5EA6\u5316 \u2192 \u672B\u68A2\u6F70\u760D\uFF08\u8DB3\u8DBE\u5148\u7AEF\u306A\u3069\uFF09\u30FB\u76AE\u819A\u840E\u7E2E\u30FB\u58CA\u75BD",
        "\u2193",
        "\u591C\u9593\u3084\u8DB3\u6319\u4E0A\u6642\u306B\u8840\u6D41\u304C\u3055\u3089\u306B\u4F4E\u4E0B \u2192 \u5B89\u9759\u6642\u75DB\u304C\u60AA\u5316 \u2192 \u8DB3\u3092\u5782\u3089\u3057\u3066\u5BDD\u308B\u3068\u697D\u306B\u306A\u308B",
        "",
        "\u2778 \u60C5\u5831\u3092\u843D\u3068\u3055\u306A\u3044",
        "",
        "\u554F\u984C\u6587\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u81E8\u5E8A\u60C5\u5831\uFF08\u75C7\u72B6\u3001\u6240\u898B\u3001\u8A98\u56E0\u3001\u80CC\u666F\u306A\u3069\uFF09\u306F\u5FC5\u305A\u56E0\u679C\u95A2\u4FC2\u30B9\u30BF\u30A4\u30EB\u5185\u306B\u9069\u5207\u306B\u7D44\u307F\u8FBC\u3080\u3002\u8FFD\u52A0\u306E\u88DC\u8DB3\u60C5\u5831\u3092\u5165\u308C\u308B\u3053\u3068\u306F\u53EF\u80FD\u3060\u304C\u3001\u5143\u306E\u554F\u984C\u6587\u306E\u60C5\u5831\u3092\u524A\u9664\u3057\u306A\u3044\u3088\u3046\u6CE8\u610F\u3059\u308B\u3002",
        "",
        "\u2779 \u6B63\u89E3\u9078\u629E\u80A2\u3092\u3048\u3053\u3072\u3044\u304D\u3057\u306A\u3044",
        "",
        "\u3059\u3079\u3066\u306E\u9078\u629E\u80A2\u306B\u5BFE\u3057\u3066\u3001\u540C\u3058\u30EC\u30D9\u30EB\u306E\u8A73\u7D30\u3055\u3068\u660E\u78BA\u3055\u3067\u89E3\u8AAC\u3092\u884C\u3046\u3002\u305F\u3060\u3057\u3001\u554F\u984C\u6587\u306E\u6240\u898B\u3084\u75C7\u72B6\u304C\u660E\u3089\u304B\u306B\u6B63\u89E3\u9078\u629E\u80A2\u306E\u75C5\u614B\u306B\u95A2\u9023\u3059\u308B\u5834\u5408\u3001\u305D\u308C\u3089\u306F\u6B63\u89E3\u9078\u629E\u80A2\u306E\u56E0\u679C\u95A2\u4FC2\u30B9\u30BF\u30A4\u30EB\u306B\u660E\u793A\u7684\u306B\u7D44\u307F\u8FBC\u3080\u3002",
        "",
        "\u2E3B",
        "",
        "\u4EE5\u4E0B\u306F\u6539\u5584\u5F8C\u306E\u5177\u4F53\u4F8B\u3067\u3059\u3002",
        "",
        "\u2705 \u6B63\u89E3\uFF1AF. Posterior midline of the anal verge",
        "",
        "\u2776 \u4E00\u8A00\u3067\u3044\u3046\u3068\uFF1F",
        "",
        "\u786C\u3044\u4FBF\u304C\u300C\u7D19\u3092\u7834\u308B\u3088\u3046\u306B\u300D\u809B\u9580\u306E\u5F8C\u308D\u5074\u3092\u88C2\u3044\u3066\u3057\u307E\u3046",
        "",
        "\u2777 \u56E0\u679C\u95A2\u4FC2\u30B9\u30BF\u30A4\u30EB",
        "",
        "\u6162\u6027\u4FBF\u79D8\u30FB\u786C\u4FBF",
        "\u2193",
        "\u809B\u9580\u90E8\u3078\u306E\u904E\u5EA6\u306A\u5F35\u529B\u3068\u4F38\u5C55",
        "\u2193",
        "\u809B\u9580\u7C98\u819C\u304C\u88C2\u3051\u308B\uFF08\u7279\u306B\u5F8C\u65B9\u6B63\u4E2D\u306F\u8840\u6D41\u304C\u5C11\u306A\u304F\u5F31\u3044\uFF09",
        "\u2193",
        "\u88C2\u809B\u5F62\u6210",
        "\uFF0B",
        "\u809B\u9580\u62EC\u7D04\u7B4B\u306E\u3051\u3044\u308C\u3093 \u2192 \u88C2\u5275\u306E\u6CBB\u7652\u304C\u9045\u308C\u3001\u5F37\u3044\u75DB\u307F",
        "",
        "\u2778 \u60C5\u5831\u3092\u843D\u3068\u3055\u306A\u3044",
        "\u2022 \u88C2\u809B\u306F\u6B6F\u72B6\u7DDA\u3088\u308A\u9060\u4F4D\uFF08\u76AE\u819A\u5BC4\u308A\uFF09\u306E\u7E26\u65B9\u5411\u306E\u88C2\u5275",
        "\u2022 \u786C\u4FBF\u306E\u901A\u904E\u3001\u6162\u6027\u4FBF\u79D8\u3001\u904E\u5EA6\u306E\u4F38\u5C55\u304C\u8A98\u56E0\u3068\u306A\u308B",
        "\u2022 \u5F8C\u65B9\u6B63\u4E2D\u304C\u8840\u6D41\u4E0D\u8DB3\u306E\u305F\u3081\u6700\u3082\u8D77\u3053\u308A\u3084\u3059\u3044",
        "\u2022 \u9BAE\u8840\u4FBF\uFF08\u30C8\u30A4\u30EC\u30C3\u30C8\u30DA\u30FC\u30D1\u30FC\u306B\u4ED8\u7740\uFF09\u3068\u6392\u4FBF\u6642\u306E\u92ED\u3044\u75DB\u307F\u304C\u5178\u578B\u7684\u306A\u75C7\u72B6",
        "",
        "\uFF08\u4ED6\u306E\u9078\u629E\u80A2\u306B\u3064\u3044\u3066\u3082\u540C\u69D8\u306E\u57FA\u6E96\u3067\u8AAC\u660E\uFF09"
      ].join("\n")
    },
    {
      enabled: true,
      label: "\u7D71\u5408",
      shortcut: "Ctrl+T",
      prompt: [
        "\u7D71\u5408\u56E0\u679C\u95A2\u4FC2\u30B9\u30BF\u30A4\u30EB(\u6B63\u89E3\u9078\u629E\u80A2\u3092\u4E2D\u5FC3\u306B\u3057\u3066\u3001\u6240\u898B\u3084\u75C7\u72B6\u306A\u3069\u3092\u3059\u3079\u3066\u76DB\u308A\u8FBC\u3093\u3060\u5DE8\u5927\u306A\uFF11\u3064\u306E\u30D5\u30ED\u30FC\u30C1\u30E3\u30FC\u30C8\u3002\u5F53\u7136\u7B87\u6761\u66F8\u304D\u3067\u306F\u306A\u3044\u306E\u3067\u756A\u53F7\u3092\u3075\u308B\u306A\u3069\u4E0D\u8981\u3002\u2192\u2193\u3067\u56E0\u679C\u5217\u3001\u6642\u7CFB\u5217\u306B\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u7D50\u3093\u3060\u5FE0\u5B9F\u306A\u56F3\u3092\u4F5C\u6210\u3002\u4EE5\u4E0B\u306F\u4E00\u4F8B(\u672C\u5F53\u306F\u3053\u306E2\u500D\u7A0B\u5EA6\u306E\u5206\u91CF\u3092\u671F\u5F85\u3057\u307E\u3059\u3002\u53EF\u80FD\u306A\u3089\u4ED6\u306E\u9078\u629E\u80A2\u3067\u8A00\u53CA\u3055\u308C\u3066\u3044\u308B\u5185\u5BB9\u3092\u77DB\u76FE\u306A\u304F\u7D50\u5408\u3055\u305B\u3066\u3002)",
        "\u4F8B\uFF08ASO\uFF09\uFF1A",
        "\u7CD6\u5C3F\u75C5\u30FB\u9AD8\u8840\u5727\u30FB\u9AD8\u8102\u8840\u75C7\u30FB\u55AB\u7159\u306A\u3069\u306E\u52D5\u8108\u786C\u5316\u30EA\u30B9\u30AF\u2191",
        "\u2193",
        "\u4E2D\u301C\u5927\u52D5\u8108\uFF08\u4E3B\u306B\u4E0B\u80A2\u52D5\u8108\uFF09\u3067\u52D5\u8108\u786C\u5316\u6027\u30D7\u30E9\u30FC\u30AF\u5F62\u6210\uFF08\u8102\u8CEA\u6838\uFF0B\u7DDA\u7DAD\u6027\u88AB\u819C\uFF09",
        "\u2193",
        "\u7BA1\u8154\u72ED\u7A84 \u2192 \u5B89\u9759\u6642\u306F\u8840\u6D41\u4FDD\u305F\u308C\u308B\u304C\u3001\u904B\u52D5\u6642\u306F\u9700\u8981\uFF1E\u4F9B\u7D66\u306B",
        "\u2193",
        "\u4E0B\u80A2\u306E\u9593\u6B20\u6027\u8DDB\u884C\uFF08claudication\uFF09\u3001\u3055\u3089\u306B\u306F\u5B89\u9759\u6642\u75DB\u3078\u3068\u9032\u884C",
        "\u2193",
        "\u8840\u6D41\u4E0D\u8DB3\u304C\u9AD8\u5EA6\u5316 \u2192 \u672B\u68A2\u6F70\u760D\uFF08\u8DB3\u8DBE\u5148\u7AEF\u306A\u3069\uFF09\u30FB\u76AE\u819A\u840E\u7E2E\u30FB\u58CA\u75BD",
        "\u2193",
        "\u591C\u9593\u3084\u8DB3\u6319\u4E0A\u6642\u306B\u8840\u6D41\u304C\u3055\u3089\u306B\u4F4E\u4E0B \u2192 \u5B89\u9759\u6642\u75DB\u304C\u60AA\u5316 \u2192 \u8DB3\u3092\u5782\u3089\u3057\u3066\u5BDD\u308B\u3068\u697D\u306B\u306A\u308B"
      ].join("\n")
    },
    {
      enabled: false,
      label: "\u30C6\u30F3\u30D7\u30EC4",
      shortcut: "",
      prompt: ""
    },
    {
      enabled: false,
      label: "\u30C6\u30F3\u30D7\u30EC5",
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
    chatModel: "gpt-5.2",
    chatTemplates: DEFAULT_CHAT_TEMPLATES,
    chatTemplateCount: 3,
    commonPrompt: "",
    hintConstraintPrompt: "\u203B400\u6587\u5B57\u4EE5\u5185\u3067\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
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
        label: `\u30C6\u30F3\u30D7\u30EC${i + 1}`,
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
        safeDefaults[i] ?? { enabled: false, label: `\u30C6\u30F3\u30D7\u30EC${i + 1}`, shortcut: "", prompt: "" }
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
  var BACKEND_FORCED_MODEL = "gpt-4.1";
  var DEFAULT_BACKEND_URL = "https://ipad-qb-support-400313981210.asia-northeast1.run.app";
  var USAGE_META_EMAIL = "ymgtsny7@gmail.com";
  var AUTH_STORAGE_KEY = "qb_support_auth_session_v1";
  var AUTH_SESSION_TIMEOUT_MS = 12e4;
  var AUTH_SESSION_POLL_INTERVAL_MS = 1e3;
  var AUTH_SESSION_FALLBACK_MS = 6 * 60 * 60 * 1e3;
  var EXPLANATION_LEVEL_LABELS = {
    highschool: "\u9AD8\u6821\u751F\u3067\u3082\u308F\u304B\u308B",
    "med-junior": "\u533B\u5B66\u90E8\u4F4E\u5B66\u5E74",
    "med-senior": "\u533B\u5B66\u90E8\u9AD8\u5B66\u5E74\u301C\u7814\u4FEE\u533B"
  };
  var settings = { ...defaultSettings };
  var currentInfo = null;
  var currentSnapshot = null;
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
  var chatSendButton = null;
  var chatStatusField = null;
  var chatInputWrap = null;
  var chatApiInput = null;
  var chatApiSaveButton = null;
  var chatApiKeyToggle = null;
  var chatApiKeyVisibilityButton = null;
  var chatApiKeyStatus = null;
  var chatModelInput = null;
  var chatModelSaveButton = null;
  var chatSettingsPanel = null;
  var chatSettingsButton = null;
  var chatSettingsOpen = false;
  var chatApiKeyVisible = false;
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
  var themeSelect = null;
  var themeQuery = null;
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
    console.log("[QB_SUPPORT][settings] loaded", {
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
        console.log("[QB_SUPPORT][settings] saved", {
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
            console.log("[QB_SUPPORT][settings] saved fallback", {
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
      authStatusField.textContent = "\u672A\u30ED\u30B0\u30A4\u30F3";
      authMetaField.textContent = "";
      authSignInButton.disabled = false;
      authSignInButton.style.display = "inline-flex";
      authSignOutButton.style.display = "none";
      return;
    }
    const name = authProfile.email || "Google\u30E6\u30FC\u30B6\u30FC";
    authStatusField.textContent = `\u30ED\u30B0\u30A4\u30F3\u4E2D: ${name}`;
    authMetaField.textContent = authProfile.email ?? "";
    authSignInButton.style.display = "none";
    authSignOutButton.style.display = "inline-flex";
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
    if (!url) throw new Error("\u30D0\u30C3\u30AF\u30A8\u30F3\u30C9URL\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002\u7BA1\u7406\u8005\u306B\u9023\u7D61\u3057\u3066\u304F\u3060\u3055\u3044");
    const response = await fetch(url);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`\u8A8D\u8A3C\u958B\u59CB\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${response.status} ${detail}`);
    }
    const data = await response.json();
    if (!data?.authUrl || !data?.state) {
      throw new Error("\u8A8D\u8A3C\u958B\u59CB\u306E\u30EC\u30B9\u30DD\u30F3\u30B9\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    }
    return data;
  }
  async function pollBackendAuthSession(state) {
    const startedAt = Date.now();
    const url = resolveBackendAuthSessionUrl(state);
    if (!url) throw new Error("\u30D0\u30C3\u30AF\u30A8\u30F3\u30C9URL\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002\u7BA1\u7406\u8005\u306B\u9023\u7D61\u3057\u3066\u304F\u3060\u3055\u3044");
    while (Date.now() - startedAt < AUTH_SESSION_TIMEOUT_MS) {
      const response = await fetch(url);
      if (response.status === 204) {
        await waitAuth(AUTH_SESSION_POLL_INTERVAL_MS);
        continue;
      }
      if (response.status === 404) {
        throw new Error("\u8A8D\u8A3C\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002");
      }
      if (response.status === 410) {
        throw new Error("\u8A8D\u8A3C\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002");
      }
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`\u8A8D\u8A3C\u30BB\u30C3\u30B7\u30E7\u30F3\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${response.status} ${detail}`);
      }
      const data = await response.json();
      if (!data?.token || !data?.profile?.uid) {
        throw new Error("\u8A8D\u8A3C\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u5185\u5BB9\u304C\u4E0D\u6B63\u3067\u3059\u3002");
      }
      return data;
    }
    throw new Error("\u30ED\u30B0\u30A4\u30F3\u304C\u5B8C\u4E86\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002");
  }
  async function requestBackendAuthSession() {
    const start2 = await fetchBackendAuthStart();
    const popup = window.open(start2.authUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      throw new Error("\u30ED\u30B0\u30A4\u30F3\u753B\u9762\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u30D6\u30ED\u30C3\u30AF\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002");
    }
    setAuthStatus("\u30D6\u30E9\u30A6\u30B6\u3067\u30ED\u30B0\u30A4\u30F3\u3092\u5B8C\u4E86\u3057\u3066\u304F\u3060\u3055\u3044", false);
    const session = await pollBackendAuthSession(start2.state);
    const expiresAt = typeof session.expiresAt === "number" ? session.expiresAt : Date.now() + AUTH_SESSION_FALLBACK_MS;
    return { token: session.token, profile: session.profile, expiresAt };
  }
  async function fetchBackendAuthProfile(token) {
    const baseUrl = resolveBackendBaseUrl();
    if (!baseUrl) throw new Error("\u30D0\u30C3\u30AF\u30A8\u30F3\u30C9URL\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002\u7BA1\u7406\u8005\u306B\u9023\u7D61\u3057\u3066\u304F\u3060\u3055\u3044");
    const url = new URL(baseUrl);
    url.pathname = url.pathname.replace(/\/+$/, "") + "/auth/me";
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`\u8A8D\u8A3C\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${response.status} ${detail}`);
    }
    const data = await response.json();
    return data;
  }
  function applyAuthSession(session) {
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
      throw new Error("\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002");
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
          setAuthSyncStatus("\u672A\u30ED\u30B0\u30A4\u30F3", false);
          return;
        }
        throw new Error("\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002");
      }
      await saveStoredAuthSession(session);
      applyAuthSession(session);
      if (remoteSettingsLoadedFor !== session.profile.uid) {
        remoteSettingsLoadedFor = session.profile.uid;
        void syncSettingsFromRemote();
      } else {
        setAuthSyncStatus("\u540C\u671F\u6E08\u307F", false);
      }
    } catch (error) {
      if (!interactive) {
        authAccessToken = null;
        authProfile = null;
        updateAuthUI();
        setAuthSyncStatus("\u672A\u30ED\u30B0\u30A4\u30F3", false);
        return;
      }
      throw error;
    }
  }
  async function handleAuthSignIn() {
    const button = authSignInButton;
    if (button) button.disabled = true;
    setAuthStatus("\u30ED\u30B0\u30A4\u30F3\u4E2D...", false);
    console.log("[QB_SUPPORT][auth] ORIGIN", location.origin);
    console.log("[QB_SUPPORT][auth] HREF", location.href);
    console.log("[QB_SUPPORT][auth] EXT_ID", webext.runtime?.id ?? null);
    try {
      await refreshAuthState(true);
      setAuthStatus("\u30ED\u30B0\u30A4\u30F3\u5B8C\u4E86", false);
      console.log("[QB_SUPPORT][auth] sign-in success");
    } catch (error) {
      console.log("[QB_SUPPORT][auth] AUTH_ERR_RAW", error);
      const err = error;
      console.log("[QB_SUPPORT][auth] AUTH_ERR_MSG", err?.message);
      console.log("[QB_SUPPORT][auth] AUTH_ERR_STACK", err?.stack);
      const detail = err?.message ? err.message : String(error);
      setAuthStatus(`\u30ED\u30B0\u30A4\u30F3\u5931\u6557: ${detail}`, true);
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
      setAuthStatus("\u30ED\u30B0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F", false);
      updateAuthUI();
      applyChatSettings();
    } catch (error) {
      console.warn("[QB_SUPPORT][auth]", error);
      setAuthStatus(`\u30ED\u30B0\u30A2\u30A6\u30C8\u5931\u6557: ${String(error)}`, true);
    } finally {
      if (button) button.disabled = false;
    }
  }
  function scheduleRemoteSettingsSync() {
    if (!authProfile || window !== window.top) return;
    if (!navigator.onLine) {
      authSyncPending = true;
      setAuthSyncStatus("\u30AA\u30D5\u30E9\u30A4\u30F3: \u540C\u671F\u4FDD\u7559", false);
      return;
    }
    if (authSyncTimer) window.clearTimeout(authSyncTimer);
    authSyncTimer = window.setTimeout(() => {
      void syncSettingsToRemote();
    }, 700);
  }
  async function syncSettingsFromRemote() {
    setAuthSyncStatus("\u540C\u671F\u4E2D...", false);
    try {
      const remoteSettings = await fetchRemoteSettings();
      console.log("[QB_SUPPORT][auth-sync] pull", {
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
      setAuthSyncStatus("\u540C\u671F\u5B8C\u4E86", false);
    } catch (error) {
      console.warn("[QB_SUPPORT][auth-sync]", error);
      if (isOfflineSyncError(error)) {
        authRemoteFetchPending = true;
        setAuthSyncStatus("\u30AA\u30D5\u30E9\u30A4\u30F3: \u540C\u671F\u4FDD\u7559", false);
        return;
      }
      setAuthSyncStatus(`\u540C\u671F\u30A8\u30E9\u30FC: ${String(error)}`, true);
    }
  }
  async function fetchRemoteSettings() {
    if (!authProfile) return null;
    const token = await ensureAuthAccessToken(false);
    const url = resolveBackendSettingsUrl();
    if (!url) throw new Error("\u30D0\u30C3\u30AF\u30A8\u30F3\u30C9URL\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002\u7BA1\u7406\u8005\u306B\u9023\u7D61\u3057\u3066\u304F\u3060\u3055\u3044");
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`\u8A2D\u5B9A\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${response.status} ${detail}`);
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
      setAuthSyncStatus("\u30AA\u30D5\u30E9\u30A4\u30F3: \u540C\u671F\u4FDD\u7559", false);
      return;
    }
    authSyncInFlight = true;
    setAuthSyncStatus("\u540C\u671F\u4E2D...", false);
    try {
      console.log("[QB_SUPPORT][auth-sync] push", {
        apiKeyLength: settings.chatApiKey?.length ?? 0,
        apiKeyEnabled: settings.chatApiKeyEnabled
      });
      const token = await ensureAuthAccessToken(false);
      const url = resolveBackendSettingsUrl();
      if (!url) throw new Error("\u30D0\u30C3\u30AF\u30A8\u30F3\u30C9URL\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002\u7BA1\u7406\u8005\u306B\u9023\u7D61\u3057\u3066\u304F\u3060\u3055\u3044");
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
        throw new Error(`\u8A2D\u5B9A\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${response.status} ${detail}`);
      }
      setAuthSyncStatus("\u540C\u671F\u5B8C\u4E86", false);
    } catch (error) {
      console.warn("[QB_SUPPORT][auth-sync]", error);
      if (isOfflineSyncError(error)) {
        authSyncPending = true;
        setAuthSyncStatus("\u30AA\u30D5\u30E9\u30A4\u30F3: \u540C\u671F\u4FDD\u7559", false);
        return;
      }
      setAuthSyncStatus(`\u540C\u671F\u30A8\u30E9\u30FC: ${String(error)}`, true);
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
      setAuthSyncStatus("\u30AA\u30D5\u30E9\u30A4\u30F3: \u540C\u671F\u4FDD\u7559", false);
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
    subtitle.textContent = "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8 & \u30B5\u30A4\u30C9\u30D0\u30FC";
    const titleWrap = document.createElement("div");
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);
    const settingsSection = document.createElement("div");
    settingsSection.className = "qb-support-section";
    settingsSection.appendChild(makeSectionTitle("\u8868\u793A"));
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
    shortcutsLabel.appendChild(makeSpan("\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u6709\u52B9"));
    debugToggle = document.createElement("input");
    debugToggle.type = "checkbox";
    debugToggle.className = "qb-support-toggle-input";
    debugToggle.addEventListener("change", () => {
      void saveSettings({
        ...settings,
        debugEnabled: debugToggle?.checked ?? false
      });
    });
    searchToggle = document.createElement("input");
    searchToggle.type = "checkbox";
    searchToggle.className = "qb-support-toggle-input";
    searchToggle.addEventListener("change", () => {
      void saveSettings({
        ...settings,
        searchVisible: searchToggle?.checked ?? true
      });
    });
    const searchLabel = document.createElement("label");
    searchLabel.className = "qb-support-toggle qb-support-toggle-btn";
    searchLabel.appendChild(searchToggle);
    searchLabel.appendChild(makeSpan("\u691C\u7D22\u30D0\u30FC\u8868\u793A"));
    noteToggle = document.createElement("input");
    noteToggle.type = "checkbox";
    noteToggle.className = "qb-support-toggle-input";
    noteToggle.addEventListener("change", () => {
      void saveSettings({
        ...settings,
        noteVisible: noteToggle?.checked ?? true
      });
    });
    const noteLabel = document.createElement("label");
    noteLabel.className = "qb-support-toggle qb-support-toggle-btn";
    noteLabel.appendChild(noteToggle);
    noteLabel.appendChild(makeSpan("\u30CE\u30FC\u30C8\u8868\u793A"));
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
    pageAccentLabel.appendChild(makeSpan("\u30DA\u30FC\u30B8\u306B\u7DD1\u30A2\u30AF\u30BB\u30F3\u30C8"));
    themeSelect = document.createElement("select");
    themeSelect.className = "qb-support-select";
    [
      { value: "system", label: "\u30B7\u30B9\u30C6\u30E0" },
      { value: "light", label: "\u30E9\u30A4\u30C8" },
      { value: "dark", label: "\u30C0\u30FC\u30AF" }
    ].forEach((optionData) => {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      themeSelect?.appendChild(option);
    });
    themeSelect.addEventListener("change", () => {
      const nextTheme = themeSelect?.value ?? "system";
      void saveSettings({
        ...settings,
        themePreference: nextTheme
      });
    });
    const themeLabel = document.createElement("label");
    themeLabel.className = "qb-support-field";
    themeLabel.appendChild(makeSpan("\u30C6\u30FC\u30DE"));
    themeLabel.appendChild(themeSelect);
    const shortcutSection = document.createElement("div");
    shortcutSection.className = "qb-support-section";
    shortcutSection.appendChild(makeSectionTitle("\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8"));
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
      input.placeholder = "\u4F8B: A / Ctrl+A";
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
    const buildShortcutField = (labelText, placeholder = "\u4F8B: Ctrl+S") => {
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
    const navPrevField = buildKeyField("\u524D\u3078");
    const navNextField = buildKeyField("\u6B21\u3078");
    const revealField = buildShortcutField("\u89E3\u7B54", "\u4F8B: Ctrl+S");
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
    toggleShortcutLabel.appendChild(makeSpan("\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u6709\u52B9"));
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "qb-support-save";
    applyButtonVariant(saveButton, "primary");
    saveButton.textContent = "\u4FDD\u5B58";
    saveButton.addEventListener("click", () => {
      const optionKeys = optionInputs.map((input) => normalizeShortcut(input.value)).filter(Boolean);
      const navPrevKey = normalizeShortcut(navPrevInput?.value ?? "");
      const navNextKey = normalizeShortcut(navNextInput?.value ?? "");
      const revealKey = normalizeShortcut(revealInput?.value ?? "");
      if (!navPrevKey || !navNextKey || !revealKey || optionKeys.length === 0) {
        setStatus("\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", true);
        return;
      }
      void saveSettings({
        ...settings,
        shortcutsEnabled: shortcutsToggle?.checked ?? true,
        searchVisible: searchToggle?.checked ?? true,
        noteVisible: noteToggle?.checked ?? true,
        navPrevKey,
        navNextKey,
        revealKey,
        optionKeys
      });
      setStatus("\u4FDD\u5B58\u3057\u307E\u3057\u305F", false);
    });
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
    shortcutSection.appendChild(saveButton);
    const templateSection = document.createElement("div");
    templateSection.className = "qb-support-section";
    templateSection.appendChild(makeSectionTitle("\u30C1\u30E3\u30C3\u30C8\u30C6\u30F3\u30D7\u30EC"));
    templateSectionEl = templateSection;
    setSectionCollapsed(templateSection, true);
    const templateControls = document.createElement("div");
    templateControls.className = "qb-support-template-controls";
    templateCountLabel = document.createElement("span");
    templateCountLabel.className = "qb-support-template-count";
    templateAddButton = document.createElement("button");
    templateAddButton.type = "button";
    templateAddButton.className = "qb-support-template-control";
    templateAddButton.textContent = "\u8FFD\u52A0";
    applyButtonVariant(templateAddButton, "primary");
    templateAddButton.addEventListener("click", () => {
      updateTemplateCount(settings.chatTemplateCount + 1);
    });
    templateRemoveButton = document.createElement("button");
    templateRemoveButton.type = "button";
    templateRemoveButton.className = "qb-support-template-control";
    templateRemoveButton.textContent = "\u524A\u9664";
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
      titleEl.textContent = `\u30C6\u30F3\u30D7\u30EC${i + 1}`;
      const enabledInput = document.createElement("input");
      enabledInput.type = "checkbox";
      enabledInput.className = "qb-support-toggle-input";
      const enabledLabel = document.createElement("label");
      enabledLabel.className = "qb-support-toggle";
      enabledLabel.appendChild(enabledInput);
      enabledLabel.appendChild(makeSpan("\u6709\u52B9"));
      headerRow.appendChild(titleEl);
      headerRow.appendChild(enabledLabel);
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.className = "qb-support-input qb-support-template-label";
      labelInput.placeholder = "\u30DC\u30BF\u30F3\u540D";
      const shortcutInput = document.createElement("input");
      shortcutInput.type = "text";
      shortcutInput.className = "qb-support-input qb-support-template-shortcut";
      shortcutInput.placeholder = "\u4F8B: Ctrl+Z";
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
      promptInput.placeholder = "\u30D7\u30ED\u30F3\u30D7\u30C8";
      const fields = document.createElement("div");
      fields.className = "qb-support-template-fields";
      fields.appendChild(buildTemplateField("\u30DC\u30BF\u30F3\u540D", labelInput));
      fields.appendChild(buildTemplateField("\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8", shortcutInput));
      fields.appendChild(buildTemplateField("\u30D7\u30ED\u30F3\u30D7\u30C8", promptInput));
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
    const templateSaveButton = document.createElement("button");
    templateSaveButton.type = "button";
    templateSaveButton.className = "qb-support-save qb-support-template-save";
    applyButtonVariant(templateSaveButton, "primary");
    templateSaveButton.textContent = "\u30C6\u30F3\u30D7\u30EC\u4FDD\u5B58";
    templateSaveButton.addEventListener("click", () => {
      const nextTemplates = chatTemplateRows.map((row, index) => {
        const label = row.label.value.trim() || `\u30C6\u30F3\u30D7\u30EC${index + 1}`;
        const shortcut = normalizeShortcut(row.shortcut.value);
        const prompt = row.prompt.value.trim();
        return {
          enabled: row.enabled.checked,
          label,
          shortcut,
          prompt
        };
      });
      if (nextTemplates.some((template) => template.enabled && !template.prompt)) {
        setStatus("\u6709\u52B9\u306A\u30C6\u30F3\u30D7\u30EC\u306F\u30D7\u30ED\u30F3\u30D7\u30C8\u5FC5\u9808\u3067\u3059", true);
        return;
      }
      void saveSettings({
        ...settings,
        chatTemplates: nextTemplates
      });
      setStatus("\u30C6\u30F3\u30D7\u30EC\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F", false);
    });
    templateSection.appendChild(templateList);
    templateSection.appendChild(templateSaveButton);
    const explanationSection = document.createElement("div");
    explanationSection.className = "qb-support-section";
    explanationSection.appendChild(makeSectionTitle("\u30D7\u30ED\u30F3\u30D7\u30C8"));
    explanationSectionEl = explanationSection;
    setSectionCollapsed(explanationSection, true);
    const commonPromptLabel = document.createElement("label");
    commonPromptLabel.className = "qb-support-field qb-support-template-field";
    commonPromptLabel.appendChild(makeSpan("\u5171\u901A\u30D7\u30ED\u30F3\u30D7\u30C8"));
    commonPromptInput = document.createElement("textarea");
    commonPromptInput.className = "qb-support-template-prompt qb-support-common-prompt";
    commonPromptInput.rows = 3;
    commonPromptInput.placeholder = "\u5168\u3066\u306E\u4F1A\u8A71\u306B\u4ED8\u4E0E\u3059\u308B\u5171\u901A\u30D7\u30ED\u30F3\u30D7\u30C8";
    commonPromptLabel.appendChild(commonPromptInput);
    explanationLevelSelect = document.createElement("select");
    explanationLevelSelect.className = "qb-support-select qb-support-explanation-level";
    Object.entries(EXPLANATION_LEVEL_LABELS).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      explanationLevelSelect?.appendChild(option);
    });
    const explanationSelectLabel = document.createElement("label");
    explanationSelectLabel.className = "qb-support-field";
    explanationSelectLabel.appendChild(makeSpan("\u30EC\u30D9\u30EB"));
    explanationSelectLabel.appendChild(explanationLevelSelect);
    const buildExplanationPromptField = (labelText, key) => {
      const textarea = document.createElement("textarea");
      textarea.className = "qb-support-template-prompt qb-support-explanation-prompt";
      textarea.rows = 3;
      textarea.placeholder = "\u30D7\u30ED\u30F3\u30D7\u30C8";
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
      buildExplanationPromptField("\u9AD8\u6821\u751F\u3067\u3082\u308F\u304B\u308B", "highschool")
    );
    promptWrap.appendChild(buildExplanationPromptField("\u533B\u5B66\u90E8\u4F4E\u5B66\u5E74", "med-junior"));
    promptWrap.appendChild(
      buildExplanationPromptField("\u533B\u5B66\u90E8\u9AD8\u5B66\u5E74\u301C\u7814\u4FEE\u533B", "med-senior")
    );
    const explanationSaveButton = document.createElement("button");
    explanationSaveButton.type = "button";
    explanationSaveButton.className = "qb-support-save qb-support-explanation-save";
    applyButtonVariant(explanationSaveButton, "primary");
    explanationSaveButton.textContent = "\u89E3\u8AAC\u8A2D\u5B9A\u3092\u4FDD\u5B58";
    explanationSaveButton.addEventListener("click", () => {
      const level = explanationLevelSelect?.value ?? "med-junior";
      const commonPrompt = commonPromptInput?.value.trim() ?? "";
      const nextPrompts = {
        highschool: explanationPromptInputs.highschool?.value.trim() ?? "",
        "med-junior": explanationPromptInputs["med-junior"]?.value.trim() ?? "",
        "med-senior": explanationPromptInputs["med-senior"]?.value.trim() ?? ""
      };
      if (!nextPrompts.highschool || !nextPrompts["med-junior"] || !nextPrompts["med-senior"]) {
        setStatus("\u89E3\u8AAC\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", true);
        return;
      }
      void saveSettings({
        ...settings,
        commonPrompt,
        explanationLevel: level,
        explanationPrompts: nextPrompts
      });
      setStatus("\u89E3\u8AAC\u30EC\u30D9\u30EB\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F", false);
    });
    explanationSection.appendChild(commonPromptLabel);
    explanationSection.appendChild(explanationSelectLabel);
    explanationSection.appendChild(promptWrap);
    explanationSection.appendChild(explanationSaveButton);
    const authSection = document.createElement("div");
    authSection.className = "qb-support-section";
    authSection.appendChild(makeSectionTitle("\u8A8D\u8A3C"));
    authSectionEl = authSection;
    setSectionCollapsed(authSection, false);
    authStatusField = document.createElement("div");
    authStatusField.className = "qb-support-auth-status";
    authStatusField.textContent = "\u672A\u30ED\u30B0\u30A4\u30F3";
    authMetaField = document.createElement("div");
    authMetaField.className = "qb-support-auth-meta";
    authSyncField = document.createElement("div");
    authSyncField.className = "qb-support-auth-sync";
    authSyncField.textContent = "\u672A\u30ED\u30B0\u30A4\u30F3";
    authSignInButton = document.createElement("button");
    authSignInButton.type = "button";
    authSignInButton.className = "qb-support-save qb-support-auth-button";
    applyButtonVariant(authSignInButton, "primary");
    authSignInButton.textContent = "Google\u3067\u30ED\u30B0\u30A4\u30F3";
    authSignInButton.addEventListener("click", () => {
      void handleAuthSignIn();
    });
    authSignOutButton = document.createElement("button");
    authSignOutButton.type = "button";
    authSignOutButton.className = "qb-support-save qb-support-auth-button qb-support-auth-signout";
    applyButtonVariant(authSignOutButton, "danger");
    authSignOutButton.textContent = "\u30ED\u30B0\u30A2\u30A6\u30C8";
    authSignOutButton.style.display = "none";
    authSignOutButton.addEventListener("click", () => {
      void handleAuthSignOut();
    });
    const authActions = document.createElement("div");
    authActions.className = "qb-support-auth-actions";
    authActions.appendChild(authSignInButton);
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
    launcher.title = "QB\u8A2D\u5B9A";
    launcher.setAttribute("aria-label", "QB\u8A2D\u5B9A");
    launcher.appendChild(createGearIcon());
    launcher.addEventListener("click", () => {
      void saveSettings({ ...settings, enabled: !settings.enabled });
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
      chatApiSaveButton = chatRoot.querySelector(
        ".qb-support-chat-api-save"
      );
      if (!chatApiSaveButton) {
        chatApiSaveButton = chatRoot.querySelector(
          ".qb-support-chat-save"
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
      chatModelSaveButton = chatRoot.querySelector(
        ".qb-support-chat-model-save"
      );
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
      if (chatApiSaveButton) {
        chatApiSaveButton.classList.add("qb-support-chat-api-save");
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
          chatApiKeyVisibilityButton.textContent = "\u8868\u793A";
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
              chatApiKeyVisibilityButton.textContent = chatApiKeyVisible ? "\u975E\u8868\u793A" : "\u8868\u793A";
            }
          });
        }
        if (!chatApiKeyStatus) {
          chatApiKeyStatus = document.createElement("div");
          chatApiKeyStatus.className = "qb-support-chat-api-key-status";
        }
        if (chatApiKeyStatus && chatApiSaveButton && !apiSection2.contains(chatApiKeyStatus)) {
          apiSection2.insertBefore(chatApiKeyStatus, chatApiSaveButton);
        } else if (chatApiKeyStatus && !apiSection2.contains(chatApiKeyStatus)) {
          apiSection2.appendChild(chatApiKeyStatus);
        }
        if (!chatApiKeyToggle) {
          const apiKeyToggleLabel2 = document.createElement("label");
          apiKeyToggleLabel2.className = "qb-support-toggle qb-support-chat-api-toggle";
          chatApiKeyToggle = document.createElement("input");
          chatApiKeyToggle.type = "checkbox";
          chatApiKeyToggle.className = "qb-support-toggle-input qb-support-chat-api-key-toggle";
          apiKeyToggleLabel2.appendChild(chatApiKeyToggle);
          apiKeyToggleLabel2.appendChild(makeSpan("\u624B\u52D5API\u30AD\u30FC\u3092\u4F7F\u7528"));
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
      if (!chatModelInput || !chatModelSaveButton) {
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
          if (!chatModelSaveButton) {
            chatModelSaveButton = document.createElement("button");
            chatModelSaveButton.type = "button";
            chatModelSaveButton.className = "qb-support-chat-save qb-support-chat-model-save";
            chatModelSaveButton.textContent = "\u9069\u7528";
            apiSection2.appendChild(chatModelSaveButton);
          }
        }
      }
      if (!chatSettingsButton) {
        const actions2 = chatRoot.querySelector(".qb-support-chat-actions");
        if (actions2) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "qb-support-chat-settings-btn";
          button.textContent = "\u8A2D\u5B9A";
          button.setAttribute("aria-label", "\u30C1\u30E3\u30C3\u30C8\u8A2D\u5B9A");
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
      applyButtonVariant(chatApiSaveButton, "primary");
      applyButtonVariant(chatModelSaveButton, "primary");
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
    const title = document.createElement("div");
    title.className = "qb-support-chat-title";
    title.textContent = "QB Chat";
    const actions = document.createElement("div");
    actions.className = "qb-support-chat-actions";
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "qb-support-chat-settings-btn";
    settingsButton.textContent = "\u8A2D\u5B9A";
    settingsButton.setAttribute("aria-label", "\u30C1\u30E3\u30C3\u30C8\u8A2D\u5B9A");
    chatSettingsButton = settingsButton;
    settingsButton.dataset.shortcut = "Ctrl+S";
    applyButtonVariant(settingsButton, "ghost");
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "qb-support-chat-new";
    resetButton.textContent = "\u65B0\u898F";
    resetButton.dataset.shortcut = "Ctrl+N";
    resetButton.addEventListener("click", () => {
      resetChatHistory("\u4F1A\u8A71\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F");
    });
    applyButtonVariant(resetButton, "ghost");
    actions.appendChild(settingsButton);
    actions.appendChild(resetButton);
    header.appendChild(title);
    header.appendChild(actions);
    chatSettingsPanel = document.createElement("div");
    chatSettingsPanel.className = "qb-support-chat-settings";
    chatSettingsPanel.dataset.open = "false";
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
    chatApiKeyVisibilityButton.textContent = "\u8868\u793A";
    applyButtonVariant(chatApiKeyVisibilityButton, "ghost");
    chatApiKeyVisibilityButton.addEventListener("click", () => {
      chatApiKeyVisible = !chatApiKeyVisible;
      if (chatApiInput) {
        chatApiInput.type = chatApiKeyVisible ? "text" : "password";
      }
      if (chatApiKeyVisibilityButton) {
        chatApiKeyVisibilityButton.textContent = chatApiKeyVisible ? "\u975E\u8868\u793A" : "\u8868\u793A";
      }
    });
    apiKeyRow.appendChild(chatApiKeyVisibilityButton);
    chatApiKeyStatus = document.createElement("div");
    chatApiKeyStatus.className = "qb-support-chat-api-key-status";
    chatApiSaveButton = document.createElement("button");
    chatApiSaveButton.type = "button";
    chatApiSaveButton.className = "qb-support-chat-save qb-support-chat-api-save";
    chatApiSaveButton.textContent = "\u4FDD\u5B58";
    applyButtonVariant(chatApiSaveButton, "primary");
    chatApiSaveButton.addEventListener("click", () => {
      const nextKey = chatApiInput?.value.trim() ?? "";
      if (!nextKey) {
        if (settings.chatApiKey) {
          setChatStatus("API\u30AD\u30FC\u306F\u4FDD\u5B58\u6E08\u307F\u3067\u3059", false);
          return;
        }
        setChatStatus("API\u30AD\u30FC\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", true);
        return;
      }
      void saveSettings({ ...settings, chatApiKey: nextKey });
      if (chatApiInput) chatApiInput.value = "";
      setChatStatus("API\u30AD\u30FC\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F", false);
    });
    const apiKeyToggleLabel = document.createElement("label");
    apiKeyToggleLabel.className = "qb-support-toggle qb-support-chat-api-toggle";
    chatApiKeyToggle = document.createElement("input");
    chatApiKeyToggle.type = "checkbox";
    chatApiKeyToggle.className = "qb-support-toggle-input qb-support-chat-api-key-toggle";
    apiKeyToggleLabel.appendChild(chatApiKeyToggle);
    apiKeyToggleLabel.appendChild(makeSpan("\u624B\u52D5API\u30AD\u30FC\u3092\u4F7F\u7528"));
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
    chatModelSaveButton = document.createElement("button");
    chatModelSaveButton.type = "button";
    chatModelSaveButton.className = "qb-support-chat-save qb-support-chat-model-save";
    chatModelSaveButton.textContent = "\u9069\u7528";
    applyButtonVariant(chatModelSaveButton, "primary");
    apiSection.appendChild(apiLabel);
    apiSection.appendChild(apiKeyRow);
    apiSection.appendChild(chatApiKeyStatus);
    apiSection.appendChild(chatApiSaveButton);
    apiSection.appendChild(apiKeyToggleLabel);
    apiSection.appendChild(modelLabel);
    apiSection.appendChild(chatModelInput);
    apiSection.appendChild(chatModelSaveButton);
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
    chatInput.placeholder = "\u8CEA\u554F\u3092\u5165\u529B...";
    chatInput.rows = 3;
    chatSendButton = document.createElement("button");
    chatSendButton.type = "button";
    chatSendButton.className = "qb-support-chat-send";
    chatSendButton.textContent = "\u9001\u4FE1";
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
    chatOverlayHandle.setAttribute("aria-label", "\u30C1\u30E3\u30C3\u30C8\u3092\u958B\u9589");
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
    chatToggle.setAttribute("aria-label", "\u30C1\u30E3\u30C3\u30C8\u3092\u958B\u304F");
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
      chatApiInput.placeholder = apiKeySaved ? "\u4FDD\u5B58\u6E08\u307F (\u7DE8\u96C6\u53EF)" : "sk-...";
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
      chatApiKeyVisibilityButton.textContent = chatApiKeyVisible ? "\u975E\u8868\u793A" : "\u8868\u793A";
      chatApiKeyVisibilityButton.disabled = !hasKey;
    }
    const backendMode = isBackendModelLocked();
    if (chatModelInput) {
      if (backendMode) {
        chatModelInput.value = BACKEND_FORCED_MODEL;
      } else if (document.activeElement !== chatModelInput) {
        chatModelInput.value = settings.chatModel;
      }
      chatModelInput.disabled = backendMode;
    }
    if (chatModelSaveButton) {
      chatModelSaveButton.disabled = backendMode;
    }
  }
  function updateChatApiKeyStatus() {
    if (!chatApiKeyStatus) return;
    const saved = Boolean(settings.chatApiKey);
    const currentValue = chatApiInput?.value.trim() ?? "";
    let status = "\u672A\u5165\u529B";
    if (saved) {
      status = "\u5165\u529B\u6E08\u307F";
    } else if (currentValue) {
      status = "\u5165\u529B\u4E2D";
    }
    const suffix = saved && !settings.chatApiKeyEnabled ? " (\u4F7F\u7528\u30AA\u30D5)" : "";
    chatApiKeyStatus.textContent = `API\u30AD\u30FC: ${status}${suffix}`;
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
      templateCountLabel.textContent = `\u30C6\u30F3\u30D7\u30EC\u6570: ${getTemplateCount()}`;
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
  function getHintTemplate() {
    const hintPhrase = "\u7D76\u5999\u306A\u30D2\u30F3\u30C8";
    for (const entry of getEnabledChatTemplatesWithIndex()) {
      const template = entry.template;
      const label = template.label ?? "";
      const prompt = template.prompt ?? "";
      if (label.includes("\u30D2\u30F3\u30C8") || label.includes(hintPhrase) || prompt.includes(hintPhrase)) {
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
    hintQuickButton.textContent = "\u30D2\u30F3\u30C8";
    if (hintEntry.template.shortcut) {
      hintQuickButton.dataset.shortcut = hintEntry.template.shortcut;
    } else {
      hintQuickButton.removeAttribute("data-shortcut");
    }
    hintQuickButton.onclick = () => {
      void sendTemplateMessage(hintEntry.template);
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
      button.textContent = template.label || `\u30C6\u30F3\u30D7\u30EC${index + 1}`;
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
    const select = document.createElement("select");
    select.className = "qb-support-chat-input qb-support-chat-model";
    for (const model of CHAT_MODEL_OPTIONS) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      select.appendChild(option);
    }
    select.value = settings.chatModel;
    return select;
  }
  function attachChatModelHandlers() {
    if (!chatModelInput) return;
    if (chatModelInput.dataset.handlers === "true") return;
    chatModelInput.dataset.handlers = "true";
    chatModelInput.addEventListener("change", () => {
      const nextModel = chatModelInput?.value ?? "";
      if (!nextModel) return;
      void saveSettings({ ...settings, chatModel: nextModel });
      setChatStatus(`\u30E2\u30C7\u30EB\u3092 ${nextModel} \u306B\u8A2D\u5B9A\u3057\u307E\u3057\u305F`, false);
    });
    if (chatModelSaveButton && chatModelSaveButton.dataset.handlers !== "true") {
      chatModelSaveButton.dataset.handlers = "true";
      chatModelSaveButton.addEventListener("click", () => {
        const nextModel = chatModelInput?.value ?? "";
        if (!nextModel) return;
        void saveSettings({ ...settings, chatModel: nextModel });
        setChatStatus(`\u30E2\u30C7\u30EB\u3092 ${nextModel} \u306B\u8A2D\u5B9A\u3057\u307E\u3057\u305F`, false);
      });
    }
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
    chatSettingsOpen = typeof force === "boolean" ? force : !chatSettingsOpen;
    chatSettingsPanel.dataset.open = chatSettingsOpen ? "true" : "false";
    chatSettingsButton.dataset.open = chatSettingsOpen ? "true" : "false";
    chatSettingsButton.setAttribute("aria-expanded", chatSettingsOpen ? "true" : "false");
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
  function isBackendModelLocked() {
    const apiKey = settings.chatApiKey?.trim() ?? "";
    if (apiKey && settings.chatApiKeyEnabled) return false;
    if (!authProfile) return false;
    return Boolean(resolveBackendBaseUrl());
  }
  async function resolveChatAuth() {
    const apiKey = settings.chatApiKey?.trim() ?? "";
    if (apiKey && settings.chatApiKeyEnabled) {
      return { mode: "apiKey", apiKey };
    }
    if (!authProfile) {
      if (apiKey) {
        throw new Error("API\u30AD\u30FC\u3092\u6709\u52B9\u306B\u3059\u308B\u304B\u3001Google\u3067\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044");
      }
      throw new Error("API\u30AD\u30FC\u3092\u8A2D\u5B9A\u3059\u308B\u304B\u3001Google\u3067\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044");
    }
    const backendBaseUrl = resolveBackendBaseUrl();
    if (!backendBaseUrl) {
      throw new Error("\u30D0\u30C3\u30AF\u30A8\u30F3\u30C9URL\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002\u7BA1\u7406\u8005\u306B\u9023\u7D61\u3057\u3066\u304F\u3060\u3055\u3044");
    }
    const token = await ensureAuthAccessToken(false);
    if (!token) {
      throw new Error("\u8A8D\u8A3C\u30C8\u30FC\u30AF\u30F3\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
    }
    return { mode: "backend", backendUrl: backendBaseUrl, authToken: token };
  }
  async function resolveChatAuthWithStatus() {
    try {
      return await resolveChatAuth();
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : String(error), true);
      return null;
    }
  }
  async function sendTemplateMessage(template) {
    const rawMessage = typeof template === "string" ? template : template.prompt;
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
    return width / height <= 1.2;
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
      chatToggle.textContent = open ? "\u25BC" : "\u25B2";
    } else {
      chatToggle.textContent = open ? ">" : "<";
    }
    chatToggle.setAttribute("aria-label", open ? "\u30C1\u30E3\u30C3\u30C8\u3092\u9589\u3058\u308B" : "\u30C1\u30E3\u30C3\u30C8\u3092\u958B\u304F");
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
    const placeholder = appendChatMessage("assistant", "\u56DE\u7B54\u4E2D...", { pending: true });
    const effectiveModel = auth.mode === "backend" ? BACKEND_FORCED_MODEL : settings.chatModel;
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
      console.debug("[QB_SUPPORT][chat-send]", {
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
            setChatMessageContent(placeholder, "assistant", streamState.text || "\u56DE\u7B54\u4E2D...");
            placeholder.classList.remove("is-pending");
            chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
          }
        }
      );
      if (activeChatRequestId !== requestId) return;
      const finalText = response.text || streamState.text;
      if (placeholder) {
        setChatMessageContent(placeholder, "assistant", finalText || "\u5FDC\u7B54\u304C\u3042\u308A\u307E\u305B\u3093");
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
        placeholder.textContent = "\u5FDC\u7B54\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        placeholder.classList.remove("is-pending");
      }
      console.warn("[QB_SUPPORT][chat-error]", error);
      setChatStatus(`\u30A8\u30E9\u30FC: ${String(error)}`, true);
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
  function appendChatMessage(role, content, options) {
    if (!chatMessagesEl) return null;
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
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
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
    button.textContent = "\u30B3\u30D4\u30FC";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = message.dataset.raw ?? "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "\u30B3\u30D4\u30FC\u6E08\u307F";
        window.setTimeout(() => {
          button.textContent = "\u30B3\u30D4\u30FC";
        }, 1200);
      } catch {
        button.textContent = "\u5931\u6557";
        window.setTimeout(() => {
          button.textContent = "\u30B3\u30D4\u30FC";
        }, 1200);
      }
    });
    message.appendChild(button);
  }
  function applyUserMessageCollapse(message, content) {
    const words = content.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 400) return;
    const preview = `${words.slice(0, 400).join(" ")} \u2026 (\u30AF\u30EA\u30C3\u30AF\u3067\u5C55\u958B)`;
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
    const costLabel = cost !== null ? `\xA5${cost.toFixed(2)} (\u6982\u7B97)` : "\xA5-";
    const source = mode === "backend" ? "backend" : "frontend";
    return `source: ${source} \u30FB model: ${model} \u30FB tokens: ${totalTokens} (in ${inputTokens} / out ${outputTokens}) \u30FB ${costLabel}`;
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
  async function buildChatRequest(snapshot, userMessage, includeContext) {
    const input = [];
    if (includeContext) {
      input.push(await buildContextInput(snapshot));
    }
    input.push({
      role: "user",
      content: [{ type: "input_text", text: userMessage }]
    });
    return { input, instructions: buildChatInstructions() };
  }
  function buildChatInstructions() {
    const levelKey = settings.explanationLevel ?? "med-junior";
    const levelLabel = EXPLANATION_LEVEL_LABELS[levelKey] ?? levelKey;
    const prompt = settings.explanationPrompts?.[levelKey] ?? "";
    const commonPrompt = settings.commonPrompt?.trim() ?? "";
    return [
      "\u3042\u306A\u305F\u306FQB\u554F\u984C\u96C6\u306E\u5B66\u7FD2\u652F\u63F4\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u3067\u3059\u3002",
      "\u4E0E\u3048\u3089\u308C\u305F\u554F\u984C\u6587\u30FB\u9078\u629E\u80A2\u30FB\u6DFB\u4ED8\u753B\u50CF\u306B\u57FA\u3065\u3044\u3066\u3001\u65E5\u672C\u8A9E\u3067\u7C21\u6F54\u306B\u7B54\u3048\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u60C5\u5831\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u308B\u5834\u5408\u306F\u3001\u305D\u306E\u65E8\u3092\u4F1D\u3048\u3066\u304F\u3060\u3055\u3044\u3002",
      commonPrompt,
      `\u89E3\u8AAC\u30EC\u30D9\u30EB: ${levelLabel}`,
      prompt
    ].join("\n");
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
    if (!snapshot) return "\u554F\u984C\u60C5\u5831: \u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    const lines = ["\u554F\u984C\u60C5\u5831:"];
    lines.push(`URL: ${snapshot.url}`);
    if (snapshot.id) lines.push(`ID: ${snapshot.id}`);
    if (snapshot.progressText) lines.push(`\u9032\u6357: ${snapshot.progressText}`);
    if (snapshot.pageRef) lines.push(`\u63B2\u8F09\u9801: ${snapshot.pageRef}`);
    if (snapshot.tags.length) lines.push(`\u30BF\u30B0: ${snapshot.tags.join(", ")}`);
    if (snapshot.questionText) lines.push(`\u554F\u984C\u6587: ${snapshot.questionText}`);
    if (snapshot.optionTexts.length) {
      const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const options = snapshot.optionTexts.map((text, index) => {
        const label = labels[index] ?? `${index + 1}`;
        return `${label}. ${text}`;
      });
      lines.push("\u9078\u629E\u80A2:");
      lines.push(...options);
    }
    const imageCount = imageCountOverride ?? snapshot.imageUrls.length;
    if (imageCount) {
      lines.push(`\u753B\u50CF: ${imageCount}\u4EF6`);
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
      resetChatHistory("\u554F\u984C\u304C\u5207\u308A\u66FF\u308F\u3063\u305F\u305F\u3081\u5C65\u6B74\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F");
    }
  }
  function resetChatHistory(message = "\u554F\u984C\u304C\u5207\u308A\u66FF\u308F\u3063\u305F\u305F\u3081\u5C65\u6B74\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F") {
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
      throw new Error("background\u63A5\u7D9A\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093");
    }
    const port = webext.runtime.connect({ name: "qb-chat" });
    activeChatPort = port;
    console.debug("[QB_SUPPORT][chat-stream]", {
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
          console.debug("[QB_SUPPORT][chat-stream]", {
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
        console.debug("[QB_SUPPORT][chat-stream]", {
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
          finish(new Error(payload.error ?? "\u5FDC\u7B54\u306B\u5931\u6557\u3057\u307E\u3057\u305F"));
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
            lastError ? `background\u3068\u306E\u63A5\u7D9A\u304C\u5207\u308C\u307E\u3057\u305F: ${lastError}` : "background\u3068\u306E\u63A5\u7D9A\u304C\u5207\u308C\u307E\u3057\u305F"
          )
        );
      };
      const timeoutId = window.setTimeout(() => {
        finish(new Error("\u5FDC\u7B54\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F"));
      }, 12e4);
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      const model = auth.mode === "backend" ? BACKEND_FORCED_MODEL : settings.chatModel;
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
    if (themeSelect) themeSelect.value = settings.themePreference;
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
      row.label.value = template?.label ?? `\u30C6\u30F3\u30D7\u30EC${index + 1}`;
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
    window.addEventListener(
      "keydown",
      (event) => {
        const debug = settings.debugEnabled;
        const shouldLogKey = isTargetKey(event.key);
        if (shouldLogKey) {
          console.log("[QB_SUPPORT][key-capture]", {
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
          console.debug("[QB_SUPPORT][key]", {
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
          resetChatHistory("\u4F1A\u8A71\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F");
          void saveSettings({ ...settings, chatOpen: true });
          return;
        }
        if (isShortcutMatch(event, "Ctrl+S") && window === window.top) {
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
            console.log("[QB_SUPPORT][frame-skip]", {
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
            console.debug("[QB_SUPPORT][toggle]", {
              prevented: true,
              target: describeElement(event.target)
            });
          }
          void saveSettings({ ...settings, enabled: !settings.enabled });
          return;
        }
        const revealMatch = isShortcutMatch(event, settings.revealKey);
        if (hasModifier(event) && !isNavKey && !isOptionKey && !revealMatch) {
          if (shouldLogKey) {
            console.log("[QB_SUPPORT][key-skip]", {
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
            console.log("[QB_SUPPORT][nav-target]", {
              key: navBaseKey,
              target: describeElement(target),
              meta: describeElementMeta(target),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (debug) {
            console.debug("[QB_SUPPORT][nav]", {
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
              console.log("[QB_SUPPORT][nav-effect]", {
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
            console.log("[QB_SUPPORT][option-target]", {
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
            console.debug("[QB_SUPPORT][option]", {
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
              console.log("[QB_SUPPORT][option-effect]", {
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
            console.log("[QB_SUPPORT][reveal-target]", {
              key: getShortcutBaseKey(settings.revealKey),
              target: describeElement(revealButton),
              meta: describeElementMeta(revealButton),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (revealButton) {
            if (debug) {
              console.debug("[QB_SUPPORT][reveal]", {
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
                console.log("[QB_SUPPORT][reveal-effect]", {
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
            console.log("[QB_SUPPORT][submit-target]", {
              key,
              target: describeElement(submitButton),
              meta: describeElementMeta(submitButton),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (debug) {
            console.debug("[QB_SUPPORT][submit]", {
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
                console.log("[QB_SUPPORT][submit-effect]", {
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
        console.log("[QB_SUPPORT][click-capture]", {
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
        void saveSettings({ ...settings, enabled: false });
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
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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
        console.log("[QB_SUPPORT][action-recv]", {
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
      if (data.type === "QB_QUESTION_SNAPSHOT") {
        if (data.snapshot) {
          updateSnapshot(data.snapshot);
        }
      }
    });
  }
  function findTargetFrame() {
    const frames = Array.from(document.querySelectorAll("iframe"));
    for (const frame of frames) {
      const src = frame.getAttribute("src") ?? "";
      if (src.includes("input.medilink-study.com")) {
        return frame.contentWindow;
      }
    }
    return null;
  }
  function postToInputFrame(message) {
    const errors = [];
    const target = findTargetFrame();
    if (target) {
      try {
        target.postMessage(message, QB_ACTION_ORIGIN);
        return { sent: true, method: "querySelector", frameIndex: null, errors };
      } catch (error) {
        errors.push(`querySelector: ${String(error)}`);
      }
    }
    for (let i = 0; i < window.frames.length; i += 1) {
      try {
        window.frames[i].postMessage(message, QB_ACTION_ORIGIN);
        return { sent: true, method: "window.frames", frameIndex: i, errors };
      } catch (error) {
        errors.push(`window.frames[${i}]: ${String(error)}`);
      }
    }
    return { sent: false, method: "none", frameIndex: null, errors };
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
  function logFramesOnce() {
    if (document.documentElement.dataset.qbSupportFrames === "true") return;
    document.documentElement.dataset.qbSupportFrames = "true";
    if (window !== window.top) return;
    console.log("[QB_SUPPORT][frames]", {
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
      console.log("[QB_SUPPORT][nav-target]", {
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
        console.log("[QB_SUPPORT][nav-effect]", {
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
      console.log("[QB_SUPPORT][option-target]", {
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
        console.log("[QB_SUPPORT][option-effect]", {
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
      console.log("[QB_SUPPORT][reveal-target]", {
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
          console.log("[QB_SUPPORT][reveal-effect]", {
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
      console.log("[QB_SUPPORT][submit-target]", {
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
          console.log("[QB_SUPPORT][submit-effect]", {
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
      console.log("[QB_SUPPORT][action-sent]", {
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
      console.log("[QB_SUPPORT][action-local]", {
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
    console.log("[QB_SUPPORT][action-sent]", {
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
    console.log("[QB_SUPPORT][inject]", {
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
      console.debug("[QB_SUPPORT][reveal-wait]", {
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
          console.debug("[QB_SUPPORT][reveal-check]", {
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
            console.debug("[QB_SUPPORT][reveal-check]", {
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
          console.debug("[QB_SUPPORT][reveal-check]", {
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
        console.log("[QB_SUPPORT][cdp-click]", { tag, ok: true, x, y });
        return true;
      }
      const error = response?.error ?? "Unknown error";
      console.warn("[QB_SUPPORT][cdp-click]", { tag, ok: false, error, x, y });
      setStatus(`CDP click\u5931\u6557: ${error}`, true);
    } catch (error) {
      console.warn("[QB_SUPPORT][cdp-click]", { tag, ok: false, error });
      setStatus("CDP click\u5931\u6557", true);
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
    console.log("[QB_SUPPORT][click]", payload);
  }
  start();
})();
