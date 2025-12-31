import {
  extractQuestionInfo,
  extractQuestionSnapshot,
  getAnswerRevealButton,
  getClickableOptionElement,
  getNavigationTarget,
  getOptionElements,
  getSubmitButton,
} from "./core/qbDom";
import {
  defaultSettings,
  isShortcutMatch,
  normalizeSettings,
  normalizeShortcut,
  shortcutFromEvent,
} from "./core/settings";
import type { QuestionInfo, QuestionSnapshot, Settings } from "./core/types";
import { getManifest, getStorageArea, sendRuntimeMessage, storageGet, storageSet } from "./lib/webext";

const STORAGE_KEY = "qb_support_settings_v1";
const ROOT_ID = "qb-support-root";
const MARKER_ID = "qb-support-marker";
const CHAT_ROOT_ID = "qb-support-chat-root";
const CHAT_TOGGLE_ID = "qb-support-chat-toggle";
const QB_ACTION_ORIGIN = "https://input.medilink-study.com";
const QB_TOP_ORIGIN = "https://qb.medilink-study.com";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

let settings: Settings = { ...defaultSettings };
let currentInfo: QuestionInfo | null = null;
let currentSnapshot: QuestionSnapshot | null = null;
let root: HTMLDivElement | null = null;
let panel: HTMLDivElement | null = null;
let launcher: HTMLButtonElement | null = null;
let infoFields: Record<string, HTMLElement> = {};
let statusField: HTMLElement | null = null;
let chatRoot: HTMLDivElement | null = null;
let chatPanel: HTMLDivElement | null = null;
let chatToggle: HTMLButtonElement | null = null;
let chatMessagesEl: HTMLDivElement | null = null;
let chatInput: HTMLTextAreaElement | null = null;
let chatSendButton: HTMLButtonElement | null = null;
let chatStatusField: HTMLElement | null = null;
let chatApiInput: HTMLInputElement | null = null;
let chatApiSaveButton: HTMLButtonElement | null = null;
let chatHistory: ChatMessage[] = [];
let chatRequestPending = false;
let shortcutInput: HTMLInputElement | null = null;
let positionSelect: HTMLSelectElement | null = null;
let enabledToggle: HTMLInputElement | null = null;
let shortcutsToggle: HTMLInputElement | null = null;
let debugToggle: HTMLInputElement | null = null;
let noteToggle: HTMLInputElement | null = null;
let searchToggle: HTMLInputElement | null = null;
let navPrevInput: HTMLInputElement | null = null;
let navNextInput: HTMLInputElement | null = null;
let revealInput: HTMLInputElement | null = null;
let optionInputs: HTMLInputElement[] = [];

const start = () => {
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
    settings = normalizeSettings(undefined);
    return;
  }
  const stored = await storageGet(area, STORAGE_KEY);
  settings = normalizeSettings(stored[STORAGE_KEY]);
}

async function saveSettings(next: Settings) {
  settings = normalizeSettings(next);
  const area = getStorageArea(true);
  if (area) {
    await storageSet(area, { [STORAGE_KEY]: settings });
  }
  applySettings();
}

