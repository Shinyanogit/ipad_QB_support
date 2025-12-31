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
    const optionTexts = extractOptionTexts(container);
    return {
      id: info?.id ?? questionIdFromUrl(url),
      url,
      questionText,
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
    revealKey: "S",
    optionKeys: ["A", "B", "C", "D", "E"],
    position: "bottom-right",
    shortcut: "Alt+Q",
    chatOpen: false,
    chatDock: "right",
    chatApiKey: "",
    chatModel: "gpt-4o-mini"
  };
  function normalizeSettings(input) {
    if (!input) return { ...defaultSettings };
    const legacyNoteVisible = typeof input.noteHeaderVisible === "boolean" ? input.noteHeaderVisible : void 0;
    const optionKeys = Array.isArray(input.optionKeys) && input.optionKeys.length > 0 ? input.optionKeys.map((key) => normalizeSingleKey(key)).filter(Boolean) : defaultSettings.optionKeys;
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : defaultSettings.enabled,
      shortcutsEnabled: typeof input.shortcutsEnabled === "boolean" ? input.shortcutsEnabled : defaultSettings.shortcutsEnabled,
      debugEnabled: typeof input.debugEnabled === "boolean" ? input.debugEnabled : defaultSettings.debugEnabled,
      noteVisible: typeof input.noteVisible === "boolean" ? input.noteVisible : legacyNoteVisible ?? defaultSettings.noteVisible,
      searchVisible: typeof input.searchVisible === "boolean" ? input.searchVisible : defaultSettings.searchVisible,
      navPrevKey: normalizeSingleKey(input.navPrevKey) || defaultSettings.navPrevKey,
      navNextKey: normalizeSingleKey(input.navNextKey) || defaultSettings.navNextKey,
      revealKey: normalizeSingleKey(input.revealKey) || defaultSettings.revealKey,
      optionKeys,
      position: isPosition(input.position) ? input.position : defaultSettings.position,
      shortcut: normalizeShortcut(input.shortcut) || defaultSettings.shortcut,
      chatOpen: typeof input.chatOpen === "boolean" ? input.chatOpen : defaultSettings.chatOpen,
      chatDock: isChatDock(input.chatDock) ? input.chatDock : defaultSettings.chatDock,
      chatApiKey: typeof input.chatApiKey === "string" ? input.chatApiKey.trim() : defaultSettings.chatApiKey,
      chatModel: typeof input.chatModel === "string" && input.chatModel.trim() ? input.chatModel.trim() : defaultSettings.chatModel
    };
  }
  function normalizeSingleKey(input) {
    if (!input) return "";
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (trimmed === " ") return "Space";
    if (trimmed.length === 1) return trimmed.toUpperCase();
    const lower = trimmed.toLowerCase();
    if (lower === "arrowleft") return "ArrowLeft";
    if (lower === "arrowright") return "ArrowRight";
    if (lower === "arrowup") return "ArrowUp";
    if (lower === "arrowdown") return "ArrowDown";
    if (lower === "escape" || lower === "esc") return "Escape";
    if (lower === "enter") return "Enter";
    if (lower === "tab") return "Tab";
    if (lower === "backspace") return "Backspace";
    return trimmed;
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
  var QB_ACTION_ORIGIN = "https://input.medilink-study.com";
  var QB_TOP_ORIGIN = "https://qb.medilink-study.com";
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
  var chatApiInput = null;
  var chatApiSaveButton = null;
  var chatHistory = [];
  var chatRequestPending = false;
  var shortcutsToggle = null;
  var debugToggle = null;
  var noteToggle = null;
  var searchToggle = null;
  var navPrevInput = null;
  var navNextInput = null;
  var revealInput = null;
  var optionInputs = [];
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
    applySettings();
    refreshQuestionInfo();
    startObservers();
    attachEventHandlers();
    attachChatHandlers();
  }
  async function initFrame() {
    await loadSettings();
    applySettings();
    refreshQuestionInfo();
    startObservers();
  }
  async function loadSettings() {
    const area = getStorageArea(true);
    if (!area) {
      settings = normalizeSettings(void 0);
      return;
    }
    const stored = await storageGet(area, STORAGE_KEY);
    settings = normalizeSettings(stored[STORAGE_KEY]);
  }
  async function saveSettings(next) {
    settings = normalizeSettings(next);
    const area = getStorageArea(true);
    if (area) {
      await storageSet(area, { [STORAGE_KEY]: settings });
    }
    applySettings();
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
    searchLabel.className = "qb-support-toggle";
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
    noteLabel.className = "qb-support-toggle";
    noteLabel.appendChild(noteToggle);
    noteLabel.appendChild(makeSpan("\u30CE\u30FC\u30C8\u8868\u793A"));
    const shortcutSection = document.createElement("div");
    shortcutSection.className = "qb-support-section";
    shortcutSection.appendChild(makeSectionTitle("\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8"));
    const buildKeyField = (labelText) => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "qb-support-input";
      input.placeholder = "\u4F8B: A";
      input.addEventListener("keydown", (event) => {
        if (event.key === "Tab") return;
        event.preventDefault();
        input.value = normalizeKey(event.key);
      });
      const label = document.createElement("label");
      label.className = "qb-support-field";
      label.appendChild(makeSpan(labelText));
      label.appendChild(input);
      return { label, input };
    };
    const navPrevField = buildKeyField("\u524D\u3078");
    const navNextField = buildKeyField("\u6B21\u3078");
    const revealField = buildKeyField("\u89E3\u7B54");
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
    saveButton.textContent = "\u4FDD\u5B58";
    saveButton.addEventListener("click", () => {
      const optionKeys = optionInputs.map((input) => normalizeKey(input.value)).filter(Boolean);
      const navPrevKey = normalizeKey(navPrevInput?.value ?? "");
      const navNextKey = normalizeKey(navNextInput?.value ?? "");
      const revealKey = normalizeKey(revealInput?.value ?? "");
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
    settingsSection.appendChild(statusField);
    shortcutSection.appendChild(toggleShortcutLabel);
    shortcutSection.appendChild(navPrevField.label);
    shortcutSection.appendChild(navNextField.label);
    shortcutSection.appendChild(revealField.label);
    shortcutSection.appendChild(optionsWrap);
    shortcutSection.appendChild(saveButton);
    panel.appendChild(header);
    panel.appendChild(settingsSection);
    panel.appendChild(shortcutSection);
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
        ".qb-support-chat-api input"
      );
      chatApiSaveButton = chatRoot.querySelector(
        ".qb-support-chat-save"
      );
      chatToggle = document.getElementById(CHAT_TOGGLE_ID);
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
    const dragButton = document.createElement("button");
    dragButton.type = "button";
    dragButton.className = "qb-support-chat-drag";
    dragButton.textContent = "\u21C4";
    dragButton.title = "\u5DE6\u53F3\u306B\u30C9\u30E9\u30C3\u30B0\u3067\u5207\u66FF";
    dragButton.setAttribute("aria-label", "\u5DE6\u53F3\u306B\u30C9\u30E9\u30C3\u30B0\u3067\u5207\u66FF");
    header.appendChild(title);
    header.appendChild(dragButton);
    const apiSection = document.createElement("div");
    apiSection.className = "qb-support-chat-api";
    const apiLabel = document.createElement("label");
    apiLabel.textContent = "OpenAI API Key";
    apiLabel.className = "qb-support-chat-api-label";
    chatApiInput = document.createElement("input");
    chatApiInput.type = "password";
    chatApiInput.className = "qb-support-chat-input";
    chatApiInput.placeholder = "sk-...";
    chatApiSaveButton = document.createElement("button");
    chatApiSaveButton.type = "button";
    chatApiSaveButton.className = "qb-support-chat-save";
    chatApiSaveButton.textContent = "\u4FDD\u5B58";
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
    apiSection.appendChild(apiLabel);
    apiSection.appendChild(chatApiInput);
    apiSection.appendChild(chatApiSaveButton);
    chatMessagesEl = document.createElement("div");
    chatMessagesEl.className = "qb-support-chat-messages";
    chatStatusField = document.createElement("div");
    chatStatusField.className = "qb-support-chat-status";
    const inputWrap = document.createElement("div");
    inputWrap.className = "qb-support-chat-input-wrap";
    chatInput = document.createElement("textarea");
    chatInput.className = "qb-support-chat-textarea";
    chatInput.placeholder = "\u8CEA\u554F\u3092\u5165\u529B...";
    chatInput.rows = 3;
    chatSendButton = document.createElement("button");
    chatSendButton.type = "button";
    chatSendButton.className = "qb-support-chat-send";
    chatSendButton.textContent = "\u9001\u4FE1";
    inputWrap.appendChild(chatInput);
    inputWrap.appendChild(chatSendButton);
    chatPanel.appendChild(header);
    chatPanel.appendChild(apiSection);
    chatPanel.appendChild(chatMessagesEl);
    chatPanel.appendChild(chatStatusField);
    chatPanel.appendChild(inputWrap);
    chatRoot.appendChild(chatPanel);
    document.body.appendChild(chatRoot);
    chatToggle = document.createElement("button");
    chatToggle.id = CHAT_TOGGLE_ID;
    chatToggle.type = "button";
    chatToggle.className = "qb-support-chat-toggle";
    chatToggle.textContent = "Chat";
    chatToggle.setAttribute("aria-label", "QB Chat");
    chatToggle.addEventListener("click", () => {
      void saveSettings({ ...settings, chatOpen: !settings.chatOpen });
    });
    document.body.appendChild(chatToggle);
    dragButton.addEventListener("pointerdown", (event) => {
      startChatDrag(event);
    });
    dragButton.addEventListener("touchstart", (event) => {
      if (event.touches.length === 1) {
        startChatDrag(event.touches[0]);
      }
    });
  }
  function applyChatSettings() {
    if (!chatRoot || !chatPanel || !chatToggle) return;
    const docEl = document.documentElement;
    docEl.dataset.qbChatOpen = settings.chatOpen ? "true" : "false";
    docEl.dataset.qbChatSide = settings.chatDock;
    chatRoot.dataset.side = settings.chatDock;
    chatRoot.dataset.open = settings.chatOpen ? "true" : "false";
    chatToggle.dataset.side = settings.chatDock;
    chatToggle.dataset.open = settings.chatOpen ? "true" : "false";
    chatToggle.textContent = settings.chatOpen ? "Close" : "Chat";
    if (chatApiInput && document.activeElement !== chatApiInput) {
      chatApiInput.value = "";
      chatApiInput.placeholder = settings.chatApiKey ? "\u4FDD\u5B58\u6E08\u307F (\u518D\u5165\u529B\u3067\u66F4\u65B0)" : "sk-...";
    }
  }
  function attachChatHandlers() {
    if (!chatPanel || chatPanel.dataset.handlers === "true") return;
    chatPanel.dataset.handlers = "true";
    chatSendButton?.addEventListener("click", () => {
      void handleChatSend();
    });
    chatInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleChatSend();
      }
    });
  }
  function startChatDrag(event) {
    if (!chatRoot) return;
    let active = true;
    chatRoot.dataset.dragging = "true";
    const finalize = (clientX) => {
      if (!active) return;
      active = false;
      if (chatRoot) delete chatRoot.dataset.dragging;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (clientX === null) return;
      const nextDock = clientX < window.innerWidth / 2 ? "left" : "right";
      if (nextDock !== settings.chatDock) {
        void saveSettings({ ...settings, chatDock: nextDock });
      }
    };
    const onPointerMove = () => {
      if (chatRoot) chatRoot.dataset.dragging = "true";
    };
    const onPointerUp = (ev) => finalize(ev.clientX);
    const onTouchMove = () => {
      if (chatRoot) chatRoot.dataset.dragging = "true";
    };
    const onTouchEnd = (ev) => {
      const touch = ev.changedTouches[0];
      finalize(touch ? touch.clientX : null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
  }
  async function handleChatSend() {
    if (!chatInput || !chatMessagesEl) return;
    if (chatRequestPending) return;
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;
    if (!settings.chatApiKey) {
      setChatStatus("API\u30AD\u30FC\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044", true);
      return;
    }
    chatInput.value = "";
    setChatStatus("", false);
    chatHistory.push({ role: "user", content: userMessage });
    trimChatHistory();
    appendChatMessage("user", userMessage);
    chatRequestPending = true;
    const placeholder = appendChatMessage("assistant", "\u56DE\u7B54\u4E2D...", { pending: true });
    try {
      const snapshot = await resolveQuestionSnapshot();
      const requestMessages = buildChatMessages(snapshot, userMessage);
      console.debug("[QB_SUPPORT][chat-send]", {
        hasSnapshot: Boolean(snapshot),
        history: chatHistory.length
      });
      const response = await requestChatCompletion(requestMessages);
      if (placeholder) {
        placeholder.textContent = response;
        placeholder.classList.remove("is-pending");
      } else {
        appendChatMessage("assistant", response);
      }
      chatHistory.push({ role: "assistant", content: response });
      trimChatHistory();
    } catch (error) {
      if (placeholder) {
        placeholder.textContent = "\u5FDC\u7B54\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        placeholder.classList.remove("is-pending");
      }
      console.warn("[QB_SUPPORT][chat-error]", error);
      setChatStatus(`\u30A8\u30E9\u30FC: ${String(error)}`, true);
    } finally {
      chatRequestPending = false;
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
    message.textContent = content;
    chatMessagesEl.appendChild(message);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    return message;
  }
  async function resolveQuestionSnapshot() {
    const local = extractQuestionSnapshot(document, location.href);
    if (local) return local;
    if (window !== window.top) return currentSnapshot;
    const snapshot = await requestQuestionSnapshotFromFrame(900);
    return snapshot ?? null;
  }
  function buildChatMessages(snapshot, userMessage) {
    const history = chatHistory.slice(-8);
    const last = history[history.length - 1];
    if (last && last.role === "user" && last.content === userMessage) {
      history.pop();
    }
    return [
      { role: "system", content: buildSystemPrompt(snapshot) },
      ...history,
      { role: "user", content: userMessage }
    ];
  }
  function buildSystemPrompt(snapshot) {
    const base = "\u3042\u306A\u305F\u306FQB\u554F\u984C\u96C6\u306E\u5B66\u7FD2\u652F\u63F4\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u3067\u3059\u3002\u4E0E\u3048\u3089\u308C\u305F\u554F\u984C\u6587\u3068\u9078\u629E\u80A2\u306B\u57FA\u3065\u3044\u3066\u3001\u65E5\u672C\u8A9E\u3067\u7C21\u6F54\u306B\u7B54\u3048\u3066\u304F\u3060\u3055\u3044\u3002\u60C5\u5831\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u308B\u5834\u5408\u306F\u3001\u305D\u306E\u65E8\u3092\u4F1D\u3048\u3066\u304F\u3060\u3055\u3044\u3002";
    if (!snapshot) return `${base}

\u554F\u984C\u60C5\u5831: \u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002`;
    const lines = [base, "", "\u554F\u984C\u60C5\u5831:"];
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
    return lines.join("\n");
  }
  function updateSnapshot(snapshot) {
    const prevId = currentSnapshot?.id ?? null;
    currentSnapshot = snapshot;
    if (prevId && snapshot.id && prevId !== snapshot.id) {
      resetChatHistory();
    }
  }
  function resetChatHistory() {
    chatHistory = [];
    if (chatMessagesEl) chatMessagesEl.innerHTML = "";
    setChatStatus("\u554F\u984C\u304C\u5207\u308A\u66FF\u308F\u3063\u305F\u305F\u3081\u5C65\u6B74\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F", false);
  }
  async function requestChatCompletion(messages) {
    const response = await sendRuntimeMessage({
      type: "QB_CHAT_REQUEST",
      apiKey: settings.chatApiKey,
      model: settings.chatModel,
      messages
    });
    if (!response) throw new Error("background\u5FDC\u7B54\u304C\u3042\u308A\u307E\u305B\u3093");
    if (!response.ok) throw new Error(response.error ?? "API\u30A8\u30E9\u30FC");
    return response.text ?? "";
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
    toggleMarker(settings.debugEnabled);
    if (shortcutsToggle) shortcutsToggle.checked = settings.shortcutsEnabled;
    if (debugToggle) debugToggle.checked = settings.debugEnabled;
    if (searchToggle) searchToggle.checked = settings.searchVisible;
    if (noteToggle) noteToggle.checked = settings.noteVisible;
    if (navPrevInput) navPrevInput.value = settings.navPrevKey;
    if (navNextInput) navNextInput.value = settings.navNextKey;
    if (revealInput) revealInput.value = settings.revealKey;
    optionInputs.forEach((input, index) => {
      input.value = settings.optionKeys[index] ?? "";
    });
    applySidebarVisibility(settings.searchVisible, settings.noteVisible);
    applyChatSettings();
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
    document.addEventListener(
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
        if (isTypingTarget(event.target)) return;
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
        if (isShortcutMatch(event, settings.shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          if (debug) {
            console.debug("[QB_SUPPORT][toggle]", {
              prevented: true,
              target: describeElement(event.target)
            });
          }
          void saveSettings({ ...settings, enabled: !settings.enabled });
          return;
        }
        if (hasModifier(event)) {
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
        const key = normalizeKey(event.key);
        if (key === settings.navNextKey || key === settings.navPrevKey) {
          if (window === window.top) {
            sendAction({
              action: "nav",
              key: key.toLowerCase()
            }, event);
            return;
          }
          const target = getNavigationTarget(
            document,
            key === settings.navNextKey ? "next" : "prev"
          );
          if (shouldLogKey) {
            console.log("[QB_SUPPORT][nav-target]", {
              key,
              target: describeElement(target),
              meta: describeElementMeta(target),
              url: location.href,
              frame: window === window.top ? "top" : "iframe"
            });
          }
          if (debug) {
            console.debug("[QB_SUPPORT][nav]", {
              key,
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
                key,
                beforeUrl,
                afterUrl: location.href,
                changed: location.href !== beforeUrl,
                frame: window === window.top ? "top" : "iframe"
              });
            }, 200);
          }
          return;
        }
        if (settings.optionKeys.includes(key)) {
          const index = settings.optionKeys.indexOf(key);
          if (window === window.top) {
            sendAction(
              {
                action: "option",
                key: key.toLowerCase(),
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
              key,
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
              key,
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
                key,
                before: beforeState,
                after: afterState,
                changed: !isSameOptionState(beforeState, afterState),
                frame: window === window.top ? "top" : "iframe"
              });
            }, 120);
          }
          return;
        }
        if (key === settings.revealKey) {
          if (window === window.top) {
            sendAction(
              {
                action: "reveal",
                key: key.toLowerCase()
              },
              event
            );
            return;
          }
          const revealButton = getAnswerRevealButton(document);
          if (shouldLogKey) {
            console.log("[QB_SUPPORT][reveal-target]", {
              key,
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
                  key,
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
    const title = document.createElement("div");
    title.className = "qb-support-section-title";
    title.textContent = text;
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
  function isTargetKey(rawKey) {
    const key = normalizeKey(rawKey);
    return key === settings.navPrevKey || key === settings.navNextKey || key === settings.revealKey || settings.optionKeys.includes(key);
  }
  function hasModifier(event) {
    return event.metaKey || event.ctrlKey || event.altKey;
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
