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
  CHAT_MODEL_OPTIONS,
  isShortcutMatch,
  normalizeSettings,
  normalizeShortcut,
  shortcutFromEvent,
} from "./core/settings";
import type {
  ChatTemplateSetting,
  QuestionInfo,
  QuestionSnapshot,
  Settings,
} from "./core/types";
type AuthProfile = {
  uid: string;
  email: string;
  source: "firebase" | "google";
};
import {
  getManifest,
  getStorageArea,
  sendRuntimeMessage,
  storageGet,
  storageSet,
  webext,
} from "./lib/webext";

const STORAGE_KEY = "qb_support_settings_v1";
const ROOT_ID = "qb-support-root";
const MARKER_ID = "qb-support-marker";
const CHAT_ROOT_ID = "qb-support-chat-root";
const CHAT_TOGGLE_ID = "qb-support-chat-toggle";
const CHAT_DOCK_CLASS = "qb-support-chat-dock";
const CHAT_RESIZER_ID = "qb-support-chat-resizer";
const CHAT_OVERLAY_HANDLE_ID = "qb-support-chat-overlay-handle";
const CHAT_TEMPLATE_ID = "qb-support-chat-templates";
const CHAT_TOGGLE_SHORTCUT = "Ctrl+O";
const CHAT_INPUT_TOGGLE_SHORTCUT = "Ctrl+Enter";
const CHAT_NEW_SHORTCUT = "Ctrl+N";
const CHAT_TEMPLATE_MAX = 5;
const CHAT_DOCK_MIN_WIDTH = 320;
const CHAT_DOCK_TARGET_RATIO = 0.45;
const CHAT_DOCK_GAP = 20;
const QB_ACTION_ORIGIN = "https://input.medilink-study.com";
const QB_TOP_ORIGIN = "https://qb.medilink-study.com";
const FIREBASE_SETTINGS_VERSION = 1;
const BACKEND_FORCED_MODEL = "gpt-4.1";
const DEFAULT_BACKEND_URL = "https://ipad-qb-support-400313981210.asia-northeast1.run.app";
const USAGE_META_EMAIL = "ymgtsny7@gmail.com";
const EXPLANATION_LEVEL_LABELS: Record<string, string> = {
  highschool: "高校生でもわかる",
  "med-junior": "医学部低学年",
  "med-senior": "医学部高学年〜研修医",
};
type ChatTemplateRow = {
  container: HTMLDivElement;
  enabled: HTMLInputElement;
  label: HTMLInputElement;
  shortcut: HTMLInputElement;
  prompt: HTMLTextAreaElement;
};

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ResponseInputText = {
  type: "input_text";
  text: string;
};

type ResponseInputImage = {
  type: "input_image";
  image_url: string;
};

type ResponseInputItem = {
  role: "user";
  content: Array<ResponseInputText | ResponseInputImage>;
};

type ChatAuthMode = "apiKey" | "backend";