function ensureUI() {
  if (document.getElementById(ROOT_ID)) {
    root = document.getElementById(ROOT_ID) as HTMLDivElement;
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

  shortcutsToggle = document.createElement("input");
  shortcutsToggle.type = "checkbox";
  shortcutsToggle.className = "qb-support-toggle-input";
  shortcutsToggle.addEventListener("change", () => {
    void saveSettings({
      ...settings,
      shortcutsEnabled: shortcutsToggle?.checked ?? true,
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
      debugEnabled: debugToggle?.checked ?? false,
    });
  });

  searchToggle = document.createElement("input");
  searchToggle.type = "checkbox";
  searchToggle.className = "qb-support-toggle-input";
  searchToggle.addEventListener("change", () => {
    void saveSettings({
      ...settings,
      searchVisible: searchToggle?.checked ?? true,
    });
  });

  const searchLabel = document.createElement("label");
  searchLabel.className = "qb-support-toggle";
  searchLabel.appendChild(searchToggle);
  searchLabel.appendChild(makeSpan("検索バー表示"));

  noteToggle = document.createElement("input");
  noteToggle.type = "checkbox";
  noteToggle.className = "qb-support-toggle-input";
  noteToggle.addEventListener("change", () => {
    void saveSettings({
      ...settings,
      noteVisible: noteToggle?.checked ?? true,
    });
  });

  const noteLabel = document.createElement("label");
  noteLabel.className = "qb-support-toggle";
  noteLabel.appendChild(noteToggle);
  noteLabel.appendChild(makeSpan("ノート表示"));

  const shortcutSection = document.createElement("div");
  shortcutSection.className = "qb-support-section";
  shortcutSection.appendChild(makeSectionTitle("ショートカット"));

  const buildKeyField = (labelText: string) => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "qb-support-input";
    input.placeholder = "例: A";
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

  const navPrevField = buildKeyField("前へ");
  const navNextField = buildKeyField("次へ");
  const revealField = buildKeyField("解答");

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

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "qb-support-save";
  saveButton.textContent = "保存";
  saveButton.addEventListener("click", () => {
    const optionKeys = optionInputs.map((input) => normalizeKey(input.value)).filter(Boolean);
    const navPrevKey = normalizeKey(navPrevInput?.value ?? "");
    const navNextKey = normalizeKey(navNextInput?.value ?? "");
    const revealKey = normalizeKey(revealInput?.value ?? "");
    if (!navPrevKey || !navNextKey || !revealKey || optionKeys.length === 0) {
      setStatus("ショートカットを入力してください", true);
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
      optionKeys,
    });
    setStatus("保存しました", false);
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
  launcher.title = "QB設定";
  launcher.setAttribute("aria-label", "QB設定");
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
    chatRoot = document.getElementById(CHAT_ROOT_ID) as HTMLDivElement;
    chatPanel = chatRoot.querySelector(".qb-support-chat-panel") as HTMLDivElement | null;
    chatMessagesEl = chatRoot.querySelector(
      ".qb-support-chat-messages"
    ) as HTMLDivElement | null;
    chatInput = chatRoot.querySelector(
      ".qb-support-chat-textarea"
    ) as HTMLTextAreaElement | null;
    chatSendButton = chatRoot.querySelector(
      ".qb-support-chat-send"
    ) as HTMLButtonElement | null;
    chatStatusField = chatRoot.querySelector(
      ".qb-support-chat-status"
    ) as HTMLElement | null;
    chatApiInput = chatRoot.querySelector(
      ".qb-support-chat-api input"
    ) as HTMLInputElement | null;
    chatApiSaveButton = chatRoot.querySelector(
      ".qb-support-chat-save"
    ) as HTMLButtonElement | null;
    chatToggle = document.getElementById(CHAT_TOGGLE_ID) as HTMLButtonElement | null;
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
  dragButton.textContent = "⇄";
  dragButton.title = "左右にドラッグで切替";
  dragButton.setAttribute("aria-label", "左右にドラッグで切替");

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
  chatApiSaveButton.textContent = "保存";
  chatApiSaveButton.addEventListener("click", () => {
    const nextKey = chatApiInput?.value.trim() ?? "";
    if (!nextKey) {
      if (settings.chatApiKey) {
        setChatStatus("APIキーは保存済みです", false);
        return;
      }
      setChatStatus("APIキーを入力してください", true);
      return;
    }
    void saveSettings({ ...settings, chatApiKey: nextKey });
    if (chatApiInput) chatApiInput.value = "";
    setChatStatus("APIキーを保存しました", false);
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
  chatInput.placeholder = "質問を入力...";
  chatInput.rows = 3;

  chatSendButton = document.createElement("button");
  chatSendButton.type = "button";
  chatSendButton.className = "qb-support-chat-send";
  chatSendButton.textContent = "送信";

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
    chatApiInput.placeholder = settings.chatApiKey
      ? "保存済み (再入力で更新)"
      : "sk-...";
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

function startChatDrag(event: { clientX: number }) {
  if (!chatRoot) return;
  let active = true;
  chatRoot.dataset.dragging = "true";

  const finalize = (clientX: number | null) => {
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
  const onPointerUp = (ev: PointerEvent) => finalize(ev.clientX);
  const onTouchMove = () => {
    if (chatRoot) chatRoot.dataset.dragging = "true";
  };
  const onTouchEnd = (ev: TouchEvent) => {
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
    setChatStatus("APIキーを設定してください", true);
    return;
  }

  chatInput.value = "";
  setChatStatus("", false);
  chatHistory.push({ role: "user", content: userMessage });
  trimChatHistory();
  appendChatMessage("user", userMessage);

  chatRequestPending = true;
  const placeholder = appendChatMessage("assistant", "回答中...", { pending: true });

  try {
    const snapshot = await resolveQuestionSnapshot();
    const requestMessages = buildChatMessages(snapshot, userMessage);
    console.debug("[QB_SUPPORT][chat-send]", {
      hasSnapshot: Boolean(snapshot),
      history: chatHistory.length,
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
      placeholder.textContent = "応答に失敗しました";
      placeholder.classList.remove("is-pending");
    }
    console.warn("[QB_SUPPORT][chat-error]", error);
    setChatStatus(`エラー: ${String(error)}`, true);
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

function appendChatMessage(
  role: ChatRole,
  content: string,
  options?: { pending?: boolean }
): HTMLDivElement | null {
  if (!chatMessagesEl) return null;
  const message = document.createElement("div");
  message.className = `qb-support-chat-msg is-${role}`;
  if (options?.pending) message.classList.add("is-pending");
  message.textContent = content;
  chatMessagesEl.appendChild(message);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return message;
}

async function resolveQuestionSnapshot(): Promise<QuestionSnapshot | null> {
  const local = extractQuestionSnapshot(document, location.href);
  if (local) return local;
  if (window !== window.top) return currentSnapshot;
  const snapshot = await requestQuestionSnapshotFromFrame(900);
  return snapshot ?? null;
}

function buildChatMessages(
  snapshot: QuestionSnapshot | null,
  userMessage: string
): ChatMessage[] {
  const history = chatHistory.slice(-8);
  const last = history[history.length - 1];
  if (last && last.role === "user" && last.content === userMessage) {
    history.pop();
  }
  return [
    { role: "system", content: buildSystemPrompt(snapshot) },
    ...history,
    { role: "user", content: userMessage },
  ];
}

function buildSystemPrompt(snapshot: QuestionSnapshot | null): string {
  const base =
    "あなたはQB問題集の学習支援アシスタントです。与えられた問題文と選択肢に基づいて、日本語で簡潔に答えてください。情報が不足している場合は、その旨を伝えてください。";
  if (!snapshot) return `${base}\n\n問題情報: 取得できませんでした。`;
  const lines: string[] = [base, "", "問題情報:"];
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
  return lines.join("\n");
}

function updateSnapshot(snapshot: QuestionSnapshot) {
  const prevId = currentSnapshot?.id ?? null;
  currentSnapshot = snapshot;
  if (prevId && snapshot.id && prevId !== snapshot.id) {
    resetChatHistory();
  }
}

function resetChatHistory() {
  chatHistory = [];
  if (chatMessagesEl) chatMessagesEl.innerHTML = "";
  setChatStatus("問題が切り替わったため履歴をリセットしました", false);
}

async function requestChatCompletion(messages: ChatMessage[]): Promise<string> {
  const response = await sendRuntimeMessage<{
    ok: boolean;
    text?: string;
    error?: string;
  }>({
    type: "QB_CHAT_REQUEST",
    apiKey: settings.chatApiKey,
    model: settings.chatModel,
    messages,
  });

  if (!response) throw new Error("background応答がありません");
  if (!response.ok) throw new Error(response.error ?? "APIエラー");
  return response.text ?? "";
}

function setChatStatus(message: string, isError: boolean) {
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
    if (
      mutations.every((mutation) => {
        const target = mutation.target as Node;
        if (rootEl && rootEl.contains(target)) return true;
        if (chatEl && chatEl.contains(target)) return true;
        return false;
      })
    ) {
      return;
    }
    scheduleRefresh();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
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
            shift: event.shiftKey,
          },
        });
      }
      if (debug) {
        console.debug("[QB_SUPPORT][key]", {
          key: event.key,
          composing: event.isComposing,
          activeTag: document.activeElement?.tagName ?? null,
          targetTag: event.target instanceof HTMLElement ? event.target.tagName : null,
          pageReady: isQuestionPage(),
          shortcutsEnabled: settings.shortcutsEnabled,
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
            reason: "no-question-container",
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
            target: describeElement(event.target),
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
            frame: window === window.top ? "top" : "iframe",
          });
        }
        return;
      }

      const key = normalizeKey(event.key);
      if (key === settings.navNextKey || key === settings.navPrevKey) {
      if (window === window.top) {
        sendAction({
          action: "nav",
          key: key.toLowerCase(),
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
          frame: window === window.top ? "top" : "iframe",
        });
      }
      if (debug) {
        console.debug("[QB_SUPPORT][nav]", {
          key,
          target: describeElement(target),
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
            frame: window === window.top ? "top" : "iframe",
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
            index,
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
          frame: window === window.top ? "top" : "iframe",
        });
      }
      if (debug) {
        console.debug("[QB_SUPPORT][option]", {
          key,
          index,
          optionCount: options.length,
          target: describeElement(clickable),
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
            frame: window === window.top ? "top" : "iframe",
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
            key: key.toLowerCase(),
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
          frame: window === window.top ? "top" : "iframe",
        });
      }
      if (revealButton) {
        if (debug) {
          console.debug("[QB_SUPPORT][reveal]", {
            target: describeElement(revealButton),
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
              frame: window === window.top ? "top" : "iframe",
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
          frame: window === window.top ? "top" : "iframe",
        });
      }
      if (debug) {
        console.debug("[QB_SUPPORT][submit]", {
          target: describeElement(submitButton),
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
              frame: window === window.top ? "top" : "iframe",
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
        frame: window === window.top ? "top" : "iframe",
      });
    },
    { capture: true }
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      if (!panel || panel.classList.contains("is-hidden")) return;
      const target = event.target as Node | null;
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

function createGearIcon(): SVGElement {
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

function updateInfoPanel(info: QuestionInfo) {
  if (!panel) return;
  setField("id", info.id ?? "-");
  setField("progress", info.progressText ?? "-");
  setField("options", info.optionCount?.toString() ?? "-");
  setField("pageRef", info.pageRef ?? "-");
  setField("tags", info.tags.length > 0 ? info.tags.join(", ") : "-");
  setField("updated", formatTime(info.updatedAt));
}

function setField(key: string, value: string) {
  const field = infoFields[key];
  if (field) field.textContent = value;
}

function setStatus(message: string, isError: boolean) {
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

function isSameInfo(a: QuestionInfo, b: QuestionInfo): boolean {
  return (
    a.id === b.id &&
    a.progressText === b.progressText &&
    a.pageRef === b.pageRef &&
    a.optionCount === b.optionCount &&
    a.tags.join(",") === b.tags.join(",")
  );
}

function makeSectionTitle(text: string): HTMLElement {
  const title = document.createElement("div");
  title.className = "qb-support-section-title";
  title.textContent = text;
  return title;
}

function makeInfoRow(section: HTMLElement, label: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "qb-support-row";

  const labelEl = document.createElement("span");
  labelEl.className = "qb-support-row-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "qb-support-row-value";
  valueEl.textContent = "-";

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  section.appendChild(row);

  return valueEl;
}

function makeSpan(text: string): HTMLElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function debounce<T extends (...args: never[]) => void>(fn: T, delay: number) {
  let timer: number | null = null;
  return (...args: Parameters<T>) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isQuestionPage(): boolean {
  return document.querySelector(".question-container") !== null;
}

function isQbHost(): boolean {
  return location.hostname.includes("qb.medilink-study.com");
}

function isInputHost(): boolean {
  return location.hostname.includes("input.medilink-study.com");
}

function attachMessageHandlers() {
  window.addEventListener("message", (event) => {
    if (event.origin !== QB_TOP_ORIGIN && event.origin !== QB_ACTION_ORIGIN) return;
    const data = event.data;
    if (!data || data.__qb_support !== true) return;

    if (data.type === "QB_ACTION") {
      const action = data.action as "option" | "nav" | "reveal";
      const key = typeof data.key === "string" ? data.key : "";
      const index = typeof data.index === "number" ? data.index : null;
      console.log("[QB_SUPPORT][action-recv]", {
        url: location.href,
        frame: window === window.top ? "top" : "iframe",
        action,
        key,
        index,
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
        snapshot,
      };
      const target =
        event.source && "postMessage" in event.source ? event.source : window.parent;
      try {
        (target as Window).postMessage(response, QB_TOP_ORIGIN);
      } catch (error) {
        console.warn("[QB_SUPPORT][question-reply]", error);
      }
      return;
    }

    if (data.type === "QB_QUESTION_SNAPSHOT") {
      if (data.snapshot) {
        updateSnapshot(data.snapshot as QuestionSnapshot);
      }
    }
  });
}

function findTargetFrame(): Window | null {
  const frames = Array.from(document.querySelectorAll("iframe"));
  for (const frame of frames) {
    const src = frame.getAttribute("src") ?? "";
    if (src.includes("input.medilink-study.com")) {
      return frame.contentWindow;
    }
  }
  return null;
}

function postToInputFrame(message: Record<string, unknown>): {
  sent: boolean;
  method: "querySelector" | "window.frames" | "none";
  frameIndex: number | null;
  errors: string[];
} {
  const errors: string[] = [];
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

function requestQuestionSnapshotFromFrame(
  timeoutMs: number
): Promise<QuestionSnapshot | null> {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const handler = (event: MessageEvent) => {
      if (event.origin !== QB_ACTION_ORIGIN) return;
      const data = event.data;
      if (!data || data.__qb_support !== true) return;
      if (data.type !== "QB_QUESTION_SNAPSHOT") return;
      if (data.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      resolve((data.snapshot as QuestionSnapshot) ?? null);
    };
    window.addEventListener("message", handler);

    const result = postToInputFrame({
      __qb_support: true,
      type: "QB_QUESTION_REQUEST",
      requestId,
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
    windowFrames: window.frames.length,
  });
}

function listFrameSources(): string[] {
  const frames = Array.from(document.querySelectorAll("iframe"));
  return frames.map((frame) => frame.getAttribute("src") ?? "");
}

function isTargetKey(rawKey: string): boolean {
  const key = normalizeKey(rawKey);
  return (
    key === settings.navPrevKey ||
    key === settings.navNextKey ||
    key === settings.revealKey ||
    settings.optionKeys.includes(key)
  );
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function normalizeKey(rawKey: string): string {
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

function handleActionInFrame(
  action: "option" | "nav" | "reveal",
  key: string,
  index: number | null,
  source: "message" | "local"
) {
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
      source,
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
        source,
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
      source,
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
        source,
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
      source,
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
          source,
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
      source,
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
          source,
        });
      }, 200);
      void clickRevealWhenReady();
    }
  }
}

function isInteractiveTarget(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      ".multiple-answer-options, .single-answer-options, #answerSection, .custom-icon-arrow_left, .custom-icon-arrow_right"
    )
  );
}

function sendAction(
  payload: { action: "option" | "nav" | "reveal"; key: string; index?: number },
  event: KeyboardEvent
) {
  if (hasModifier(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (window !== window.top) return;
  const message = {
    __qb_support: true,
    type: "QB_ACTION",
    action: payload.action,
    key: payload.key,
    index: payload.index ?? null,
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
      errors: result.errors,
    });
    console.log("[QB_SUPPORT][action-local]", {
      url: location.href,
      frame: "top",
      action: payload.action,
      key: payload.key,
      index: payload.index ?? null,
      reason: "no-target-frame",
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
    frameIndex: result.frameIndex,
  });
}

function getOptionState(option: HTMLElement | null): Record<string, unknown> | null {
  if (!option) return null;
  const ans = option.querySelector<HTMLElement>(".ans") ?? option;
  const input = option.querySelector<HTMLInputElement>("input");
  return {
    active: ans.classList.contains("active"),
    checked: input ? input.checked : null,
    text: (ans.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
  };
}

function isSameOptionState(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null
): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function getRevealState(): Record<string, unknown> {
  const answerSection = document.getElementById("answerSection");
  const button = answerSection?.querySelector(".btn");
  return {
    hasAnswerSection: Boolean(answerSection),
    buttonText: button?.textContent?.trim() ?? null,
    answerSectionText: answerSection?.textContent?.trim().slice(0, 80) ?? null,
  };
}

function isSameRevealState(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
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
    version,
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
    pointerEvents: "none",
  });
  document.body.appendChild(marker);
}

function toggleMarker(visible: boolean) {
  const marker = document.getElementById(MARKER_ID);
  if (!marker) return;
  marker.style.display = visible ? "block" : "none";
}

function applySidebarVisibility(searchVisible: boolean, noteVisible: boolean) {
  const styleId = "qb-support-sidebar-style";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
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

function toggleWidgetVisibility(styleId: string, selector: string, visible: boolean) {
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
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
  const revealButton = await waitForRevealButton(2000);
  if (settings.debugEnabled) {
    console.debug("[QB_SUPPORT][reveal-wait]", {
      found: !!revealButton,
      target: describeElement(revealButton),
    });
  }
  if (!revealButton) return;
  clickWithFallback(revealButton, {
    tag: "reveal-wait",
    logAlways: settings.debugEnabled,
  });
}

function waitForRevealButton(timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const initial = getAnswerRevealButton(document);
    if (initial) {
      if (settings.debugEnabled) {
        console.debug("[QB_SUPPORT][reveal-check]", {
          phase: "initial",
          target: describeElement(initial),
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
            target: describeElement(found),
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
          phase: "timeout",
        });
      }
      resolve(null);
    }, timeoutMs);
  });
}

function clickWithFallback(
  target: HTMLElement,
  options?: { tag?: string; logAlways?: boolean }
) {
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

function describeElement(element: HTMLElement | null): string | null {
  if (!element) return null;
  const tag = element.tagName.toLowerCase();
  const cls = element.className ? `.${element.className.toString().trim().replace(/\\s+/g, ".")}` : "";
  const text = (element.textContent ?? "").trim().replace(/\\s+/g, " ").slice(0, 80);
  return `${tag}${cls}${text ? ` "${text}"` : ""}`;
}

async function clickWithCdp(target: HTMLElement, tag: string) {
  target.scrollIntoView({ block: "center", inline: "center" });
  const rect = target.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  try {
    const response = await sendRuntimeMessage<{
      ok: boolean;
      error?: string;
    }>({
      type: "QB_CDP_CLICK",
      x,
      y,
    });
    if (response?.ok) {
      console.log("[QB_SUPPORT][cdp-click]", { tag, ok: true, x, y });
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

function describeElementMeta(element: HTMLElement | null): Record<string, unknown> | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return {
    connected: element.isConnected,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    pointerEvents: style.pointerEvents,
    offsetParent: element.offsetParent ? element.offsetParent.tagName : null,
  };
}

function createPointerLikeEvent(type: string): MouseEvent | PointerEvent {
  const init = { bubbles: true, cancelable: true };
  if (type.startsWith("pointer") && "PointerEvent" in window) {
    return new PointerEvent(type, init);
  }
  return new MouseEvent(type, init);
}

function logClick(
  tag: string | undefined,
  method: string,
  target: HTMLElement,
  logAlways: boolean,
  result?: boolean
) {
  if (!settings.debugEnabled && !logAlways) return;
  const payload: Record<string, unknown> = {
    tag,
    method,
    target: describeElement(target),
  };
  if (typeof result === "boolean") payload.result = result;
  console.log("[QB_SUPPORT][click]", payload);
}

start();