type ChatAuth = {
  mode: ChatAuthMode;
  apiKey?: string;
  backendUrl?: string;
  authToken?: string;
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
let chatInputWrap: HTMLDivElement | null = null;
let chatApiInput: HTMLInputElement | null = null;
let chatApiSaveButton: HTMLButtonElement | null = null;
let chatApiKeyToggle: HTMLInputElement | null = null;
let chatApiKeyVisibilityButton: HTMLButtonElement | null = null;
let chatApiKeyStatus: HTMLElement | null = null;
let chatModelInput: HTMLSelectElement | null = null;
let chatModelSaveButton: HTMLButtonElement | null = null;
let chatSettingsPanel: HTMLDivElement | null = null;
let chatSettingsButton: HTMLButtonElement | null = null;
let chatSettingsOpen = false;
let chatApiKeyVisible = false;
let chatTemplateBar: HTMLDivElement | null = null;
let chatTemplateRows: ChatTemplateRow[] = [];
let templateCountLabel: HTMLSpanElement | null = null;
let templateAddButton: HTMLButtonElement | null = null;
let templateRemoveButton: HTMLButtonElement | null = null;
let hintQuickButton: HTMLButtonElement | null = null;
let chatResizer: HTMLDivElement | null = null;
let chatOverlayHandle: HTMLButtonElement | null = null;
let chatHistory: ChatMessage[] = [];
let chatRequestPending = false;
let chatComposing = false;
let chatLayoutBound = false;
let chatDockWidth = 0;
let chatResizeActive = false;
let lastChatOpen = false;
let lastChatLayout: "dock" | "overlay" | "overlay-bottom" | null = null;
let chatLastResponseId: string | null = null;
let activeChatRequestId: string | null = null;
let activeChatPort: chrome.runtime.Port | null = null;
let shortcutInput: HTMLInputElement | null = null;
let positionSelect: HTMLSelectElement | null = null;
let enabledToggle: HTMLInputElement | null = null;
let shortcutsToggle: HTMLInputElement | null = null;
let debugToggle: HTMLInputElement | null = null;
let noteToggle: HTMLInputElement | null = null;
let searchToggle: HTMLInputElement | null = null;
let pageAccentToggle: HTMLInputElement | null = null;
let navPrevInput: HTMLInputElement | null = null;
let navNextInput: HTMLInputElement | null = null;
let revealInput: HTMLInputElement | null = null;
let optionInputs: HTMLInputElement[] = [];
let authProfile: AuthProfile | null = null;
let authStatusField: HTMLElement | null = null;
let authMetaField: HTMLElement | null = null;
let authSyncField: HTMLElement | null = null;
let authSignInButton: HTMLButtonElement | null = null;
let authSignOutButton: HTMLButtonElement | null = null;
let authInitialized = false;
let authSyncTimer: number | null = null;
let authSyncInFlight = false;
let authSyncPending = false;
let authRemoteFetchPending = false;
let authNetworkBound = false;
let remoteSettingsLoadedFor: string | null = null;
let authAccessToken: string | null = null;
let explanationLevelSelect: HTMLSelectElement | null = null;
let explanationPromptInputs: Partial<Record<string, HTMLTextAreaElement>> = {};
let commonPromptInput: HTMLTextAreaElement | null = null;
let shortcutSectionEl: HTMLDivElement | null = null;
let displaySectionEl: HTMLDivElement | null = null;
let templateSectionEl: HTMLDivElement | null = null;
let explanationSectionEl: HTMLDivElement | null = null;
let authSectionEl: HTMLDivElement | null = null;
let themeSelect: HTMLSelectElement | null = null;
let themeQuery: MediaQueryList | null = null;

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
  let stored: Record<string, any> = {};
  let storageLabel = "none";
  if (!primary && !fallback) {
    settings = normalizeSettings(undefined);
    return;
  }
  if (primary) {
    try {
      stored = await storageGet(primary, STORAGE_KEY);
      storageLabel = primary === webext.storage?.sync ? "sync" : "local";
    } catch (error) {
      console.warn("[QB_SUPPORT][settings] load failed", {
        storage: primary === webext.storage?.sync ? "sync" : "local",
        message: error instanceof Error ? error.message : String(error),
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
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  settings = normalizeSettings(stored?.[STORAGE_KEY]);
  console.log("[QB_SUPPORT][settings] loaded", {
    storage: storageLabel,
    apiKeyLength: settings.chatApiKey?.length ?? 0,
    apiKeyEnabled: settings.chatApiKeyEnabled,
  });
}

async function saveSettings(next: Settings, options?: { skipRemote?: boolean }) {
  settings = normalizeSettings(next);
  const area = getStorageArea(true);
  if (area) {
    try {
      await storageSet(area, { [STORAGE_KEY]: settings });
      console.log("[QB_SUPPORT][settings] saved", {
        storage: area === webext.storage?.sync ? "sync" : "local",
        apiKeyLength: settings.chatApiKey?.length ?? 0,
        apiKeyEnabled: settings.chatApiKeyEnabled,
      });
    } catch (error) {
      console.warn("[QB_SUPPORT][settings] save failed", {
        storage: area === webext.storage?.sync ? "sync" : "local",
        message: error instanceof Error ? error.message : String(error),
      });
      const fallback = getStorageArea(false);
      if (fallback && fallback !== area) {
        try {
          await storageSet(fallback, { [STORAGE_KEY]: settings });
          console.log("[QB_SUPPORT][settings] saved fallback", {
            storage: fallback === webext.storage?.sync ? "sync" : "local",
            apiKeyLength: settings.chatApiKey?.length ?? 0,
            apiKeyEnabled: settings.chatApiKeyEnabled,
          });
        } catch (fallbackError) {
          console.warn("[QB_SUPPORT][settings] save fallback failed", {
            storage: fallback === webext.storage?.sync ? "sync" : "local",
            message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
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
    return;
  }
  const name = authProfile.email || "Googleユーザー";
  authStatusField.textContent = `ログイン中: ${name}`;
  authMetaField.textContent = authProfile.email ?? "";
  authSignInButton.style.display = "none";
  authSignOutButton.style.display = "inline-flex";
}

function setAuthStatus(message: string, isError: boolean) {
  if (!authStatusField) return;
  authStatusField.textContent = message;
  authStatusField.classList.toggle("is-error", isError);
}

function setAuthSyncStatus(message: string, isError: boolean) {
  if (!authSyncField) return;
  authSyncField.textContent = message;
  authSyncField.classList.toggle("is-error", isError);
}

async function requestGoogleAuthToken(interactive: boolean): Promise<string> {
  const timeoutMs = interactive ? 130000 : 15000;
  const startedAt = Date.now();
  console.log("[QB_SUPPORT][auth-ui] token request start", { timeoutMs, interactive });
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      console.warn("[QB_SUPPORT][auth-ui] token request timeout", { timeoutMs });
      reject(new Error("ログイン画面の起動がタイムアウトしました。もう一度お試しください。"));
    }, timeoutMs);
  });
  const responsePromise = sendRuntimeMessage<{
    ok: boolean;
    token?: string;
    error?: string;
  }>({
    type: "QB_AUTH_GET_TOKEN",
    interactive,
  })
    .then((response) => {
      console.log("[QB_SUPPORT][auth-ui] token request response", {
        ok: response?.ok ?? false,
        tokenPresent: Boolean(response?.token),
        error: response?.error ?? null,
        ms: Date.now() - startedAt,
      });
      return response;
    })
    .catch((error) => {
      console.warn("[QB_SUPPORT][auth-ui] token request error", {
        message: error instanceof Error ? error.message : String(error),
        ms: Date.now() - startedAt,
      });
      throw error;
    });
  const response = await Promise.race([responsePromise, timeoutPromise]);
  if (timeoutId) window.clearTimeout(timeoutId);
  if (!response?.ok) {
    const message = response?.error ?? "OAuth token request failed.";
    throw new Error(message);
  }
  if (!response.token) throw new Error("OAuth token was not returned.");
  authAccessToken = response.token;
  return response.token;
}

async function fetchBackendAuthProfile(token: string): Promise<AuthProfile> {
  const baseUrl = resolveBackendBaseUrl();
  if (!baseUrl) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/+$/, "") + "/auth/me";
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`認証に失敗しました: ${response.status} ${detail}`);
  }
  const data = (await response.json()) as AuthProfile;
  return data;
}

async function ensureAuthAccessToken(interactive: boolean): Promise<string> {
  if (authAccessToken) return authAccessToken;
  const token = await requestGoogleAuthToken(interactive);
  const profile = await fetchBackendAuthProfile(token);
  authAccessToken = token;
  authProfile = profile;
  updateAuthUI();
  applyChatSettings();
  return token;
}

async function refreshAuthState(interactive: boolean) {
  try {
    const token = await requestGoogleAuthToken(interactive);
    const profile = await fetchBackendAuthProfile(token);
    authAccessToken = token;
    authProfile = profile;
    updateAuthUI();
    applyChatSettings();
    if (remoteSettingsLoadedFor !== profile.uid) {
      remoteSettingsLoadedFor = profile.uid;
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
  console.log("[QB_SUPPORT][auth] ORIGIN", location.origin);
  console.log("[QB_SUPPORT][auth] HREF", location.href);
  console.log("[QB_SUPPORT][auth] EXT_ID", webext.runtime?.id ?? null);
  try {
    await refreshAuthState(true);
    setAuthStatus("ログイン完了", false);
    console.log("[QB_SUPPORT][auth] sign-in success");
  } catch (error) {
    console.log("[QB_SUPPORT][auth] AUTH_ERR_RAW", error);
    const err = error as { message?: string; stack?: string };
    console.log("[QB_SUPPORT][auth] AUTH_ERR_MSG", err?.message);
    console.log("[QB_SUPPORT][auth] AUTH_ERR_STACK", err?.stack);
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
    if (authAccessToken) {
      await sendRuntimeMessage({
        type: "QB_AUTH_REMOVE_TOKEN",
        token: authAccessToken,
      });
      authAccessToken = null;
    }
    authProfile = null;
    remoteSettingsLoadedFor = null;
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
    console.log("[QB_SUPPORT][auth-sync] pull", {
      hasSettings: Boolean(remoteSettings),
      apiKeyLength:
        remoteSettings && typeof remoteSettings.chatApiKey === "string"
          ? remoteSettings.chatApiKey.length
          : 0,
    });
    if (remoteSettings) {
      const merged = normalizeSettings({
        ...settings,
        ...remoteSettings,
        chatOpen: settings.chatOpen,
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

async function fetchRemoteSettings(): Promise<Partial<Settings> | null> {
  if (!authProfile) return null;
  const token = await ensureAuthAccessToken(false);
  const url = resolveBackendSettingsUrl();
  if (!url) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`設定取得に失敗しました: ${response.status} ${detail}`);
  }
  const data = (await response.json()) as { settings?: Partial<Settings> | null } | null;
  if (!data?.settings || typeof data.settings !== "object") return null;
  return data.settings;
}

function buildRemoteSettingsPayload(current: Settings): Partial<Settings> {
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
    console.log("[QB_SUPPORT][auth-sync] push", {
      apiKeyLength: settings.chatApiKey?.length ?? 0,
      apiKeyEnabled: settings.chatApiKeyEnabled,
    });
    const token = await ensureAuthAccessToken(false);
    const url = resolveBackendSettingsUrl();
    if (!url) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        settings: buildRemoteSettingsPayload(settings),
        schemaVersion: FIREBASE_SETTINGS_VERSION,
        updatedAt: Date.now(),
      }),
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

function isOfflineSyncError(error: unknown): boolean {
  if (!navigator.onLine) return true;
  const message = String(error ?? "");
  return (
    message.includes("client is offline") ||
    message.includes("offline") ||
    message.includes("unavailable")
  );
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
  displaySectionEl = settingsSection;
  setSectionCollapsed(settingsSection, true);

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
  searchLabel.className = "qb-support-toggle qb-support-toggle-btn";
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
  noteLabel.className = "qb-support-toggle qb-support-toggle-btn";
  noteLabel.appendChild(noteToggle);
  noteLabel.appendChild(makeSpan("ノート表示"));

  pageAccentToggle = document.createElement("input");
  pageAccentToggle.type = "checkbox";
  pageAccentToggle.className = "qb-support-toggle-input";
  pageAccentToggle.addEventListener("change", () => {
    void saveSettings({
      ...settings,
      pageAccentEnabled: pageAccentToggle?.checked ?? false,
    });
  });

  const pageAccentLabel = document.createElement("label");
  pageAccentLabel.className = "qb-support-toggle";
  pageAccentLabel.appendChild(pageAccentToggle);
  pageAccentLabel.appendChild(makeSpan("ページに緑アクセント"));

  themeSelect = document.createElement("select");
  themeSelect.className = "qb-support-select";
  [
    { value: "system", label: "システム" },
    { value: "light", label: "ライト" },
    { value: "dark", label: "ダーク" },
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
      themePreference: nextTheme,
    });
  });

  const themeLabel = document.createElement("label");
  themeLabel.className = "qb-support-field";
  themeLabel.appendChild(makeSpan("テーマ"));
  themeLabel.appendChild(themeSelect);

  const shortcutSection = document.createElement("div");
  shortcutSection.className = "qb-support-section";
  shortcutSection.appendChild(makeSectionTitle("ショートカット"));
  shortcutSectionEl = shortcutSection;
  setSectionCollapsed(shortcutSection, true);

  const modifierLabelFromKey = (rawKey: string) => {
    const lower = rawKey.toLowerCase();
    if (lower === "control") return "Ctrl";
    if (lower === "alt") return "Alt";
    if (lower === "shift") return "Shift";
    if (lower === "meta") return "Meta";
    return "";
  };

  const buildKeyField = (labelText: string) => {
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

  const buildShortcutField = (labelText: string, placeholder = "例: Ctrl+S") => {
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

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "qb-support-save";
  applyButtonVariant(saveButton, "primary");
  saveButton.textContent = "保存";
  saveButton.addEventListener("click", () => {
    const optionKeys = optionInputs
      .map((input) => normalizeShortcut(input.value))
      .filter(Boolean);
    const navPrevKey = normalizeShortcut(navPrevInput?.value ?? "");
    const navNextKey = normalizeShortcut(navNextInput?.value ?? "");
    const revealKey = normalizeShortcut(revealInput?.value ?? "");
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

  const buildTemplateField = (labelText: string, input: HTMLElement) => {
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
      prompt: promptInput,
    });
  }

  const templateSaveButton = document.createElement("button");
  templateSaveButton.type = "button";
  templateSaveButton.className = "qb-support-save qb-support-template-save";
  applyButtonVariant(templateSaveButton, "primary");
  templateSaveButton.textContent = "テンプレ保存";
  templateSaveButton.addEventListener("click", () => {
    const nextTemplates = chatTemplateRows.map((row, index) => {
      const label = row.label.value.trim() || `テンプレ${index + 1}`;
      const shortcut = normalizeShortcut(row.shortcut.value);
      const prompt = row.prompt.value.trim();
      return {
        enabled: row.enabled.checked,
        label,
        shortcut,
        prompt,
      };
    });
    if (nextTemplates.some((template) => template.enabled && !template.prompt)) {
      setStatus("有効なテンプレはプロンプト必須です", true);
      return;
    }
    void saveSettings({
      ...settings,
      chatTemplates: nextTemplates,
    });
    setStatus("テンプレを保存しました", false);
  });

  templateSection.appendChild(templateList);

  templateSection.appendChild(templateSaveButton);

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
  explanationSelectLabel.appendChild(makeSpan("レベル"));
  explanationSelectLabel.appendChild(explanationLevelSelect);

  const buildExplanationPromptField = (labelText: string, key: string) => {
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

  const explanationSaveButton = document.createElement("button");
  explanationSaveButton.type = "button";
  explanationSaveButton.className = "qb-support-save qb-support-explanation-save";
  applyButtonVariant(explanationSaveButton, "primary");
  explanationSaveButton.textContent = "解説設定を保存";
  explanationSaveButton.addEventListener("click", () => {
    const level = explanationLevelSelect?.value ?? "med-junior";
    const commonPrompt = commonPromptInput?.value.trim() ?? "";
    const nextPrompts = {
      highschool: explanationPromptInputs.highschool?.value.trim() ?? "",
      "med-junior": explanationPromptInputs["med-junior"]?.value.trim() ?? "",
      "med-senior": explanationPromptInputs["med-senior"]?.value.trim() ?? "",
    };
    if (!nextPrompts.highschool || !nextPrompts["med-junior"] || !nextPrompts["med-senior"]) {
      setStatus("解説プロンプトを入力してください", true);
      return;
    }
    void saveSettings({
      ...settings,
      commonPrompt,
      explanationLevel: level,
      explanationPrompts: nextPrompts,
    });
    setStatus("解説レベルを保存しました", false);
  });

  explanationSection.appendChild(commonPromptLabel);
  explanationSection.appendChild(explanationSelectLabel);
  explanationSection.appendChild(promptWrap);
  explanationSection.appendChild(explanationSaveButton);

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
      ".qb-support-chat-api-key"
    ) as HTMLInputElement | null;
    if (!chatApiInput) {
      chatApiInput = chatRoot.querySelector(
        ".qb-support-chat-api input"
      ) as HTMLInputElement | null;
    }
    chatApiSaveButton = chatRoot.querySelector(
      ".qb-support-chat-api-save"
    ) as HTMLButtonElement | null;
    if (!chatApiSaveButton) {
      chatApiSaveButton = chatRoot.querySelector(
        ".qb-support-chat-save"
      ) as HTMLButtonElement | null;
    }
    chatApiKeyToggle = chatRoot.querySelector(
      ".qb-support-chat-api-key-toggle"
    ) as HTMLInputElement | null;
    chatApiKeyVisibilityButton = chatRoot.querySelector(
      ".qb-support-chat-api-visibility"
    ) as HTMLButtonElement | null;
    chatApiKeyStatus = chatRoot.querySelector(
      ".qb-support-chat-api-key-status"
    ) as HTMLElement | null;
    const modelNode = chatRoot.querySelector(".qb-support-chat-model");
    chatModelInput = modelNode instanceof HTMLSelectElement ? modelNode : null;
    chatModelSaveButton = chatRoot.querySelector(
      ".qb-support-chat-model-save"
    ) as HTMLButtonElement | null;
    chatSettingsPanel = chatRoot.querySelector(
      ".qb-support-chat-settings"
    ) as HTMLDivElement | null;
    chatSettingsButton = chatRoot.querySelector(
      ".qb-support-chat-settings-btn"
    ) as HTMLButtonElement | null;
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
    const apiSection = chatRoot.querySelector(".qb-support-chat-api");
    if (apiSection) {
      let apiKeyRow = apiSection.querySelector(
        ".qb-support-chat-api-row"
      ) as HTMLDivElement | null;
      if (!apiKeyRow) {
        apiKeyRow = document.createElement("div");
        apiKeyRow.className = "qb-support-chat-api-row";
        if (chatApiInput && chatApiInput.parentElement === apiSection) {
          apiSection.insertBefore(apiKeyRow, chatApiInput);
          apiKeyRow.appendChild(chatApiInput);
        } else {
          apiSection.appendChild(apiKeyRow);
          if (chatApiInput) apiKeyRow.appendChild(chatApiInput);
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
      if (apiKeyRow && chatApiKeyVisibilityButton && !apiKeyRow.contains(chatApiKeyVisibilityButton)) {
        apiKeyRow.appendChild(chatApiKeyVisibilityButton);
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
      if (
        chatApiKeyStatus &&
        chatApiSaveButton &&
        !apiSection.contains(chatApiKeyStatus)
      ) {
        apiSection.insertBefore(chatApiKeyStatus, chatApiSaveButton);
      } else if (chatApiKeyStatus && !apiSection.contains(chatApiKeyStatus)) {
        apiSection.appendChild(chatApiKeyStatus);
      }
      if (!chatApiKeyToggle) {
        const apiKeyToggleLabel = document.createElement("label");
        apiKeyToggleLabel.className = "qb-support-toggle qb-support-chat-api-toggle";
        chatApiKeyToggle = document.createElement("input");
        chatApiKeyToggle.type = "checkbox";
        chatApiKeyToggle.className =
          "qb-support-toggle-input qb-support-chat-api-key-toggle";
        apiKeyToggleLabel.appendChild(chatApiKeyToggle);
        apiKeyToggleLabel.appendChild(makeSpan("手動APIキーを使用"));
        apiSection.appendChild(apiKeyToggleLabel);
      }
      if (chatApiKeyToggle && chatApiKeyToggle.dataset.handlers !== "true") {
        chatApiKeyToggle.dataset.handlers = "true";
        chatApiKeyToggle.addEventListener("change", () => {
          void saveSettings({
            ...settings,
            chatApiKeyEnabled: chatApiKeyToggle?.checked ?? true,
          });
        });
      }
    }
    if (!chatModelInput || !chatModelSaveButton) {
      if (apiSection) {
        let modelLabel = apiSection.querySelector(
          ".qb-support-chat-model-label"
        ) as HTMLLabelElement | null;
        if (!modelLabel) {
          modelLabel = document.createElement("label");
          modelLabel.textContent = "Model";
          modelLabel.className = "qb-support-chat-api-label qb-support-chat-model-label";
          apiSection.appendChild(modelLabel);
        }

        const existingInput = apiSection.querySelector(".qb-support-chat-model");
        if (existingInput && !(existingInput instanceof HTMLSelectElement)) {
          existingInput.remove();
        }
        chatModelInput = createChatModelSelect();
        apiSection.appendChild(chatModelInput);

        if (!chatModelSaveButton) {
          chatModelSaveButton = document.createElement("button");
          chatModelSaveButton.type = "button";
          chatModelSaveButton.className =
            "qb-support-chat-save qb-support-chat-model-save";
          chatModelSaveButton.textContent = "適用";
          apiSection.appendChild(chatModelSaveButton);
        }
      }
    }
    if (!chatSettingsButton) {
      const actions = chatRoot.querySelector(".qb-support-chat-actions");
      if (actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "qb-support-chat-settings-btn";
        button.textContent = "設定";
        button.setAttribute("aria-label", "チャット設定");
        actions.insertBefore(button, actions.firstChild);
        chatSettingsButton = button;
      }
    }
    if (!chatSettingsPanel) {
      const existingPanel = chatRoot.querySelector(".qb-support-chat-settings");
      if (existingPanel instanceof HTMLDivElement) {
        chatSettingsPanel = existingPanel;
      } else {
        const panel = document.createElement("div");
        panel.className = "qb-support-chat-settings";
        panel.dataset.open = "false";
        const apiSection = chatRoot.querySelector(".qb-support-chat-api");
        if (apiSection) {
          apiSection.classList.add("qb-support-chat-settings-section");
          panel.appendChild(apiSection);
        }
        if (chatPanel && chatMessagesEl) {
          chatPanel.insertBefore(panel, chatMessagesEl);
        } else {
          chatPanel?.appendChild(panel);
        }
        chatSettingsPanel = panel;
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
    ) as HTMLButtonElement | null;
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
  settingsButton.textContent = "設定";
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

  chatApiSaveButton = document.createElement("button");
  chatApiSaveButton.type = "button";
  chatApiSaveButton.className = "qb-support-chat-save qb-support-chat-api-save";
  chatApiSaveButton.textContent = "保存";
  applyButtonVariant(chatApiSaveButton, "primary");
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
      chatApiKeyEnabled: chatApiKeyToggle?.checked ?? true,
    });
  });

  const modelLabel = document.createElement("label");
  modelLabel.textContent = "Model";
  modelLabel.className = "qb-support-chat-api-label qb-support-chat-model-label";

  chatModelInput = createChatModelSelect();

  chatModelSaveButton = document.createElement("button");
  chatModelSaveButton.type = "button";
  chatModelSaveButton.className = "qb-support-chat-save qb-support-chat-model-save";
  chatModelSaveButton.textContent = "適用";
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
    chatResizer = existing as HTMLDivElement;
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
    chatOverlayHandle = existing as HTMLButtonElement;
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
    chatToggle = existing as HTMLButtonElement;
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
  let status = "未入力";
  if (saved) {
    status = "入力済み";
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

function resolveTheme(): "light" | "dark" {
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
    chatTemplateBar = existing as HTMLDivElement;
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

function getEnabledChatTemplates(): ChatTemplateSetting[] {
  return getEnabledChatTemplatesWithIndex().map(({ template }) => template);
}

function getEnabledChatTemplatesWithIndex(): Array<{
  template: ChatTemplateSetting;
  index: number;
}> {
  const count = getTemplateCount();
  const templates = settings.chatTemplates ?? [];
  const list: Array<{ template: ChatTemplateSetting; index: number }> = [];
  for (let i = 0; i < Math.min(count, templates.length); i += 1) {
    const template = templates[i];
    if (!template || !template.enabled || !template.prompt.trim()) continue;
    list.push({ template, index: i });
  }
  return list;
}

function getTemplateCount(): number {
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

function updateTemplateCount(nextCount: number) {
  const clamped = Math.min(Math.max(nextCount, 1), CHAT_TEMPLATE_MAX);
  if (clamped === getTemplateCount()) return;
  const nextTemplates = (settings.chatTemplates ?? []).map((template) => ({ ...template }));
  for (let i = clamped; i < nextTemplates.length; i += 1) {
    nextTemplates[i].enabled = false;
  }
  void saveSettings({
    ...settings,
    chatTemplateCount: clamped,
    chatTemplates: nextTemplates,
  });
}

function getHintTemplate(): { template: ChatTemplateSetting; index: number } | null {
  const hintPhrase = "絶妙なヒント";
  for (const entry of getEnabledChatTemplatesWithIndex()) {
    const template = entry.template;
    const label = template.label ?? "";
    const prompt = template.prompt ?? "";
    if (label.includes("ヒント") || label.includes(hintPhrase) || prompt.includes(hintPhrase)) {
      return entry;
    }
  }
  return null;
}

function setSectionCollapsed(section: HTMLElement | null, collapsed: boolean) {
  if (!section) return;
  section.dataset.collapsed = collapsed ? "true" : "false";
  const title = section.querySelector(".qb-support-section-title");
  if (title) {
    title.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
}

function openTemplateEditor(index: number) {
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

function attachTemplateEditJump(button: HTMLButtonElement, index: number) {
  if (button.dataset.editJump === "true") return;
  button.dataset.editJump = "true";
  let hoverTimer: number | null = null;
  let pressTimer: number | null = null;
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
  hintQuickButton.textContent = "ヒント";
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

function createChatModelSelect(): HTMLSelectElement {
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
    setChatStatus(`モデルを ${nextModel} に設定しました`, false);
  });
  if (chatModelSaveButton && chatModelSaveButton.dataset.handlers !== "true") {
    chatModelSaveButton.dataset.handlers = "true";
    chatModelSaveButton.addEventListener("click", () => {
      const nextModel = chatModelInput?.value ?? "";
      if (!nextModel) return;
      void saveSettings({ ...settings, chatModel: nextModel });
      setChatStatus(`モデルを ${nextModel} に設定しました`, false);
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

function toggleChatSettings(force?: boolean) {
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
    templateSectionEl,
  ];
  sections.forEach((section) => {
    if (section) chatSettingsPanel?.appendChild(section);
  });
  chatSettingsPanel.dataset.populated = "true";
}

function resolveBackendBaseUrl(): string | null {
  const raw = DEFAULT_BACKEND_URL.trim();
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function resolveBackendSettingsUrl(): string | null {
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

function isBackendModelLocked(): boolean {
  const apiKey = settings.chatApiKey?.trim() ?? "";
  if (apiKey && settings.chatApiKeyEnabled) return false;
  if (!authProfile) return false;
  return Boolean(resolveBackendBaseUrl());
}

async function resolveChatAuth(): Promise<ChatAuth> {
  const apiKey = settings.chatApiKey?.trim() ?? "";
  if (apiKey && settings.chatApiKeyEnabled) {
    return { mode: "apiKey", apiKey };
  }

  if (!authProfile) {
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

async function resolveChatAuthWithStatus(): Promise<ChatAuth | null> {
  try {
    return await resolveChatAuth();
  } catch (error) {
    setChatStatus(error instanceof Error ? error.message : String(error), true);
    return null;
  }
}

async function sendTemplateMessage(template: ChatTemplateSetting | string) {
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

function applyTemplateConstraints(
  message: string,
  template: ChatTemplateSetting | string
): string {
  return message;
}

type ButtonVariant = "primary" | "ghost" | "accent" | "danger";

function applyButtonVariant(button: HTMLButtonElement | null, variant: ButtonVariant) {
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

function shouldUseBottomOverlay(): boolean {
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 1;
  return width / height <= 1.2;
}

function getDockWidth(): number {
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

function getDockMaxWidth(): number {
  return Math.max(CHAT_DOCK_MIN_WIDTH, window.innerWidth - CHAT_DOCK_GAP);
}

function setChatDockWidth(width: number) {
  const max = getDockMaxWidth();
  chatDockWidth = Math.min(Math.max(CHAT_DOCK_MIN_WIDTH, width), max);
  const value = `${chatDockWidth}px`;
  chatRoot?.style.setProperty("--qb-support-chat-dock-width", value);
  chatResizer?.style.setProperty("--qb-support-chat-dock-width", value);
  document.body?.style.setProperty("--qb-support-chat-dock-width", value);
  chatTemplateBar?.style.setProperty("--qb-support-chat-dock-width", value);
}

function startChatResize(event: PointerEvent) {
  if (!settings.chatOpen || !chatResizer) return;
  if (!document.body.classList.contains(CHAT_DOCK_CLASS)) return;
  captureQuestionImageBaseSizes();
  chatResizeActive = true;
  chatResizer.setPointerCapture(event.pointerId);
  event.preventDefault();

  const onMove = (ev: PointerEvent) => {
    if (!chatResizeActive) return;
    const width = Math.round(window.innerWidth - ev.clientX);
    const min = CHAT_DOCK_MIN_WIDTH;
    const max = getDockMaxWidth();
    setChatDockWidth(Math.min(Math.max(min, width), max));
  };

  const onUp = (ev: PointerEvent) => {
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
  const effectiveModel =
    auth.mode === "backend" ? BACKEND_FORCED_MODEL : settings.chatModel;
  const useThinking = effectiveModel.startsWith("gpt-5");
  let thinkingTimer: number | null = null;
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
      history: chatHistory.length,
    });
    const streamState = { text: "" };
    const response = await requestChatResponseStream(
      {
        requestId,
        input,
        instructions,
        previousResponseId: chatLastResponseId,
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
          setChatMessageContent(placeholder, "assistant", streamState.text || "回答中...");
          placeholder.classList.remove("is-pending");
          chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
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

function appendChatMessage(
  role: ChatRole,
  content: string,
  options?: { pending?: boolean }
): HTMLDivElement | null {
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

function setChatMessageContent(message: HTMLDivElement, role: ChatRole, content: string) {
  message.dataset.raw = content;
  let contentEl = message.querySelector(".qb-support-chat-content") as HTMLDivElement | null;
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

function renderMarkdown(text: string): string {
  const escaped = escapeHtml(text.replace(/\r\n/g, "\n"));
  const codeBlocks: string[] = [];
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

function escapeHtml(text: string): string {
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

function setChatMessageMeta(message: HTMLDivElement, meta: string) {
  let metaEl = message.querySelector(".qb-support-chat-meta") as HTMLDivElement | null;
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

function ensureCopyButton(message: HTMLDivElement) {
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

function applyUserMessageCollapse(message: HTMLDivElement, content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 400) return;
  const preview = `${words.slice(0, 400).join(" ")} … (クリックで展開)`;
  const contentEl = message.querySelector(".qb-support-chat-content") as HTMLDivElement | null;
  if (!contentEl) return;
  message.classList.add("is-collapsible", "is-collapsed");
  contentEl.textContent = preview;
  message.dataset.full = content;
  message.dataset.preview = preview;
  message.addEventListener("click", () => {
    const collapsed = message.classList.toggle("is-collapsed");
    const nextText = collapsed ? message.dataset.preview : message.dataset.full;
    if (nextText) {
      const targetEl =
        message.querySelector(".qb-support-chat-content") as HTMLDivElement | null;
      if (targetEl) targetEl.textContent = nextText;
    }
  });
}

type ResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-5.2": { input: 10, output: 30 },
  "gpt-5.2-chat-latest": { input: 10, output: 30 },
  "gpt-5": { input: 10, output: 30 },
  "gpt-4.1": { input: 5, output: 15 },
  "gpt-4o": { input: 5, output: 15 },
};
const USD_TO_JPY = 155;

function shouldShowUsageMeta(): boolean {
  const email = authProfile?.email?.trim().toLowerCase() ?? "";
  return email === USAGE_META_EMAIL;
}

function formatUsageMeta(
  usage: ResponseUsage,
  model: string,
  mode: ChatAuthMode
): string | null {
  if (!shouldShowUsageMeta()) return null;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
  if (!totalTokens) return null;
  const pricing = MODEL_PRICING_USD_PER_1M[model];
  const cost =
    pricing
      ? ((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000) *
        USD_TO_JPY
      : null;
  const costLabel = cost !== null ? `¥${cost.toFixed(2)} (概算)` : "¥-";
  const source = mode === "backend" ? "backend" : "frontend";
  return `source: ${source} ・ model: ${model} ・ tokens: ${totalTokens} (in ${inputTokens} / out ${outputTokens}) ・ ${costLabel}`;
}

function createChatRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function resolveQuestionSnapshot(): Promise<QuestionSnapshot | null> {
  const local = extractQuestionSnapshot(document, location.href);
  if (local) return local;
  if (window !== window.top) return currentSnapshot;
  const snapshot = await requestQuestionSnapshotFromFrame(900);
  return snapshot ?? null;
}

async function buildChatRequest(
  snapshot: QuestionSnapshot | null,
  userMessage: string,
  includeContext: boolean
): Promise<{ input: ResponseInputItem[]; instructions: string }> {
  const input: ResponseInputItem[] = [];
  if (includeContext) {
    input.push(await buildContextInput(snapshot));
  }
  input.push({
    role: "user",
    content: [{ type: "input_text", text: userMessage }],
  });
  return { input, instructions: buildChatInstructions() };
}

function buildChatInstructions(): string {
  const levelKey = settings.explanationLevel ?? "med-junior";
  const levelLabel = EXPLANATION_LEVEL_LABELS[levelKey] ?? levelKey;
  const prompt = settings.explanationPrompts?.[levelKey] ?? "";
  const commonPrompt = settings.commonPrompt?.trim() ?? "";
  return [
    "あなたはQB問題集の学習支援アシスタントです。",
    "与えられた問題文・選択肢・添付画像に基づいて、日本語で簡潔に答えてください。",
    "情報が不足している場合は、その旨を伝えてください。",
    commonPrompt,
    `解説レベル: ${levelLabel}`,
    prompt,
  ].join("\n");
}

async function buildContextInput(
  snapshot: QuestionSnapshot | null
): Promise<ResponseInputItem> {
  const resolvedImages = await loadSnapshotImages(snapshot);
  const content: Array<ResponseInputText | ResponseInputImage> = [];
  content.push({
    type: "input_text",
    text: buildQuestionContext(snapshot, resolvedImages.length),
  });
  for (const imageUrl of resolvedImages) {
    content.push({ type: "input_image", image_url: imageUrl });
  }
  return { role: "user", content };
}

function buildQuestionContext(
  snapshot: QuestionSnapshot | null,
  imageCountOverride?: number
): string {
  if (!snapshot) return "問題情報: 取得できませんでした。";
  const lines: string[] = ["問題情報:"];
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

async function loadSnapshotImages(snapshot: QuestionSnapshot | null): Promise<string[]> {
  const images = snapshot?.imageUrls ?? [];
  const results: string[] = [];
  for (const imageUrl of images) {
    const dataUrl = await loadImageAsDataUrl(imageUrl);
    if (dataUrl) results.push(dataUrl);
  }
  return results;
}

async function loadImageAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, { credentials: "include" });
    if (!response.ok) {
      console.warn("[QB_SUPPORT][chat-image]", {
        event: "fetch-failed",
        url: imageUrl,
        status: response.status,
      });
      return null;
    }
    const blob = await response.blob();
    const maxBytes = 4 * 1024 * 1024;
    if (blob.size > maxBytes) {
      console.warn("[QB_SUPPORT][chat-image]", {
        event: "too-large",
        url: imageUrl,
        bytes: blob.size,
      });
      return null;
    }
    return await blobToDataUrl(blob);
  } catch (error) {
    console.warn("[QB_SUPPORT][chat-image]", {
      event: "fetch-error",
      url: imageUrl,
      error: String(error),
    });
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

function updateSnapshot(snapshot: QuestionSnapshot) {
  const prevId = currentSnapshot?.id ?? null;
  currentSnapshot = snapshot;
  if (prevId && snapshot.id && prevId !== snapshot.id) {
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
      requestId: activeChatRequestId,
    });
  }
  activeChatPort = null;
  activeChatRequestId = null;
  chatRequestPending = false;
}

async function requestChatResponseStream(
  request: {
    requestId: string;
    input: ResponseInputItem[];
    instructions: string;
    previousResponseId: string | null;
  },
  auth: ChatAuth,
  onDelta: (delta: string) => void
): Promise<{ text: string; responseId: string | null; usage: ResponseUsage | null }> {
  if (!webext.runtime?.connect) {
    throw new Error("background接続が利用できません");
  }

  const port = webext.runtime.connect({ name: "qb-chat" });
  activeChatPort = port;
  console.debug("[QB_SUPPORT][chat-stream]", {
    event: "connect",
    requestId: request.requestId,
  });

  return new Promise((resolve, reject) => {
    let text = "";
    let responseId: string | null = null;
    let usage: ResponseUsage | null = null;
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

    const finish = (error?: Error | null) => {
      if (finished) return;
      finished = true;
      if (error) {
        console.warn("[QB_SUPPORT][chat-stream]", {
          event: "finish",
          requestId: request.requestId,
          error: error.message,
        });
      } else {
        console.debug("[QB_SUPPORT][chat-stream]", {
          event: "finish",
          requestId: request.requestId,
          responseId,
          length: text.length,
        });
      }
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve({ text, responseId, usage });
    };

    const onMessage = (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const payload = message as {
        type?: string;
        requestId?: string;
        delta?: string;
        error?: string;
        responseId?: string | null;
        usage?: ResponseUsage | null;
      };
      if (payload.requestId !== request.requestId || !payload.type) return;
      console.debug("[QB_SUPPORT][chat-stream]", {
        event: "message",
        type: payload.type,
        requestId: payload.requestId,
      });
      if (payload.type === "QB_CHAT_STREAM_DELTA") {
        const delta = typeof payload.delta === "string" ? payload.delta : "";
        if (!delta) return;
        text += delta;
        onDelta(delta);
        return;
      }
      if (payload.type === "QB_CHAT_STREAM_DONE") {
        responseId =
          typeof payload.responseId === "string" || payload.responseId === null
            ? payload.responseId
            : responseId;
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
        lastError,
      });
      finish(
        new Error(
          lastError ? `backgroundとの接続が切れました: ${lastError}` : "backgroundとの接続が切れました"
        )
      );
    };

    const timeoutId = window.setTimeout(() => {
      finish(new Error("応答がタイムアウトしました"));
    }, 120000);

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
        previousResponseId: request.previousResponseId ?? null,
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
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
    const prompt = settings.explanationPrompts?.[key as keyof typeof settings.explanationPrompts];
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
  const images = container.querySelectorAll<HTMLImageElement>("img");
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
      const key = normalizeKey(event.key);
      const navPrevMatch = isShortcutMatch(event, settings.navPrevKey);
      const navNextMatch = isShortcutMatch(event, settings.navNextKey);
      const isNavKey = navPrevMatch || navNextMatch;
      const navShortcut = navPrevMatch
        ? settings.navPrevKey
        : navNextMatch
          ? settings.navNextKey
          : "";
      const navBaseKey = navShortcut ? getShortcutBaseKey(navShortcut) : "";
      const optionIndex = settings.optionKeys.findIndex((shortcut) =>
        isShortcutMatch(event, shortcut)
      );
      const isOptionKey = optionIndex >= 0;
      const optionBaseKey =
        isOptionKey && settings.optionKeys[optionIndex]
          ? getShortcutBaseKey(settings.optionKeys[optionIndex])
          : "";
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
      if (
        isShortcutMatch(event, "Ctrl+S") &&
        window === window.top
      ) {
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
            reason: "no-question-container",
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
            target: describeElement(event.target),
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
            frame: window === window.top ? "top" : "iframe",
          });
        }
        return;
      }

      if (isNavKey && navBaseKey) {
      if (window === window.top) {
        sendAction({
          action: "nav",
          key: navBaseKey.toLowerCase(),
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
          frame: window === window.top ? "top" : "iframe",
        });
      }
      if (debug) {
        console.debug("[QB_SUPPORT][nav]", {
          key: navBaseKey,
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
            key: navBaseKey,
            beforeUrl,
            afterUrl: location.href,
            changed: location.href !== beforeUrl,
            frame: window === window.top ? "top" : "iframe",
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
          key: optionBaseKey,
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
          key: optionBaseKey,
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
            key: optionBaseKey,
            before: beforeState,
            after: afterState,
            changed: !isSameOptionState(beforeState, afterState),
            frame: window === window.top ? "top" : "iframe",
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
              key: getShortcutBaseKey(settings.revealKey).toLowerCase(),
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
              key: getShortcutBaseKey(settings.revealKey),
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

function consumeShortcutEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
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

function getTemplateShortcutKeys(): string[] {
  const keys: string[] = [];
  for (const template of getEnabledChatTemplates()) {
    const normalized = normalizeShortcut(template.shortcut);
    if (!normalized) continue;
    const parts = normalized.split("+");
    const key = parts[parts.length - 1];
    if (key) keys.push(key);
  }
  return keys;
}

function getShortcutBaseKey(shortcut: string): string {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return "";
  const parts = normalized.split("+");
  return parts[parts.length - 1] ?? "";
}

function isTargetKey(rawKey: string): boolean {
  const key = normalizeKey(rawKey);
  const optionKeys = settings.optionKeys
    .map((shortcut) => getShortcutBaseKey(shortcut))
    .filter(Boolean);
  return (
    key === getShortcutBaseKey(settings.navPrevKey) ||
    key === getShortcutBaseKey(settings.navNextKey) ||
    key === getShortcutBaseKey(settings.revealKey) ||
    key === getShortcutBaseKey(CHAT_TOGGLE_SHORTCUT) ||
    getTemplateShortcutKeys().includes(key) ||
    optionKeys.includes(key)
  );
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function getChatTemplateShortcut(event: KeyboardEvent) {
  for (const template of getEnabledChatTemplates()) {
    if (!template.shortcut) continue;
    if (isShortcutMatch(event, template.shortcut)) return template;
  }
  return null;
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
