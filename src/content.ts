import {
  extractQuestionInfo,
  extractQuestionSnapshot,
  getAnswerRevealButton,
  getClickableOptionElement,
  getNavigationTarget,
  getOptionElements,
  getSubmitButton,
  isQuestionDocument,
} from "./core/qbDom";
import {
  defaultSettings,
  CHAT_MODEL_OPTIONS,
  DEFAULT_OPTION_KEYS,
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
import {
  buildReflectionRecord,
  getReflectionImageStorageKey,
  getReflectionQuestionId,
  pruneReflectionStore,
  QB_REFLECTION_PDF_ID,
  QB_REFLECTION_STORAGE_KEY,
} from "./core/reflection";
import { copyText, readCopyQuestion } from "./core/qbCopy";
import {
  detectMoshiLegacyContamination,
  extractMoshiReflectionData,
  getLegacyMoshiReflectionImagePrefix,
  getMoshiReflectionPlacement,
  isMoshiHost as isMoshiUrl,
  isMoshiReviewPage,
} from "./core/moshiDom";
import type {
  QBReflectionImageRecord,
  QBReflectionImageStore,
  QBReflectionRecord,
  QBReflectionStore,
} from "./core/reflection";
type AuthProfile = {
  uid: string;
  email: string;
  source: "firebase" | "google";
};
type AuthSessionStart = {
  authUrl: string;
  state: string;
  expiresAt?: number;
};
type AuthSessionResult = {
  token: string;
  profile: AuthProfile;
  expiresAt?: number;
};
type StoredAuthSession = {
  token: string;
  profile: AuthProfile;
  expiresAt: number;
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
// Temporarily disable QB Chat while keeping the implementation available for restoration.
const CHAT_ENABLED = false;
const ROOT_ID = "qb-support-root";
const MARKER_ID = "qb-support-marker";
const REFLECTION_CONTAINER_ID = "qb-support-reflection";
const REFLECTION_LIGHTBOX_ID = "qb-support-reflection-lightbox";
const REFLECTION_SAVE_DEBOUNCE_MS = 500;
const REFLECTION_IMAGE_MAX_BYTES = 12_000_000;
const VERIFIED_MOSHI_LEGACY_RECORDS: Record<
  string,
  { ownerQuestionId: string; reflectionFragments: string[] }
> = {
  "moshi:kokushi-mm1:14": {
    ownerQuestionId: "moshi:kokushi-mm1:A-14",
    reflectionFragments: [
      "偽膜性腸炎は抗菌薬を経口投与以外でも生じうる",
    ],
  },
};
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
const BACKEND_DEFAULT_MODEL = "gpt-5-mini";
const BACKEND_ALLOWED_MODELS = ["gpt-5-mini", "gpt-4.1"];
const DEFAULT_BACKEND_URL = "https://ipad-qb-support-400313981210.asia-northeast1.run.app";
const USAGE_META_EMAIL = "ymgtsny7@gmail.com";
const AUTH_STORAGE_KEY = "qb_support_auth_session_v1";
const AUTH_SESSION_TIMEOUT_MS = 120000;
const AUTH_SESSION_POLL_INTERVAL_MS = 1000;
const AUTH_SESSION_FALLBACK_MS = 6 * 60 * 60 * 1000;
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

type ReflectionPanelElement = HTMLDivElement & {
  __qbSupportReflectionFlushNow?: () => Promise<void>;
};

type ReflectionLightboxElement = HTMLDivElement & {
  __qbSupportReflectionClose?: () => void;
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
let lastHintDraftSource: HTMLTextAreaElement | HTMLInputElement | null = null;
let chatSendButton: HTMLButtonElement | null = null;
let chatStatusField: HTMLElement | null = null;
let chatInputWrap: HTMLDivElement | null = null;
let chatApiInput: HTMLInputElement | null = null;
let chatApiKeyToggle: HTMLInputElement | null = null;
let chatApiKeyVisibilityButton: HTMLButtonElement | null = null;
let chatApiKeyStatus: HTMLElement | null = null;
let chatModelInput: HTMLSelectElement | null = null;
let chatHeaderModelSelect: HTMLSelectElement | null = null;
let chatSettingsPanel: HTMLDivElement | null = null;
let chatSettingsButton: HTMLButtonElement | null = null;
let chatSettingsOpen = false;
let chatApiKeyVisible = false;
let chatAuthPromptActive = false;
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
let chatAutoScrollEnabled = true;
let chatScrollProgrammatic = false;
let chatLastScrollTop = 0;
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
let themeToggle: HTMLInputElement | null = null;
let navPrevInput: HTMLInputElement | null = null;
let navNextInput: HTMLInputElement | null = null;
let revealInput: HTMLInputElement | null = null;
let copyInput: HTMLInputElement | null = null;
let copyButton: HTMLButtonElement | null = null;
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
let themeQuery: MediaQueryList | null = null;
let contentThemeRepairFrame: number | null = null;
let reflectionRenderQuestionId: string | null = null;
let reflectionSaveChain: Promise<void> = Promise.resolve();

const start = () => {
  logInjectionOnce();
  ensureMarker();
  logFramesOnce();
  attachMessageHandlers();
  removeHeaderGearButton();
  if (isMoshiHost()) {
    if (window === window.top && isMoshiReviewPage(location.href)) {
      initMoshi().catch((error) => console.warn("[QB_SUPPORT] moshi init failed", error));
    }
    return;
  }
  if (isQbHost()) {
    init().catch((error) => console.warn("[QB_SUPPORT] init failed", error));
    return;
  }
  if (isInputHost()) {
    initFrame().catch((error) => console.warn("[QB_SUPPORT] frame init failed", error));
  }
};

async function initMoshi() {
  document.documentElement.dataset.qbSite = "moshi";
  await loadSettings();
  ensureThemeListener();
  applyTheme();
  toggleMarker(settings.debugEnabled);
  refreshQuestionInfo();
  startObservers();
  attachMoshiShortcutHandlers();
}

function attachMoshiShortcutHandlers() {
  window.addEventListener(
    "keydown",
    (event) => {
      if (!settings.shortcutsEnabled) return;
      const isTyping =
        isTypingTarget(event.target) || isTypingTarget(document.activeElement);
      if (isTyping || event.isComposing) return;

      const eventBaseKey = getEventBaseKey(event);
      const navPrevMatch =
        isShortcutMatch(event, settings.navPrevKey) ||
        isShortcutMatch(event, defaultSettings.navPrevKey);
      const navNextMatch =
        isShortcutMatch(event, settings.navNextKey) ||
        isShortcutMatch(event, defaultSettings.navNextKey);
      const optionIndex = settings.optionKeys.findIndex(
        (shortcut) =>
          isShortcutMatch(event, shortcut) ||
          isPlainShortcutMatch(event, shortcut, eventBaseKey)
      );
      const revealMatch =
        isShortcutMatch(event, settings.revealKey) ||
        isPlainShortcutMatch(event, settings.revealKey, eventBaseKey) ||
        isShortcutMatch(event, defaultSettings.revealKey) ||
        isPlainShortcutMatch(event, defaultSettings.revealKey, eventBaseKey);

      let action: "option" | "prev" | "next" | "reveal" | null = null;
      let target: HTMLElement | null = null;
      if (optionIndex >= 0) {
        action = "option";
        target = getMoshiOptionTargets()[optionIndex] ?? null;
      } else if (navPrevMatch) {
        action = "prev";
        target = getMoshiControl("prev");
      } else if (navNextMatch) {
        action = "next";
        target = getMoshiControl("next");
      } else if (revealMatch) {
        action = "reveal";
        target = getMoshiControl("reveal");
      }
      if (!action) return;

      consumeShortcutEvent(event);
      console.log("[QB_SUPPORT][moshi-shortcut]", {
        action,
        key: eventBaseKey,
        optionIndex: optionIndex >= 0 ? optionIndex : null,
        target: describeElement(target),
        url: location.href,
      });
      if (target) {
        clickWithFallback(target, { tag: `moshi-${action}`, logAlways: true });
      }
    },
    { capture: true }
  );
}

function getMoshiOptionTargets(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "#vue-container .choiceAns .choice-table .choice-cell"
    )
  ).filter(isMoshiShortcutTargetAvailable);
}

function getMoshiControl(
  action: "prev" | "next" | "reveal"
): HTMLElement | null {
  const selector =
    action === "prev"
      ? "#vue-container .btn-group .btn-prev:not(.hidden) a"
      : action === "next"
        ? "#vue-container .btn-group .btn-next:not(.hidden) a"
        : "#vue-container .btn-group a, #vue-container .btn-group button";
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(selector)
  ).filter(isMoshiShortcutTargetAvailable);
  if (action !== "reveal") return candidates[0] ?? null;
  const revealLabels = [
    "解答を確認する",
    "解答を確認",
    "解答する",
    "解説を見る",
    "リトライ",
  ];
  return (
    candidates.find((element) => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      return revealLabels.some((label) => text.includes(label));
    }) ?? null
  );
}

function isMoshiShortcutTargetAvailable(element: HTMLElement): boolean {
  if (element.closest(".hidden")) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if ("disabled" in element && (element as HTMLButtonElement).disabled) return false;
  return window.getComputedStyle(element).visibility !== "hidden";
}

async function init() {
  await loadSettings();
  ensureUI();
  if (CHAT_ENABLED) {
    ensureChatUI();
    initAuth();
  } else {
    removeDisabledChatUI();
  }
  ensureThemeListener();
  applySettings();
  refreshQuestionInfo();
  startObservers();
  attachEventHandlers();
  if (CHAT_ENABLED) attachChatHandlers();
}

function removeDisabledChatUI() {
  document.getElementById(CHAT_ROOT_ID)?.remove();
  document.getElementById(CHAT_TOGGLE_ID)?.remove();
  document.getElementById(CHAT_TEMPLATE_ID)?.remove();
  document.body?.classList.remove(CHAT_DOCK_CLASS);
  document.body?.style.removeProperty("--qb-support-chat-dock-width");
  delete document.documentElement.dataset.qbChatLayout;
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

async function loadStoredAuthSession(): Promise<StoredAuthSession | null> {
  const area = getStorageArea(false);
  if (!area) return null;
  try {
    const stored = await storageGet(area, AUTH_STORAGE_KEY);
    const raw = stored?.[AUTH_STORAGE_KEY];
    if (!raw || typeof raw !== "object") return null;
    const token = typeof (raw as { token?: unknown }).token === "string" ? raw.token : "";
    const profile = (raw as { profile?: AuthProfile }).profile;
    const expiresAt =
      typeof (raw as { expiresAt?: unknown }).expiresAt === "number"
        ? raw.expiresAt
        : 0;
    if (!token || !profile?.uid || !profile.email || !expiresAt) return null;
    return {
      token,
      profile: {
        uid: profile.uid,
        email: profile.email,
        source: profile.source === "firebase" ? "firebase" : "google",
      },
      expiresAt,
    };
  } catch (error) {
    console.warn("[QB_SUPPORT][auth-session] load failed", error);
    return null;
  }
}

async function saveStoredAuthSession(session: StoredAuthSession): Promise<void> {
  const area = getStorageArea(false);
  if (!area) return;
  try {
    await storageSet(area, { [AUTH_STORAGE_KEY]: session });
  } catch (error) {
    console.warn("[QB_SUPPORT][auth-session] save failed", error);
  }
}

async function clearStoredAuthSession(): Promise<void> {
  const area = getStorageArea(false);
  if (!area) return;
  try {
    await storageSet(area, { [AUTH_STORAGE_KEY]: null });
  } catch (error) {
    console.warn("[QB_SUPPORT][auth-session] clear failed", error);
  }
}

function waitAuth(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchBackendAuthStart(): Promise<AuthSessionStart> {
  const url = resolveBackendAuthStartUrl();
  if (!url) throw new Error("バックエンドURLが未設定です。管理者に連絡してください");
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`認証開始に失敗しました: ${response.status} ${detail}`);
  }
  const data = (await response.json()) as AuthSessionStart;
  if (!data?.authUrl || !data?.state) {
    throw new Error("認証開始のレスポンスが不正です。");
  }
  return data;
}

async function pollBackendAuthSession(state: string): Promise<AuthSessionResult> {
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
    const data = (await response.json()) as AuthSessionResult;
    if (!data?.token || !data?.profile?.uid) {
      throw new Error("認証セッションの内容が不正です。");
    }
    return data;
  }
  throw new Error("ログインが完了しませんでした。もう一度お試しください。");
}

async function requestBackendAuthSession(): Promise<StoredAuthSession> {
  const start = await fetchBackendAuthStart();
  const popup = window.open(start.authUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    console.warn("[QB_SUPPORT][auth-ui] popup blocked", { authUrl: start.authUrl });
    setAuthStatus(
      "ポップアップがブロックされました。ログインURLを新規タブで開いてください。",
      true
    );
    console.log("[QB_SUPPORT][auth-ui] login url", start.authUrl);
  } else {
    setAuthStatus("ブラウザでログインを完了してください", false);
  }
  const session = await pollBackendAuthSession(start.state);
  const expiresAt =
    typeof session.expiresAt === "number"
      ? session.expiresAt
      : Date.now() + AUTH_SESSION_FALLBACK_MS;
  return { token: session.token, profile: session.profile, expiresAt };
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

function applyAuthSession(session: StoredAuthSession) {
  authAccessToken = session.token;
  authProfile = session.profile;
  updateAuthUI();
  applyChatSettings();
}

async function restoreAuthSession(): Promise<StoredAuthSession | null> {
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
      expiresAt: stored.expiresAt,
    };
  } catch (error) {
    await clearStoredAuthSession();
    return null;
  }
}

async function ensureAuthAccessToken(interactive: boolean): Promise<string> {
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

async function refreshAuthState(interactive: boolean) {
  try {
    const session = interactive
      ? await requestBackendAuthSession()
      : await restoreAuthSession();
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
    panel = root.querySelector(".qb-support-panel") as HTMLDivElement | null;
    const existingLauncher = root.querySelector(".qb-support-launcher");
    if (existingLauncher) {
      existingLauncher.remove();
    }
    launcher = null;
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

  const searchSwitch = createSwitch("検索バー表示", settings.searchVisible, (checked) => {
    void saveSettings({
      ...settings,
      searchVisible: checked,
    });
  });
  searchToggle = searchSwitch.input;
  const searchLabel = searchSwitch.label;

  const noteSwitch = createSwitch("ノート表示", settings.noteVisible, (checked) => {
    void saveSettings({
      ...settings,
      noteVisible: checked,
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
      pageAccentEnabled: pageAccentToggle?.checked ?? false,
    });
  });

  const pageAccentLabel = document.createElement("label");
  pageAccentLabel.className = "qb-support-toggle";
  pageAccentLabel.appendChild(pageAccentToggle);
  pageAccentLabel.appendChild(makeSpan("ページに緑アクセント"));

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark =
    settings.themePreference === "dark" ||
    (settings.themePreference === "system" && prefersDark);
  const themeSwitch = createSwitch("ダークモード", isDark, (checked) => {
    const nextTheme = checked ? "dark" : "light";
    void saveSettings({
      ...settings,
      themePreference: nextTheme,
    });
  });
  themeToggle = themeSwitch.input;
  const themeLabel = themeSwitch.label;

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
  const copyField = buildShortcutField("問題と解説をコピー", "例: Y");

  navPrevInput = navPrevField.input;
  navNextInput = navNextField.input;
  revealInput = revealField.input;
  copyInput = copyField.input;

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "qb-support-options";
  optionInputs = [];
  DEFAULT_OPTION_KEYS.forEach((label) => {
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
  shortcutSection.appendChild(copyField.label);
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
      label,
    })),
    "qb-support-explanation-level"
  );

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

  root.appendChild(panel);
  document.body.appendChild(root);
}

function ensureChatUI() {
  if (!CHAT_ENABLED) return;
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
    const headerModelNode = chatRoot.querySelector(".qb-support-chat-model-inline");
    chatHeaderModelSelect =
      headerModelNode instanceof HTMLSelectElement ? headerModelNode : null;
    const headerNode = chatRoot.querySelector(".qb-support-chat-header");
    if (headerNode instanceof HTMLDivElement) {
      let titleWrap = headerNode.querySelector(".qb-support-chat-title-wrap");
      if (!(titleWrap instanceof HTMLDivElement)) {
        const legacyTitle = headerNode.querySelector(".qb-support-chat-title");
        const wrap = document.createElement("div");
        wrap.className = "qb-support-chat-title-wrap";
        if (legacyTitle) {
          wrap.appendChild(legacyTitle);
        }
        headerNode.insertBefore(wrap, headerNode.firstChild);
        titleWrap = wrap;
      }
      if (titleWrap instanceof HTMLDivElement && !chatHeaderModelSelect) {
        chatHeaderModelSelect = createOverlaySelect(
          CHAT_MODEL_OPTIONS.map((model) => ({ value: model, label: model })),
          "qb-support-chat-model-inline"
        );
        chatHeaderModelSelect.value = settings.chatModel;
        chatHeaderModelSelect.setAttribute("aria-label", "モデル選択");
        titleWrap.appendChild(chatHeaderModelSelect);
      }
    }
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
    const apiSaveButton = chatRoot.querySelector(".qb-support-chat-api-save");
    if (apiSaveButton instanceof HTMLButtonElement) {
      apiSaveButton.remove();
    }
    const modelSaveButton = chatRoot.querySelector(".qb-support-chat-model-save");
    if (modelSaveButton instanceof HTMLButtonElement) {
      modelSaveButton.remove();
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
      if (chatApiKeyStatus && !apiSection.contains(chatApiKeyStatus)) {
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
    if (!chatModelInput) {
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
    ensureChatScrollHandler();
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

  header.appendChild(titleWrap);
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
  ensureChatScrollHandler();
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

  const backendMode = isBackendMode();
  const modelOptions = getChatModelOptions(backendMode);
  const resolvedModel = backendMode
    ? resolveBackendModel(settings.chatModel)
    : settings.chatModel;

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
  scheduleContentThemeRepair();
}

const CONTENT_CONTRAST_ROOT_SELECTOR = [
  ".html_renderer",
  ".resultcontent",
  ".resultContent",
  ".result-content",
  "#resultcontent",
  "#answerSection",
].join(",");
const PROTECTED_EXAM_IMAGE_SELECTOR =
  'img[src*="/exam_images_kokushi/"]';

type RgbColor = { r: number; g: number; b: number; a: number };

function parseComputedRgb(value: string): RgbColor | null {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i
  );
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function compositeCssColor(foreground: RgbColor, background: RgbColor): RgbColor {
  const alpha = Math.max(0, Math.min(1, foreground.a));
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1,
  };
}

function getEffectiveElementBackground(element: HTMLElement): RgbColor {
  const layers: RgbColor[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) {
    const color = parseComputedRgb(getComputedStyle(current).backgroundColor);
    if (color && color.a > 0.01) layers.push(color);
    if (color?.a && color.a >= 0.995) break;
  }
  let result: RgbColor = { r: 255, g: 255, b: 255, a: 1 };
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    result = compositeCssColor(layers[index], result);
  }
  return result;
}

function relativeLuminance(color: RgbColor): number {
  const channels = [color.r, color.g, color.b].map((value) => {
    const normalized = Math.max(0, Math.min(255, value)) / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function isProtectedContentImageSurface(element: HTMLElement): boolean {
  if (element.matches(PROTECTED_EXAM_IMAGE_SELECTOR)) return true;
  const figure = element.closest("figure");
  if (figure?.querySelector(PROTECTED_EXAM_IMAGE_SELECTOR)) return true;
  const paragraph = element.closest("p");
  return Boolean(
    paragraph &&
      Array.from(paragraph.children).some(
        (child) =>
          child.tagName === "FIGURE" &&
          Boolean(child.querySelector(PROTECTED_EXAM_IMAGE_SELECTOR))
      )
  );
}

function normalizeDarkContentSurfaces() {
  const roots = Array.from(document.querySelectorAll<HTMLElement>(CONTENT_CONTRAST_ROOT_SELECTOR));
  const elements = new Set<HTMLElement>();
  roots.forEach((root) => {
    elements.add(root);
    root.querySelectorAll<HTMLElement>("*").forEach((element) => elements.add(element));
  });
  elements.forEach((element) => {
    element.removeAttribute("data-qb-support-dark-surface");
    element.removeAttribute("data-qb-support-dark-content");
  });
  if (resolveTheme() !== "dark") return;
  let surfaces = 0;
  elements.forEach((element) => {
    if (element.closest("[id^='qb-support-'], [class*='qb-support-']")) return;
    if (isProtectedContentImageSurface(element)) return;
    const computed = getComputedStyle(element);
    if (computed.visibility === "hidden" || computed.display === "none" || Number(computed.opacity) < 0.2) return;
    const ownBackground = parseComputedRgb(computed.backgroundColor);
    if (!ownBackground || ownBackground.a < 0.05) return;
    const background = getEffectiveElementBackground(element);
    const channels = [background.r, background.g, background.b];
    const neutralSpread = Math.max(...channels) - Math.min(...channels);
    if (neutralSpread > 48 || relativeLuminance(background) < 0.45) return;
    element.setAttribute("data-qb-support-dark-surface", "");
    surfaces += 1;
  });
  elements.forEach((element) => {
    if (!element.closest("[data-qb-support-dark-surface]")) return;
    const hasDirectText = Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())
    );
    if (!hasDirectText) return;
    element.setAttribute("data-qb-support-dark-content", "");
  });
  if (surfaces && settings.debugEnabled) {
    console.debug("[QB_SUPPORT][theme] normalized light explanation surfaces", { surfaces });
  }
}

function scheduleContentThemeRepair() {
  if (contentThemeRepairFrame !== null) return;
  contentThemeRepairFrame = window.requestAnimationFrame(() => {
    contentThemeRepairFrame = null;
    normalizeDarkContentSurfaces();
  });
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

const HINT_PHRASE = "絶妙なヒント";

function isHintTemplateSetting(template: ChatTemplateSetting): boolean {
  const label = template.label ?? "";
  const prompt = template.prompt ?? "";
  return label.includes("ヒント") || label.includes(HINT_PHRASE) || prompt.includes(HINT_PHRASE);
}

function getHintTemplate(): { template: ChatTemplateSetting; index: number } | null {
  for (const entry of getEnabledChatTemplatesWithIndex()) {
    if (isHintTemplateSetting(entry.template)) {
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

function appendHintDraft(message: string, draft: string): string {
  const base = message.trim();
  if (!draft) return base;
  if (base.includes("今の考察は以下です")) return base;
  return `${base}今の考察は以下です."${draft}"`;
}

function buildHintQuickMessage(draft: string): string {
  const base =
    "絶妙なヒント（答えありきでなく、所見や症状から推論する視点で思考力を養う答えに迫りすぎないもの）をどうぞ。";
  return appendHintDraft(base, draft);
}

function isEligibleHintDraftSource(
  target: EventTarget | null
): target is HTMLInputElement | HTMLTextAreaElement {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  if (target instanceof HTMLInputElement) {
    const type = (target.type || "text").toLowerCase();
    if (
      type === "password" ||
      type === "hidden" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "button" ||
      type === "submit" ||
      type === "file"
    ) {
      return false;
    }
  }
  if (target.classList.contains("qb-support-chat-api-key")) return false;
  return true;
}

function resolveHintDraft(): string {
  const chatDraft = chatInput?.value?.trim() ?? "";
  if (chatDraft) return chatDraft;
  const chatTextarea = document.querySelector(
    ".qb-support-chat-textarea"
  ) as HTMLTextAreaElement | null;
  const fallbackDraft = chatTextarea?.value?.trim() ?? "";
  if (fallbackDraft) return fallbackDraft;
  if (lastHintDraftSource && document.contains(lastHintDraftSource)) {
    const value = lastHintDraftSource.value?.trim() ?? "";
    if (value) return value;
  }
  return "";
}

function updateHintQuickButton() {
  if (!CHAT_ENABLED) {
    hintQuickButton?.remove();
    hintQuickButton = null;
    return;
  }
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
  const templateBar = chatTemplateBar;
  const templates = getEnabledChatTemplatesWithIndex();
  templateBar.innerHTML = "";
  if (templates.length === 0) {
    templateBar.style.display = "none";
    updateHintQuickButton();
    return;
  }
  templateBar.style.display = "flex";
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
    templateBar.appendChild(button);
  });
  updateHintQuickButton();
}

function createChatModelSelect(): HTMLSelectElement {
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
  const bind = (select: HTMLSelectElement | null) => {
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

function toggleChatSettings(force?: boolean) {
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

  const applyUpdate = <K extends keyof Settings>(key: K, value: Settings[K]) => {
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
    applyUpdate("explanationLevel", nextLevel as Settings["explanationLevel"]);
  }

  const nextPrompts = {
    highschool: explanationPromptInputs.highschool?.value.trim() ?? "",
    "med-junior": explanationPromptInputs["med-junior"]?.value.trim() ?? "",
    "med-senior": explanationPromptInputs["med-senior"]?.value.trim() ?? "",
  };
  const currentPrompts = settings.explanationPrompts ?? {
    highschool: "",
    "med-junior": "",
    "med-senior": "",
  };
  const promptsChanged =
    nextPrompts.highschool !== (currentPrompts.highschool ?? "") ||
    nextPrompts["med-junior"] !== (currentPrompts["med-junior"] ?? "") ||
    nextPrompts["med-senior"] !== (currentPrompts["med-senior"] ?? "");
  if (promptsChanged) {
    applyUpdate("explanationPrompts", nextPrompts);
  }

  if (navPrevInput && navNextInput && revealInput && optionInputs.length) {
    const optionKeys = optionInputs
      .map((input) => normalizeShortcut(input.value))
      .filter(Boolean);
    const navPrevKey = normalizeShortcut(navPrevInput.value ?? "");
    const navNextKey = normalizeShortcut(navNextInput.value ?? "");
    const revealKey = normalizeShortcut(revealInput.value ?? "");
    if (navPrevKey && navNextKey && revealKey && optionKeys.length) {
      applyUpdate("navPrevKey", navPrevKey);
      applyUpdate("navNextKey", navNextKey);
      applyUpdate("revealKey", revealKey);
      applyUpdate("copyKey", normalizeShortcut(copyInput?.value ?? "") || defaultSettings.copyKey);
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
        prompt,
      };
    });
    const hasInvalidTemplate = nextTemplates.some(
      (template) => template.enabled && !template.prompt
    );
    if (hasInvalidTemplate) {
      setStatus("有効なテンプレはプロンプト必須です", true);
    } else if (
      JSON.stringify(nextTemplates) !== JSON.stringify(settings.chatTemplates ?? [])
    ) {
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

function isValidApiKey(raw: string): boolean {
  return raw.startsWith("sk-pro");
}

function resolveBackendAuthStartUrl(): string | null {
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

function resolveBackendAuthSessionUrl(state: string): string | null {
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

function isBackendMode(): boolean {
  const apiKey = settings.chatApiKey?.trim() ?? "";
  if (apiKey && settings.chatApiKeyEnabled && isValidApiKey(apiKey)) return false;
  if (!authProfile) return false;
  return Boolean(resolveBackendBaseUrl());
}

function resolveBackendModel(model?: string | null): string {
  const trimmed = typeof model === "string" ? model.trim() : "";
  return BACKEND_ALLOWED_MODELS.includes(trimmed) ? trimmed : BACKEND_DEFAULT_MODEL;
}

function getChatModelOptions(backendMode: boolean): string[] {
  return backendMode ? BACKEND_ALLOWED_MODELS : CHAT_MODEL_OPTIONS;
}

function updateModelSelectOptions(
  select: HTMLSelectElement | null,
  options: string[],
  selected: string
) {
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

async function resolveChatAuth(): Promise<ChatAuth> {
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

async function resolveChatAuthWithStatus(): Promise<ChatAuth | null> {
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

async function sendTemplateMessage(template: ChatTemplateSetting | string) {
  if (!CHAT_ENABLED) return;
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
  if (typeof template !== "string" && isHintTemplateSetting(template)) {
    return appendHintDraft(message, resolveHintDraft());
  }
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
  if (!CHAT_ENABLED) return;
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
    if (
      isShortcutMatch(event, CHAT_INPUT_TOGGLE_SHORTCUT) &&
      !event.isComposing &&
      !chatComposing
    ) {
      consumeShortcutEvent(event);
      toggleChatInputFocus();
      return;
    }
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
    auth.mode === "backend" ? resolveBackendModel(settings.chatModel) : settings.chatModel;
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
          scrollChatToBottom();
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
  scrollChatToBottom();
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

function ensureChatScrollHandler() {
  if (!chatMessagesEl) return;
  if (chatMessagesEl.dataset.scrollHandlers === "true") return;
  chatMessagesEl.dataset.scrollHandlers = "true";
  chatAutoScrollEnabled = isChatNearBottom();
  chatLastScrollTop = chatMessagesEl.scrollTop;
  chatMessagesEl.addEventListener("scroll", () => {
    const currentTop = chatMessagesEl?.scrollTop ?? 0;
    if (chatScrollProgrammatic) {
      chatScrollProgrammatic = false;
      chatLastScrollTop = currentTop;
      return;
    }
    if (currentTop < chatLastScrollTop) {
      chatAutoScrollEnabled = false;
    } else if (isChatNearBottom()) {
      chatAutoScrollEnabled = true;
    }
    chatLastScrollTop = currentTop;
  });
}

function isChatNearBottom(): boolean {
  if (!chatMessagesEl) return true;
  const threshold = 24;
  const bottom = chatMessagesEl.scrollHeight - chatMessagesEl.clientHeight;
  return bottom - chatMessagesEl.scrollTop <= threshold;
}

function scrollChatToBottom(force = false) {
  if (!chatMessagesEl) return;
  if (!force && !chatAutoScrollEnabled) return;
  chatScrollProgrammatic = true;
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
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
        previousResponseId: request.previousResponseId ?? null,
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function setChatStatus(message: string, isError: boolean) {
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

function isAuthPromptMessage(message: string): boolean {
  return (
    message.includes("ログイン") ||
    message.includes("APIキーを設定") ||
    message.includes("APIキーを有効")
  );
}

function showChatAuthPrompt(message: string) {
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
  if (!root || !panel) return;
  root.dataset.position = settings.position;
  panel.classList.toggle("is-hidden", !settings.enabled);
  if (launcher) {
    launcher.classList.toggle("is-disabled", settings.enabled);
    launcher.classList.toggle("is-hidden", settings.enabled);
    if (settings.shortcut) {
      launcher.dataset.shortcut = settings.shortcut;
    } else {
      launcher.removeAttribute("data-shortcut");
    }
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
  if (copyInput) copyInput.value = settings.copyKey;
  if (themeToggle) {
    const prefersDark = themeQuery?.matches ?? window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark =
      settings.themePreference === "dark" ||
      (settings.themePreference === "system" && prefersDark);
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
    void syncReflectionPanel("refresh");
    syncCopyButton();
  }
  updateHintQuickButton();
  scheduleContentThemeRepair();
}

// One tap or the copy key puts the question (and the explanation once shown) on the clipboard, in the
// same text as UW Support's QB copy. UW Support's dock already shows that button, so skip ours there.
function syncCopyButton() {
  const visible =
    settings.enabled && !document.getElementById("uw-support-chat") && !!readCopyQuestion(document);
  if (!visible) {
    if (copyButton) copyButton.hidden = true;
    return;
  }
  if (!copyButton || !copyButton.isConnected) {
    copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "qb-support-copy-button";
    copyButton.title = "問題と解説をコピー";
    copyButton.setAttribute("aria-label", "問題と解説をコピー");
    copyButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';
    copyButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyCurrentQuestion();
    });
    document.body.appendChild(copyButton);
  }
  copyButton.hidden = false;
}

// Built and written synchronously so Safari keeps the key press or tap as the clipboard's user gesture.
function copyCurrentQuestion() {
  const question = readCopyQuestion(document);
  if (!question) {
    showCopyToast("問題を読み込めません", false);
    return;
  }
  const text = copyText(question);
  const done = (ok: boolean) =>
    showCopyToast(
      ok ? (question.answered ? "問題と解説をコピーしました" : "問題をコピーしました") : "コピーできません",
      ok
    );
  const fallback = () => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "qb-support-copy-buffer";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      // Reported below.
    }
    area.remove();
    done(ok);
  };
  try {
    navigator.clipboard.writeText(text).then(() => done(true), fallback);
  } catch {
    fallback();
  }
}

function showCopyToast(message: string, ok: boolean) {
  document.querySelector(".qb-support-copy-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `qb-support-copy-toast${ok ? "" : " is-error"}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2400);
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
        const reflectionEl = document.getElementById(REFLECTION_CONTAINER_ID);
        if (reflectionEl && reflectionEl.contains(target)) return true;
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

type ReflectionContext = {
  questionId: string;
  legacyQuestionId?: string | null;
  url: string;
  info: QuestionInfo | null;
  snapshot: QuestionSnapshot | null;
};

type ReflectionPlacement = {
  parent: Node;
  before: Node | null;
};

function getReflectionContext(): ReflectionContext | null {
  const moshi = extractMoshiReflectionData(document, location.href);
  if (moshi) {
    return {
      questionId: moshi.questionId,
      legacyQuestionId: moshi.legacyQuestionId,
      url: location.href,
      info: moshi.info,
      snapshot: moshi.snapshot,
    };
  }
  const info = extractQuestionInfo(document, location.href);
  const snapshot = extractQuestionSnapshot(document, location.href);
  const questionId = getReflectionQuestionId(
    location.href,
    info?.id ?? snapshot?.id ?? currentInfo?.id
  );
  if (!questionId) return null;
  return {
    questionId,
    url: location.href,
    info: info ?? currentInfo,
    snapshot: snapshot ?? currentSnapshot,
  };
}

function findPageTextElement(
  matches: (text: string) => boolean
): HTMLElement | null {
  if (!document.body) return null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node.nodeValue ?? "").trim().replace(/\s+/g, " ");
    if (text && matches(text)) {
      const element = node.parentElement;
      if (
        element &&
        !element.closest(
          `#${ROOT_ID}, #${REFLECTION_CONTAINER_ID}, [data-testid^="side-"]`
        ) &&
        !element.closest("script, style, template")
      ) {
        return element;
      }
    }
    node = walker.nextNode();
  }
  return null;
}

function getReflectionPlacement(): ReflectionPlacement | null {
  const moshiPlacement = getMoshiReflectionPlacement(document);
  if (moshiPlacement) return moshiPlacement;

  const legacyExplanation = document.querySelector<HTMLElement>(
    "#resultcontent, .resultcontent, .resultContent, .result-content"
  );
  if (legacyExplanation?.parentNode && (legacyExplanation.textContent ?? "").trim()) {
    return {
      parent: legacyExplanation.parentNode,
      before: legacyExplanation.nextSibling,
    };
  }

  const explanationHeading = findPageTextElement((text) => text === "解説");
  if (!explanationHeading) return null;
  const pageReference = findPageTextElement((text) => text.startsWith("[掲載頁："));
  const footer = pageReference?.closest<HTMLElement>(".pb-32.pt-3");
  if (!footer?.parentNode) return null;
  return { parent: footer.parentNode, before: footer };
}

function normalizeReflectionStore(value: unknown): QBReflectionStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const store: QBReflectionStore = {};
  for (const [key, record] of Object.entries(value)) {
    if (!record || typeof record !== "object") continue;
    const candidate = record as Partial<QBReflectionRecord>;
    if (typeof candidate.questionId !== "string") continue;
    if (typeof candidate.reflection !== "string") continue;
    store[key] = candidate as QBReflectionRecord;
  }
  return store;
}

async function loadReflectionStore(): Promise<QBReflectionStore> {
  const area = webext.storage?.local ?? getStorageArea(false);
  if (!area) return {};
  const stored = await storageGet(area, QB_REFLECTION_STORAGE_KEY);
  return normalizeReflectionStore(stored?.[QB_REFLECTION_STORAGE_KEY]);
}

async function loadReflectionRecord(
  questionId: string
): Promise<QBReflectionRecord | null> {
  const store = await loadReflectionStore();
  return store[questionId] ?? null;
}

async function loadReflectionDataForContext(
  context: ReflectionContext
): Promise<[QBReflectionRecord | null, QBReflectionImageStore]> {
  const [saved, savedImages] = await Promise.all([
    loadReflectionRecord(context.questionId),
    loadReflectionImageStore(context.questionId),
  ]);
  const liveQuestionCode = context.info?.id ?? context.snapshot?.id ?? null;
  const legacyQuestionId = context.legacyQuestionId;
  const verifiedLegacyRecord = legacyQuestionId
    ? VERIFIED_MOSHI_LEGACY_RECORDS[legacyQuestionId]
    : undefined;
  const isVerifiedLegacyOwner = Boolean(
    legacyQuestionId &&
      legacyQuestionId !== context.questionId &&
      verifiedLegacyRecord?.ownerQuestionId === context.questionId
  );
  const canonicalHasContent =
    Boolean(saved?.reflection.trim()) || Object.keys(savedImages).length > 0;
  if (canonicalHasContent) {
    if (legacyQuestionId && !isVerifiedLegacyOwner && saved) {
      const legacyImagePrefix = getLegacyMoshiReflectionImagePrefix(
        legacyQuestionId
      );
      const legacySaved = await loadReflectionRecord(legacyQuestionId);
      const contamination = detectMoshiLegacyContamination({
        reflection: saved.reflection,
        savedImageNames: Object.keys(savedImages),
        legacyReflection: legacySaved?.reflection,
        legacyImagePrefix,
        verifiedReflectionFragments:
          verifiedLegacyRecord?.reflectionFragments,
      });
      if (contamination.shouldSuppress) {
        console.warn(
          "[QB_SUPPORT][reflection] suppressed misassigned legacy moshi data",
          {
            legacyQuestionId,
            questionId: context.questionId,
            questionCode: liveQuestionCode,
            ...contamination,
          }
        );
        return [null, {}];
      }
    }
    return [saved, savedImages];
  }
  return [saved, savedImages];
}

function saveReflectionRecord(
  context: ReflectionContext,
  reflection: string
): Promise<void> {
  const operation = reflectionSaveChain
    .catch(() => undefined)
    .then(async () => {
      const area = webext.storage?.local ?? getStorageArea(false);
      if (!area) throw new Error("storage.local is unavailable");
      const store = await loadReflectionStore();
      const existing = store[context.questionId];
      store[context.questionId] = buildReflectionRecord({
        questionId: context.questionId,
        url: context.url,
        reflection,
        info: context.info,
        snapshot: context.snapshot,
        existing,
      });
      await storageSet(area, {
        [QB_REFLECTION_STORAGE_KEY]: pruneReflectionStore(store),
      });
      console.log("[QB_SUPPORT][reflection] saved", {
        questionId: context.questionId,
        questionCode: context.info?.id ?? context.snapshot?.id ?? null,
        length: reflection.length,
        pdfId: QB_REFLECTION_PDF_ID,
      });
    });
  reflectionSaveChain = operation.catch(() => undefined);
  return operation;
}

function normalizeReflectionImageStore(value: unknown): QBReflectionImageStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const store: QBReflectionImageStore = {};
  for (const [key, record] of Object.entries(value)) {
    if (!record || typeof record !== "object") continue;
    const candidate = record as Partial<QBReflectionImageRecord>;
    if (
      typeof candidate.questionId !== "string" ||
      typeof candidate.imageName !== "string" ||
      typeof candidate.imageDataUrl !== "string" ||
      !candidate.imageDataUrl.startsWith("data:image/png;base64,")
    ) {
      continue;
    }
    store[key] = candidate as QBReflectionImageRecord;
  }
  return store;
}

async function loadReflectionImageStore(
  questionId: string
): Promise<QBReflectionImageStore> {
  const area = webext.storage?.local ?? getStorageArea(false);
  if (!area) return {};
  const storageKey = getReflectionImageStorageKey(questionId);
  const stored = await storageGet(area, storageKey);
  return normalizeReflectionImageStore(stored?.[storageKey]);
}

function getReflectionImageName(marker: string): string {
  const match = String(marker || "").match(
    /!\[\[(QB_[A-Za-z0-9_-]+_reflection_\d+\.png)(?:\|[^\]]*)?\]\]/
  );
  return match?.[1] ?? "";
}

function normalizeReflectionImageMarker(markerOrName: string): string {
  const value = String(markerOrName || "").trim();
  const name =
    getReflectionImageName(value) ||
    value.match(/^QB_[A-Za-z0-9_-]+_reflection_\d+\.png$/)?.[0] ||
    "";
  return name ? `![[${name}]]` : "";
}

function getReflectionImageMap(
  images: QBReflectionImageStore
): Map<string, QBReflectionImageRecord> {
  return new Map(
    Object.values(images).map((image) => [image.imageName, image])
  );
}

function openReflectionImageLightbox(dataUrl: string, filename: string) {
  if (!dataUrl.startsWith("data:image/")) return;
  const current = document.getElementById(
    REFLECTION_LIGHTBOX_ID
  ) as ReflectionLightboxElement | null;
  current?.__qbSupportReflectionClose?.();

  const overlay = document.createElement("div") as ReflectionLightboxElement;
  overlay.id = REFLECTION_LIGHTBOX_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${filename} の拡大表示`);

  const inner = document.createElement("div");
  inner.className = "qb-support-reflection-lightbox-inner";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "qb-support-reflection-lightbox-close";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "画像プレビューを閉じる");

  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = filename;

  const caption = document.createElement("div");
  caption.className = "qb-support-reflection-lightbox-caption";
  caption.textContent = filename;

  const close = () => {
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  overlay.__qbSupportReflectionClose = close;

  overlay.addEventListener("click", close);
  inner.addEventListener("click", (event) => event.stopPropagation());
  closeButton.addEventListener("click", close);
  document.addEventListener("keydown", onKeyDown, true);

  inner.appendChild(closeButton);
  inner.appendChild(image);
  inner.appendChild(caption);
  overlay.appendChild(inner);
  (document.body || document.documentElement).appendChild(overlay);
}

function setReflectionInlineImageSource(
  node: HTMLElement,
  image: Partial<QBReflectionImageRecord>
) {
  const dataUrl = String(image.imageDataUrl || "");
  const filename = String(
    image.imageName || node.dataset.imageName || "reflection-image.png"
  );
  node.dataset.imageName = filename;
  node.title = filename;
  node.textContent = "";

  if (dataUrl.startsWith("data:image/")) {
    const preview = document.createElement("img");
    preview.src = dataUrl;
    preview.alt = filename;
    preview.title = filename;
    preview.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openReflectionImageLightbox(dataUrl, filename);
    });
    node.appendChild(preview);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "qb-support-reflection-inline-image-placeholder";
    placeholder.textContent = filename;
    node.appendChild(placeholder);
  }

  const caption = document.createElement("span");
  caption.className = "qb-support-reflection-inline-image-caption";
  caption.textContent = filename;
  node.appendChild(caption);
}

function createReflectionInlineImageNode(
  marker: string,
  image?: Partial<QBReflectionImageRecord>
): HTMLSpanElement {
  const imageName =
    image?.imageName ||
    getReflectionImageName(marker) ||
    "reflection-image.png";
  const node = document.createElement("span");
  node.className = "qb-support-reflection-inline-image";
  node.contentEditable = "false";
  node.dataset.marker = normalizeReflectionImageMarker(marker || imageName);
  node.dataset.imageName = imageName;
  setReflectionInlineImageSource(node, {
    ...image,
    imageName,
  });
  return node;
}

type ReflectionInlineFormat = {
  open: string;
  close: string;
  tagName: "strong" | "em" | "u" | "s";
};

const REFLECTION_INLINE_FORMATS: ReflectionInlineFormat[] = [
  { open: "<u>", close: "</u>", tagName: "u" },
  { open: "**", close: "**", tagName: "strong" },
  { open: "~~", close: "~~", tagName: "s" },
  { open: "*", close: "*", tagName: "em" },
];

function isReflectionFormatOpening(
  source: string,
  index: number,
  format: ReflectionInlineFormat
): boolean {
  if (format.open === "<u>") return true;
  const next = source[index + format.open.length];
  return Boolean(next && !/\s/.test(next));
}

function isReflectionFormatClosing(
  source: string,
  index: number,
  format: ReflectionInlineFormat
): boolean {
  if (format.close === "</u>") return true;
  const previous = source[index - 1];
  return Boolean(previous && !/\s/.test(previous));
}

function appendReflectionEditorInline(
  parent: Node,
  source: string,
  createImageNode?: (marker: string, imageName: string) => HTMLElement
) {
  const parse = (
    start: number,
    closingFormat: ReflectionInlineFormat | null
  ): { fragment: DocumentFragment; index: number; closed: boolean } => {
    const fragment = document.createDocumentFragment();
    let index = start;
    let textStart = start;
    const appendTextThrough = (end: number) => {
      if (end > textStart) {
        fragment.appendChild(
          document.createTextNode(source.slice(textStart, end))
        );
      }
    };

    while (index < source.length) {
      if (
        closingFormat &&
        source.startsWith(closingFormat.close, index) &&
        isReflectionFormatClosing(source, index, closingFormat)
      ) {
        appendTextThrough(index);
        return {
          fragment,
          index: index + closingFormat.close.length,
          closed: true,
        };
      }

      const imageMatch = createImageNode
        ? source
            .slice(index)
            .match(
              /^!\[\[(QB_[A-Za-z0-9_-]+_reflection_\d+\.png)(?:\|[^\]]*)?\]\]/
            )
        : null;
      if (imageMatch) {
        appendTextThrough(index);
        const imageName = imageMatch[1];
        fragment.appendChild(
          createImageNode!(`![[${imageName}]]`, imageName)
        );
        index += imageMatch[0].length;
        textStart = index;
        continue;
      }

      const openingFormat = REFLECTION_INLINE_FORMATS.find(
        (format) =>
          source.startsWith(format.open, index) &&
          isReflectionFormatOpening(source, index, format)
      );
      if (!openingFormat) {
        index += 1;
        continue;
      }

      const nested = parse(index + openingFormat.open.length, openingFormat);
      if (!nested.closed || !nested.fragment.hasChildNodes()) {
        appendTextThrough(index);
        fragment.appendChild(document.createTextNode(openingFormat.open));
        index += openingFormat.open.length;
        textStart = index;
        continue;
      }

      appendTextThrough(index);
      const element = document.createElement(openingFormat.tagName);
      element.appendChild(nested.fragment);
      fragment.appendChild(element);
      index = nested.index;
      textStart = index;
    }

    appendTextThrough(source.length);
    return { fragment, index: source.length, closed: closingFormat === null };
  };

  parent.appendChild(parse(0, null).fragment);
}

type ReflectionMarkdownListLine = {
  level: number;
  listTag: "UL" | "OL";
  content: string;
};

function parseReflectionMarkdownListLine(
  line: string
): ReflectionMarkdownListLine | null {
  const match = line.match(/^([ \t]*)([-+*]|\d+\.)[ \t]+(.*)$/);
  if (!match) return null;
  const indentColumns = Array.from(match[1]).reduce(
    (total, character) => total + (character === "\t" ? 2 : 1),
    0
  );
  return {
    level: Math.floor(indentColumns / 2),
    listTag: /^\d+\.$/.test(match[2]) ? "OL" : "UL",
    content: match[3],
  };
}

function appendReflectionEditorMarkdown(
  editor: HTMLElement,
  text: string,
  createImageNode?: (marker: string, imageName: string) => HTMLElement
) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const listStack: Array<{
    list: HTMLUListElement | HTMLOListElement;
    listTag: "UL" | "OL";
    lastItem: HTMLLIElement | null;
  }> = [];

  for (const line of lines) {
    const parsed = parseReflectionMarkdownListLine(line);
    if (!parsed) {
      listStack.length = 0;
      const block = document.createElement("div");
      if (line) {
        appendReflectionEditorInline(block, line, createImageNode);
      } else {
        block.appendChild(document.createElement("br"));
      }
      editor.appendChild(block);
      continue;
    }

    const level = Math.min(parsed.level, listStack.length);
    while (listStack.length > level + 1) listStack.pop();
    if (
      listStack[level] &&
      listStack[level].listTag !== parsed.listTag
    ) {
      listStack.length = level;
    }
    if (!listStack[level]) {
      const list = document.createElement(
        parsed.listTag.toLowerCase()
      ) as HTMLUListElement | HTMLOListElement;
      const parent =
        level === 0
          ? editor
          : listStack[level - 1]?.lastItem ?? editor;
      parent.appendChild(list);
      listStack[level] = {
        list,
        listTag: parsed.listTag,
        lastItem: null,
      };
    }

    const item = document.createElement("li");
    if (parsed.content) {
      appendReflectionEditorInline(item, parsed.content, createImageNode);
    } else {
      item.appendChild(document.createElement("br"));
    }
    listStack[level].list.appendChild(item);
    listStack[level].lastItem = item;
    listStack.length = level + 1;
  }
}

export function setReflectionEditorMarkdown(
  editor: HTMLElement,
  markdown: string,
  images: QBReflectionImageStore = {}
) {
  editor.textContent = "";
  const source = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const imageMap = getReflectionImageMap(images);
  appendReflectionEditorMarkdown(editor, source, (marker, imageName) =>
    createReflectionInlineImageNode(marker, imageMap.get(imageName))
  );
}

function serializeReflectionInlineNode(
  node: Node,
  activeFormats = new Set<string>()
): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (!(node instanceof Element)) return "";
  if (node.classList.contains("qb-support-reflection-inline-image")) {
    return normalizeReflectionImageMarker(
      (node as HTMLElement).dataset.marker ||
        (node as HTMLElement).dataset.imageName ||
        ""
    );
  }
  if (node.tagName === "BR") return "\n";

  const format = (() => {
    switch (node.tagName) {
      case "B":
      case "STRONG":
        return { key: "bold", open: "**", close: "**" };
      case "I":
      case "EM":
        return { key: "italic", open: "*", close: "*" };
      case "U":
        return { key: "underline", open: "<u>", close: "</u>" };
      case "S":
      case "STRIKE":
      case "DEL":
        return { key: "strike", open: "~~", close: "~~" };
      default:
        return null;
    }
  })();
  if (!format || activeFormats.has(format.key)) {
    return Array.from(node.childNodes)
      .map((child) => serializeReflectionInlineNode(child, activeFormats))
      .join("");
  }

  const nextFormats = new Set(activeFormats);
  nextFormats.add(format.key);
  const inner = Array.from(node.childNodes)
    .map((child) => serializeReflectionInlineNode(child, nextFormats))
    .join("");
  return inner.trim() ? `${format.open}${inner}${format.close}` : inner;
}

function serializeReflectionList(
  list: HTMLUListElement | HTMLOListElement,
  depth: number
): string {
  const ordered = list.tagName === "OL";
  const items = Array.from(list.children).filter(
    (child): child is HTMLLIElement => child.tagName === "LI"
  );
  return items
    .map((item, index) => {
      const nestedLists: Array<HTMLUListElement | HTMLOListElement> = [];
      let content = "";
      for (const child of Array.from(item.childNodes)) {
        if (
          child instanceof HTMLElement &&
          (child.tagName === "UL" || child.tagName === "OL")
        ) {
          nestedLists.push(child as HTMLUListElement | HTMLOListElement);
        } else {
          content += serializeReflectionInlineNode(child);
        }
      }
      const indent = "  ".repeat(depth);
      const prefix = ordered ? `${index + 1}. ` : "- ";
      const contentLines = content.replace(/\n+$/g, "").split("\n");
      let output = `${indent}${prefix}${contentLines[0] ?? ""}`;
      for (const continuation of contentLines.slice(1)) {
        output += `\n${indent}  ${continuation}`;
      }
      for (const nested of nestedLists) {
        output += `\n${serializeReflectionList(nested, depth + 1)}`;
      }
      return output;
    })
    .join("\n");
}

function serializeReflectionBlock(element: Element): string {
  let output = "";
  const appendBlock = (value: string) => {
    if (output && !output.endsWith("\n")) output += "\n";
    output += value;
    if (!output.endsWith("\n")) output += "\n";
  };
  for (const child of Array.from(element.childNodes)) {
    if (
      child instanceof HTMLElement &&
      (child.tagName === "UL" || child.tagName === "OL")
    ) {
      appendBlock(
        serializeReflectionList(child as HTMLUListElement | HTMLOListElement, 0)
      );
    } else if (
      child instanceof HTMLElement &&
      (child.tagName === "DIV" || child.tagName === "P")
    ) {
      appendBlock(serializeReflectionBlock(child));
    } else {
      output += serializeReflectionInlineNode(child);
    }
  }
  return output;
}

export function getReflectionEditorText(editor: HTMLElement): string {
  return serializeReflectionBlock(editor)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function handleReflectionFormattingShortcut(
  editor: HTMLElement,
  event: KeyboardEvent
): boolean {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey) return false;
  const key = event.key.toLowerCase();
  const command =
    key === "s" && event.shiftKey
      ? "strikeThrough"
      : !event.shiftKey
        ? ({
            b: "bold",
            i: "italic",
            u: "underline",
          } as const)[key as "b" | "i" | "u"]
        : undefined;
  if (!command) return false;
  event.preventDefault();
  event.stopPropagation();
  applyReflectionFormattingCommand(editor, command);
  return true;
}

type ReflectionFormatCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "insertUnorderedList"
  | "insertOrderedList";

const REFLECTION_FORMAT_CONTROLS: Array<{
  command: ReflectionFormatCommand;
  label: string;
  shortcut: string;
  description: string;
}> = [
  { command: "bold", label: "B", shortcut: "⌘B", description: "太字" },
  { command: "italic", label: "I", shortcut: "⌘I", description: "斜体" },
  { command: "underline", label: "U", shortcut: "⌘U", description: "下線" },
  {
    command: "strikeThrough",
    label: "S",
    shortcut: "⌘⇧S",
    description: "取り消し線",
  },
  {
    command: "insertUnorderedList",
    label: "•",
    shortcut: "- + Space",
    description: "箇条書き",
  },
  {
    command: "insertOrderedList",
    label: "1.",
    shortcut: "1. + Space",
    description: "番号付きリスト",
  },
];

export function applyReflectionFormattingCommand(
  editor: HTMLElement,
  command: ReflectionFormatCommand
) {
  editor.focus({ preventScroll: true });
  if (
    command === "insertUnorderedList" ||
    command === "insertOrderedList"
  ) {
    const targetTag = command === "insertOrderedList" ? "OL" : "UL";
    const item = getReflectionSelectionListItem(editor);
    if (item) {
      const list = item.parentElement;
      if (list?.tagName === targetTag) {
        outdentReflectionListItem(item);
      } else if (list && (list.tagName === "UL" || list.tagName === "OL")) {
        const replacement = document.createElement(
          targetTag.toLowerCase()
        ) as HTMLUListElement | HTMLOListElement;
        while (list.firstChild) replacement.appendChild(list.firstChild);
        list.replaceWith(replacement);
        placeCaretInReflectionListItem(item);
      }
    } else {
      const range = getReflectionEditorSelectionRange(editor);
      if (range) {
        const startElement =
          range.startContainer instanceof Element
            ? range.startContainer
            : range.startContainer.parentElement;
        const block = startElement?.closest("div, p") ?? editor;
        if (block === editor || editor.contains(block)) {
          convertReflectionBlockToList(editor, block, targetTag);
        }
      }
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return;
  }
  document.execCommand(command, false);
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function getReflectionSelectionListItem(
  editor: HTMLElement
): HTMLLIElement | null {
  const range = getReflectionEditorSelectionRange(editor);
  if (!range) return null;
  const startElement =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const item = startElement?.closest("li") as HTMLLIElement | null;
  return item && editor.contains(item) ? item : null;
}

function getReflectionCaretBlockPrefix(
  editor: HTMLElement,
  range: Range
): { text: string; range: Range; block: Element } | null {
  if (!range.collapsed) return null;
  const startElement =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const block = startElement?.closest("li, div, p") ?? editor;
  if (block instanceof HTMLLIElement || !editor.contains(block)) return null;
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(block);
  try {
    prefixRange.setEnd(range.startContainer, range.startOffset);
  } catch {
    return null;
  }
  return { text: prefixRange.toString(), range: prefixRange, block };
}

function placeCaretInReflectionListItem(
  item: HTMLLIElement,
  atStart = false
) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  if (atStart) {
    range.setStart(item, 0);
  } else {
    const firstNestedList = Array.from(item.children).find(
      (child) => child.tagName === "UL" || child.tagName === "OL"
    );
    if (firstNestedList) {
      range.setStartBefore(firstNestedList);
    } else {
      range.selectNodeContents(item);
      range.collapse(false);
    }
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function convertReflectionBlockToList(
  editor: HTMLElement,
  block: Element,
  listTag: "UL" | "OL"
) {
  const list = document.createElement(
    listTag.toLowerCase()
  ) as HTMLUListElement | HTMLOListElement;
  const item = document.createElement("li");
  while (block.firstChild) item.appendChild(block.firstChild);
  if (!item.hasChildNodes() || !item.textContent) {
    item.textContent = "";
    item.appendChild(document.createElement("br"));
  }
  list.appendChild(item);
  if (block === editor) {
    editor.textContent = "";
    editor.appendChild(list);
  } else {
    block.replaceWith(list);
  }
  placeCaretInReflectionListItem(item, true);
}

function convertReflectionMarkerBlockToList(
  editor: HTMLElement,
  prefix: { range: Range; block: Element },
  listTag: "UL" | "OL"
) {
  prefix.range.deleteContents();
  convertReflectionBlockToList(editor, prefix.block, listTag);
}

function indentReflectionListItem(item: HTMLLIElement): boolean {
  const list = item.parentElement;
  const previousItem = item.previousElementSibling as HTMLLIElement | null;
  if (!list || !previousItem || list.tagName === "LI") return false;
  const listTag = list.tagName === "OL" ? "OL" : "UL";
  let nestedList = Array.from(previousItem.children)
    .reverse()
    .find((child) => child.tagName === listTag) as
    | HTMLUListElement
    | HTMLOListElement
    | undefined;
  if (!nestedList) {
    nestedList = document.createElement(
      listTag.toLowerCase()
    ) as HTMLUListElement | HTMLOListElement;
    previousItem.appendChild(nestedList);
  }
  nestedList.appendChild(item);
  if (!list.children.length) list.remove();
  placeCaretInReflectionListItem(item);
  return true;
}

function outdentReflectionListItem(item: HTMLLIElement): boolean {
  const list = item.parentElement;
  if (!list || (list.tagName !== "UL" && list.tagName !== "OL")) return false;
  const parentItem = list.parentElement;
  if (parentItem?.tagName === "LI") {
    const ancestorList = parentItem.parentElement;
    if (!ancestorList) return false;
    ancestorList.insertBefore(item, parentItem.nextSibling);
    if (!list.children.length) list.remove();
    placeCaretInReflectionListItem(item);
    return true;
  }

  const listParent = list.parentNode;
  if (!listParent) return false;
  const siblings = Array.from(list.children);
  const itemIndex = siblings.indexOf(item);
  const beforeList = list.cloneNode(false) as HTMLUListElement | HTMLOListElement;
  const afterList = list.cloneNode(false) as HTMLUListElement | HTMLOListElement;
  siblings.slice(0, itemIndex).forEach((sibling) => beforeList.appendChild(sibling));
  siblings.slice(itemIndex + 1).forEach((sibling) => afterList.appendChild(sibling));
  const block = document.createElement("div");
  while (item.firstChild) block.appendChild(item.firstChild);
  if (!block.hasChildNodes()) block.appendChild(document.createElement("br"));
  if (beforeList.children.length) listParent.insertBefore(beforeList, list);
  listParent.insertBefore(block, list);
  if (afterList.children.length) listParent.insertBefore(afterList, list);
  list.remove();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return true;
}

export function handleReflectionListKeyDown(
  editor: HTMLElement,
  event: KeyboardEvent
): boolean {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  if (event.key === "Tab") {
    const item = getReflectionSelectionListItem(editor);
    if (!item) return false;
    event.preventDefault();
    event.stopPropagation();
    const changed = event.shiftKey
      ? outdentReflectionListItem(item)
      : indentReflectionListItem(item);
    if (changed) {
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    return true;
  }
  if (event.key !== " " || event.shiftKey) return false;

  const range = getReflectionEditorSelectionRange(editor);
  if (!range || getReflectionSelectionListItem(editor)) return false;
  const prefix = getReflectionCaretBlockPrefix(editor, range);
  if (!prefix) return false;
  const marker = prefix.text;
  const command = /^[-+*]$/.test(marker)
    ? "insertUnorderedList"
    : /^\d+\.$/.test(marker)
      ? "insertOrderedList"
      : null;
  if (!command) return false;

  event.preventDefault();
  event.stopPropagation();
  editor.focus({ preventScroll: true });
  convertReflectionMarkerBlockToList(
    editor,
    prefix,
    command === "insertOrderedList" ? "OL" : "UL"
  );
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

function restoreReflectionEditorSelection(editor: HTMLElement, range: Range | null) {
  if (!range) return;
  if (
    (!editor.contains(range.startContainer) && range.startContainer !== editor) ||
    (!editor.contains(range.endContainer) && range.endContainer !== editor)
  ) {
    return;
  }
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function isReflectionFormatActive(
  editor: HTMLElement,
  command: ReflectionFormatCommand
): boolean {
  if (!getReflectionEditorSelectionRange(editor)) return false;
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function setReflectionEditorEmptyState(editor: HTMLElement) {
  const hasImage = Boolean(
    editor.querySelector(".qb-support-reflection-inline-image")
  );
  editor.classList.toggle(
    "is-empty",
    !hasImage && !getReflectionEditorText(editor)
  );
}

function getReflectionEditorSelectionRange(
  editor: HTMLElement
): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (
    !editor.contains(range.startContainer) &&
    range.startContainer !== editor
  ) {
    return null;
  }
  if (!editor.contains(range.endContainer) && range.endContainer !== editor) {
    return null;
  }
  return range.cloneRange();
}

function placeCaretAfterNode(node: Node) {
  const selection = window.getSelection();
  if (!selection || !node.parentNode) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertReflectionInlineImage(
  editor: HTMLElement,
  image: QBReflectionImageRecord,
  range: Range | null
): HTMLSpanElement {
  const marker = normalizeReflectionImageMarker(image.imageName);
  const existing = Array.from(
    editor.querySelectorAll<HTMLElement>(
      ".qb-support-reflection-inline-image"
    )
  ).find((node) => node.dataset.marker === marker);
  if (existing) {
    setReflectionInlineImageSource(existing, image);
    placeCaretAfterNode(existing);
    return existing as HTMLSpanElement;
  }

  const node = createReflectionInlineImageNode(marker, image);
  const trailingSpace = document.createTextNode(" ");
  const canUseRange =
    range &&
    (editor.contains(range.startContainer) ||
      range.startContainer === editor) &&
    (editor.contains(range.endContainer) || range.endContainer === editor);
  if (canUseRange) {
    range.deleteContents();
    range.insertNode(trailingSpace);
    range.insertNode(node);
  } else {
    if (
      editor.textContent ||
      editor.querySelector(".qb-support-reflection-inline-image")
    ) {
      editor.appendChild(document.createTextNode(" "));
    }
    editor.appendChild(node);
    editor.appendChild(trailingSpace);
  }
  setReflectionEditorEmptyState(editor);
  placeCaretAfterNode(trailingSpace);
  return node;
}

function insertReflectionText(
  editor: HTMLElement,
  text: string,
  range: Range | null
) {
  const node = document.createTextNode(text);
  if (
    range &&
    (editor.contains(range.startContainer) ||
      range.startContainer === editor) &&
    (editor.contains(range.endContainer) || range.endContainer === editor)
  ) {
    range.deleteContents();
    range.insertNode(node);
  } else {
    editor.appendChild(node);
  }
  placeCaretAfterNode(node);
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error || new Error("画像ファイルを読み取れませんでした"));
    reader.readAsDataURL(file);
  });
}

async function imageFileToPngDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルではありません");
  }
  if (file.size > REFLECTION_IMAGE_MAX_BYTES) {
    throw new Error("画像が大きすぎます（上限12MB）");
  }
  if (file.type === "image/png") {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.startsWith("data:image/png;base64,")) return dataUrl;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("画像をデコードできませんでした"));
      element.src = objectUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("画像のサイズが不正です");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG変換を利用できません");
    context.drawImage(image, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const byteLength = pngDataUrlToBytes(dataUrl).byteLength;
    if (byteLength > REFLECTION_IMAGE_MAX_BYTES) {
      throw new Error("PNG変換後の画像が大きすぎます（上限12MB）");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function pngDataUrlToBytes(dataUrl: string): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("PNG data URLではありません");
  }
  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function getReflectionImageBaseName(context: ReflectionContext): string {
  const source =
    context.info?.id ??
    context.snapshot?.id ??
    context.questionId;
  const safe = String(source)
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return `QB_${safe || "question"}`;
}

async function saveReflectionImage(
  context: ReflectionContext,
  imageDataUrl: string
): Promise<QBReflectionImageRecord> {
  const area = webext.storage?.local ?? getStorageArea(false);
  if (!area) throw new Error("storage.localを利用できません");
  const bytes = pngDataUrlToBytes(imageDataUrl);
  if (bytes.byteLength > REFLECTION_IMAGE_MAX_BYTES) {
    throw new Error("画像が大きすぎます（上限12MB）");
  }
  const sha256 = await sha256Hex(bytes);
  const storageKey = getReflectionImageStorageKey(context.questionId);
  const store = await loadReflectionImageStore(context.questionId);
  const duplicate = Object.values(store).find(
    (image) => image.sha256 === sha256
  );
  if (duplicate) return duplicate;

  const baseName = getReflectionImageBaseName(context);
  const indexes = Object.values(store)
    .map((image) =>
      Number(
        image.imageName.match(
          new RegExp(`^${baseName}_reflection_(\\d+)\\.png$`)
        )?.[1] ?? 0
      )
    )
    .filter((value) => Number.isFinite(value));
  const index = (indexes.length ? Math.max(...indexes) : 0) + 1;
  const imageName = `${baseName}_reflection_${index}.png`;
  const record: QBReflectionImageRecord = {
    schemaVersion: 1,
    source: "QB_support",
    questionId: context.questionId,
    questionCode: context.info?.id ?? context.snapshot?.id ?? null,
    imageName,
    mimeType: "image/png",
    imageDataUrl,
    byteLength: bytes.byteLength,
    sha256,
    createdAt: new Date().toISOString(),
  };
  await storageSet(area, {
    [storageKey]: {
      ...store,
      [imageName]: record,
    },
  });

  const verified = await loadReflectionImageStore(context.questionId);
  if (
    verified[imageName]?.sha256 !== sha256 ||
    verified[imageName]?.imageDataUrl !== imageDataUrl
  ) {
    throw new Error("画像の保存確認に失敗しました");
  }
  return verified[imageName];
}

function imageFilesFromDataTransfer(
  dataTransfer: DataTransfer | null
): File[] {
  const files: File[] = [];
  for (const item of Array.from(dataTransfer?.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  if (files.length) return files;
  return Array.from(dataTransfer?.files ?? []).filter((file) =>
    file.type.startsWith("image/")
  );
}

async function imageFilesFromClipboardRead(): Promise<File[]> {
  if (!navigator.clipboard?.read) return [];
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    const extension = imageType.split("/")[1] || "png";
    files.push(
      new File([blob], `pasted-reflection-image.${extension}`, {
        type: imageType,
      })
    );
  }
  return files;
}

function getImageSourcesFromHtml(html: string): string[] {
  if (!html) return [];
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sources = Array.from(parsed.querySelectorAll<HTMLImageElement>("img"))
    .map((image) => image.getAttribute("src")?.trim() ?? "")
    .map((source) => {
      if (/^(data:image\/|blob:)/i.test(source)) return source;
      try {
        const resolved = new URL(source, location.href).href;
        return /^https?:\/\//i.test(resolved) ? resolved : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return Array.from(new Set(sources));
}

async function imageFileFromSource(
  source: string,
  filename: string
): Promise<File> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`画像取得に失敗しました（HTTP ${response.status}）`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("クリップボード内のURLは画像ではありません");
  }
  return new File([blob], filename, { type: blob.type });
}

async function imageFilesFromHtml(html: string): Promise<File[]> {
  const sources = getImageSourcesFromHtml(html);
  if (!sources.length) return [];
  const results = await Promise.allSettled(
    sources.map((source, index) =>
      imageFileFromSource(source, `pasted-html-image-${index + 1}`)
    )
  );
  const files = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  if (files.length) return files;
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  throw failure?.reason instanceof Error
    ? failure.reason
    : new Error("クリップボード内の画像URLを取得できませんでした");
}

function dataTransferMayContainImage(
  dataTransfer: DataTransfer | null
): boolean {
  const types = Array.from(dataTransfer?.types ?? []);
  return (
    types.includes("Files") ||
    types.includes("text/uri-list") ||
    types.includes("text/html") ||
    Array.from(dataTransfer?.items ?? []).some(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    )
  );
}

async function imageFileFromDroppedUrl(
  dataTransfer: DataTransfer | null
): Promise<File | null> {
  let source = dataTransfer?.getData("text/uri-list").split("\n")[0].trim() ?? "";
  if (!source) {
    const html = dataTransfer?.getData("text/html") ?? "";
    if (html) {
      source =
        new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector<HTMLImageElement>("img")
          ?.src ?? "";
    }
  }
  if (!/^(data:image\/|https?:\/\/)/i.test(source)) return null;
  return imageFileFromSource(source, "dropped-reflection-image");
}

function showReflectionNotice(message: string, error = false) {
  document.getElementById("qb-support-reflection-notice")?.remove();
  const notice = document.createElement("div");
  notice.id = "qb-support-reflection-notice";
  notice.classList.toggle("is-error", error);
  notice.setAttribute("role", error ? "alert" : "status");
  notice.textContent = message;
  (document.body || document.documentElement).appendChild(notice);
  window.setTimeout(() => notice.remove(), error ? 8000 : 3000);
}

function buildReflectionPanel(
  context: ReflectionContext,
  saved: QBReflectionRecord | null,
  savedImages: QBReflectionImageStore
): ReflectionPanelElement {
  const container = document.createElement("div") as ReflectionPanelElement;
  container.id = REFLECTION_CONTAINER_ID;
  container.dataset.questionId = context.questionId;

  const head = document.createElement("div");
  head.className = "qb-support-reflection-head";

  const title = document.createElement("div");
  title.className = "qb-support-reflection-title";
  title.textContent = "振り返り";

  const meta = document.createElement("div");
  meta.className = "qb-support-reflection-meta";

  const pdfBadge = document.createElement("span");
  pdfBadge.className = "qb-support-reflection-pdf";
  pdfBadge.textContent = "PDF: Vital2CK";
  pdfBadge.title = `Anki生成時の既定PDF: ${QB_REFLECTION_PDF_ID}`;

  const status = document.createElement("span");
  status.className = "qb-support-reflection-status";
  status.textContent = saved?.reflection ? "保存済み" : "";

  meta.appendChild(pdfBadge);
  meta.appendChild(status);
  head.appendChild(title);
  head.appendChild(meta);

  const editor = document.createElement("div");
  editor.className = "qb-support-reflection-editor";
  editor.contentEditable = "true";
  editor.dataset.placeholder = "この問題の教訓・間違えた理由をメモ（自動保存）";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", "振り返り");
  editor.setAttribute("aria-multiline", "true");
  editor.setAttribute("spellcheck", "false");
  setReflectionEditorMarkdown(editor, saved?.reflection ?? "", savedImages);
  setReflectionEditorEmptyState(editor);

  const formatBar = document.createElement("div");
  formatBar.className = "qb-support-reflection-formatbar";
  formatBar.setAttribute("role", "toolbar");
  formatBar.setAttribute("aria-label", "文字書式");

  const formatButtons = new Map<ReflectionFormatCommand, HTMLButtonElement>();
  const updateFormatButtons = () => {
    for (const [command, button] of formatButtons) {
      button.setAttribute(
        "aria-pressed",
        String(isReflectionFormatActive(editor, command))
      );
    }
  };
  for (const control of REFLECTION_FORMAT_CONTROLS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qb-support-reflection-format";
    button.dataset.command = control.command;
    button.textContent = control.label;
    button.title = `${control.shortcut}：${control.description}`;
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", "false");
    let preservedRange: Range | null = null;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      preservedRange = getReflectionEditorSelectionRange(editor);
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      restoreReflectionEditorSelection(editor, preservedRange);
      applyReflectionFormattingCommand(editor, control.command);
      updateFormatButtons();
    });
    formatButtons.set(control.command, button);
    formatBar.appendChild(button);
  }

  const actions = document.createElement("div");
  actions.className = "qb-support-reflection-actions";

  const attachInput = document.createElement("input");
  attachInput.type = "file";
  attachInput.accept = "image/*";
  attachInput.multiple = true;
  attachInput.hidden = true;

  const attachButton = document.createElement("button");
  attachButton.type = "button";
  attachButton.className = "qb-support-reflection-attach";
  attachButton.textContent = "画像を添付";

  actions.appendChild(attachInput);
  actions.appendChild(attachButton);

  const footer = document.createElement("div");
  footer.className = "qb-support-reflection-footer";
  footer.textContent =
    "問題ID・問題文・選択肢・添付画像とともにAnki生成用データとして保存します";

  let saveTimer: number | null = null;
  let lastSavedText = saved?.reflection ?? "";
  let attachmentChain: Promise<void> = Promise.resolve();
  let pendingAttachmentCount = 0;

  const setStatus = (message: string, error = false) => {
    if (!container.isConnected && message !== "保存中...") return;
    status.textContent = message;
    status.classList.toggle("is-error", error);
  };

  const persist = async (value: string) => {
    if (value === lastSavedText) {
      setStatus(value ? "保存済み" : "");
      return;
    }
    try {
      await saveReflectionRecord(context, value);
      lastSavedText = value;
      setStatus("保存済み");
    } catch (error) {
      console.warn("[QB_SUPPORT][reflection] save failed", {
        questionId: context.questionId,
        message: error instanceof Error ? error.message : String(error),
      });
      setStatus("保存失敗", true);
      throw error;
    }
  };

  const flushNow = async () => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    setReflectionEditorEmptyState(editor);
    await persist(getReflectionEditorText(editor));
  };

  const removeUnsupportedImages = (): boolean => {
    const unsupported = Array.from(editor.querySelectorAll("img")).filter(
      (image) => !image.closest(".qb-support-reflection-inline-image")
    );
    if (!unsupported.length) return false;
    unsupported.forEach((image) => image.remove());
    setStatus("画像添付失敗", true);
    showReflectionNotice(
      "画像を保存できなかったため挿入を取り消しました。もう一度「画像を添付」からお試しください。",
      true
    );
    return true;
  };

  const scheduleSave = () => {
    if (removeUnsupportedImages()) return;
    setReflectionEditorEmptyState(editor);
    setStatus("保存中...");
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void persist(getReflectionEditorText(editor)).catch(() => undefined);
    }, REFLECTION_SAVE_DEBOUNCE_MS);
  };

  const runAttachFiles = async (
    imageFiles: File[],
    initialRange: Range | null
  ) => {
    let insertionRange = initialRange;
    const insertedNodes: HTMLElement[] = [];
    setStatus("画像保存中...");
    try {
      await flushNow();
      for (const file of imageFiles) {
        const liveBeforeSave = getReflectionContext();
        if (
          !container.isConnected ||
          !liveBeforeSave ||
          liveBeforeSave.questionId !== context.questionId
        ) {
          throw new Error("画像保存前に問題が切り替わりました");
        }
        const imageDataUrl = await imageFileToPngDataUrl(file);
        const image = await saveReflectionImage(context, imageDataUrl);

        const liveBeforeInsert = getReflectionContext();
        if (
          !container.isConnected ||
          !liveBeforeInsert ||
          liveBeforeInsert.questionId !== context.questionId
        ) {
          const marker = normalizeReflectionImageMarker(image.imageName);
          const latest = getReflectionEditorText(editor);
          const nextValue = latest.includes(marker)
            ? latest
            : `${latest}${latest ? "\n\n" : ""}${marker}`;
          await saveReflectionRecord(context, nextValue);
          lastSavedText = nextValue;
          showReflectionNotice(
            "問題切替前の振り返りへ画像を保存しました。",
            false
          );
          return;
        }

        const marker = normalizeReflectionImageMarker(image.imageName);
        const alreadyPresent = Array.from(
          editor.querySelectorAll<HTMLElement>(
            ".qb-support-reflection-inline-image"
          )
        ).some((node) => node.dataset.marker === marker);
        const node = insertReflectionInlineImage(
          editor,
          image,
          insertionRange
        );
        if (!alreadyPresent) insertedNodes.push(node);
        insertionRange = getReflectionEditorSelectionRange(editor);
        console.log("[QB_SUPPORT][reflection] image stored", {
          questionId: context.questionId,
          imageName: image.imageName,
          byteLength: image.byteLength,
          sha256: image.sha256,
        });
      }
      await flushNow();
      setStatus("画像を添付しました");
    } catch (error) {
      insertedNodes.forEach((node) => node.remove());
      setReflectionEditorEmptyState(editor);
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[QB_SUPPORT][reflection] image attach failed", {
        questionId: context.questionId,
        message,
      });
      setStatus("画像添付失敗", true);
      showReflectionNotice(`画像添付に失敗しました: ${message}`, true);
      throw error;
    }
  };

  const attachFiles = (
    files: File[] | FileList | null,
    range = getReflectionEditorSelectionRange(editor)
  ): Promise<void> => {
    const imageFiles = Array.from(files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (!imageFiles.length) return Promise.resolve();
    pendingAttachmentCount += 1;
    attachButton.disabled = true;
    attachmentChain = attachmentChain
      .catch(() => undefined)
      .then(() => runAttachFiles(imageFiles, range))
      .finally(() => {
        pendingAttachmentCount -= 1;
        attachButton.disabled = pendingAttachmentCount > 0;
        attachInput.value = "";
      });
    return attachmentChain;
  };

  const handlePaste = (event: ClipboardEvent) => {
    const eventFiles = imageFilesFromDataTransfer(event.clipboardData);
    if (eventFiles.length) {
      event.preventDefault();
      event.stopPropagation();
      void attachFiles(eventFiles).catch(() => undefined);
      return;
    }

    const types = Array.from(event.clipboardData?.types ?? []);
    const html = event.clipboardData?.getData("text/html") ?? "";
    const plainText = event.clipboardData?.getData("text/plain") ?? "";
    const htmlImageSources = getImageSourcesFromHtml(html);
    const mayContainAsyncImage =
      types.includes("Files") ||
      htmlImageSources.length > 0;
    if (!mayContainAsyncImage) return;

    const range = getReflectionEditorSelectionRange(editor);
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      let htmlFailure: unknown = null;
      if (htmlImageSources.length) {
        try {
          const htmlFiles = await imageFilesFromHtml(html);
          if (htmlFiles.length) return attachFiles(htmlFiles, range);
        } catch (error) {
          htmlFailure = error;
        }
      }

      try {
        const files = await imageFilesFromClipboardRead();
        if (files.length) return attachFiles(files, range);
      } catch (error) {
        if (!htmlFailure) htmlFailure = error;
      }

      if (plainText) {
        insertReflectionText(editor, plainText, range);
        return;
      }
      throw htmlFailure instanceof Error
        ? htmlFailure
        : new Error("クリップボードから画像データを取得できませんでした");
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[QB_SUPPORT][reflection] clipboard image read failed", {
        questionId: context.questionId,
        types,
        htmlImageCount: htmlImageSources.length,
        message,
      });
      setStatus("画像添付失敗", true);
      showReflectionNotice(`画像添付に失敗しました: ${message}`, true);
    });
  };

  editor.addEventListener("input", scheduleSave);
  editor.addEventListener("input", updateFormatButtons);
  editor.addEventListener("focus", updateFormatButtons);
  editor.addEventListener("mouseup", updateFormatButtons);
  editor.addEventListener("keyup", updateFormatButtons);
  editor.addEventListener("blur", () => {
    void flushNow().catch(() => undefined);
  });
  editor.addEventListener(
    "keydown",
    (event) => {
      if (handleReflectionFormattingShortcut(editor, event)) return;
      handleReflectionListKeyDown(editor, event);
    },
    true
  );
  ["keydown", "keypress", "keyup"].forEach((type) => {
    editor.addEventListener(type, (event) => event.stopPropagation(), true);
  });
  editor.addEventListener("paste", handlePaste, true);
  attachButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    attachInput.click();
  });
  attachInput.addEventListener("change", () => {
    void attachFiles(attachInput.files).catch(() => undefined);
  });
  container.addEventListener("dragover", (event) => {
    if (!dataTransferMayContainImage(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    container.classList.add("is-drag-over");
  });
  container.addEventListener("dragleave", () => {
    container.classList.remove("is-drag-over");
  });
  container.addEventListener("drop", (event) => {
    const files = imageFilesFromDataTransfer(event.dataTransfer);
    if (!files.length && !dataTransferMayContainImage(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    container.classList.remove("is-drag-over");
    const range = getReflectionEditorSelectionRange(editor);
    if (files.length) {
      void attachFiles(files, range).catch(() => undefined);
      return;
    }
    void imageFileFromDroppedUrl(event.dataTransfer)
      .then((file) => {
        if (!file) throw new Error("ドロップされた画像を取得できませんでした");
        return attachFiles([file], range);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setStatus("画像添付失敗", true);
        showReflectionNotice(`画像添付に失敗しました: ${message}`, true);
      });
  });

  container.appendChild(head);
  container.appendChild(formatBar);
  container.appendChild(editor);
  container.appendChild(actions);
  container.appendChild(footer);
  container.__qbSupportReflectionFlushNow = flushNow;
  return container;
}

function removeReflectionPanel(reason: string) {
  const container = document.getElementById(
    REFLECTION_CONTAINER_ID
  ) as ReflectionPanelElement | null;
  if (!container) return;
  void container.__qbSupportReflectionFlushNow?.().catch(() => undefined);
  const lightbox = document.getElementById(
    REFLECTION_LIGHTBOX_ID
  ) as ReflectionLightboxElement | null;
  lightbox?.__qbSupportReflectionClose?.();
  container.remove();
  console.log("[QB_SUPPORT][reflection] removed", {
    reason,
    questionId: container.dataset.questionId ?? null,
  });
}

async function syncReflectionPanel(reason: string) {
  if (window !== window.top || (!isQbHost() && !isMoshiHost())) return;
  const context = getReflectionContext();
  const placement = getReflectionPlacement();
  const existing = document.getElementById(
    REFLECTION_CONTAINER_ID
  ) as ReflectionPanelElement | null;

  if (!context || !placement) {
    if (existing) removeReflectionPanel("explanation-unavailable");
    return;
  }
  if (
    existing?.isConnected &&
    existing.dataset.questionId === context.questionId
  ) {
    return;
  }
  if (reflectionRenderQuestionId === context.questionId) return;

  if (existing) removeReflectionPanel("question-changed");
  reflectionRenderQuestionId = context.questionId;
  try {
    const [saved, savedImages] = await loadReflectionDataForContext(context);
    const liveContext = getReflectionContext();
    const livePlacement = getReflectionPlacement();
    if (
      !liveContext ||
      liveContext.questionId !== context.questionId ||
      !livePlacement
    ) {
      return;
    }
    const current = document.getElementById(
      REFLECTION_CONTAINER_ID
    ) as ReflectionPanelElement | null;
    if (current?.dataset.questionId === context.questionId) return;
    if (current) removeReflectionPanel("replace-stale-panel");

    const container = buildReflectionPanel(liveContext, saved, savedImages);
    livePlacement.parent.insertBefore(container, livePlacement.before);
    console.log("[QB_SUPPORT][reflection] rendered", {
      reason,
      questionId: context.questionId,
      hasSavedText: Boolean(saved?.reflection),
      pdfId: QB_REFLECTION_PDF_ID,
    });
  } catch (error) {
    console.warn("[QB_SUPPORT][reflection] render failed", {
      reason,
      questionId: context.questionId,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (reflectionRenderQuestionId === context.questionId) {
      reflectionRenderQuestionId = null;
    }
  }
}

function attachEventHandlers() {
  const trackHintDraftSource = (event: Event) => {
    const target = event.target;
    if (!isEligibleHintDraftSource(target)) return;
    lastHintDraftSource = target;
  };
  document.addEventListener("focusin", trackHintDraftSource, true);
  document.addEventListener("input", trackHintDraftSource, true);
  window.addEventListener(
    "keydown",
    (event) => {
      const debug = settings.debugEnabled;
      const shouldLogKey = isTargetKey(event);
      if (shouldLogKey) {
        console.log("[QB_SUPPORT][key-capture]", JSON.stringify({
          key: event.key,
          code: event.code,
          composing: event.isComposing,
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
        }));
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
      const isTyping =
        isTypingTarget(event.target) || isTypingTarget(document.activeElement);
      if (event.isComposing && isTyping) return;
      const eventBaseKey = getEventBaseKey(event);
      const key = normalizeKey(event.key);
      const navPrevMatch =
        isShortcutMatch(event, settings.navPrevKey) ||
        isShortcutMatch(event, defaultSettings.navPrevKey);
      const navNextMatch =
        isShortcutMatch(event, settings.navNextKey) ||
        isShortcutMatch(event, defaultSettings.navNextKey);
      const isNavKey = navPrevMatch || navNextMatch;
      const navBaseKey = isNavKey ? eventBaseKey : "";
      const optionIndex = settings.optionKeys.findIndex(
        (shortcut) =>
          isShortcutMatch(event, shortcut) ||
          isPlainShortcutMatch(event, shortcut, eventBaseKey)
      );
      const isOptionKey = optionIndex >= 0;
      const optionBaseKey =
        isOptionKey && settings.optionKeys[optionIndex]
          ? getShortcutBaseKey(settings.optionKeys[optionIndex])
          : "";
      const templateShortcut = getChatTemplateShortcut(event);
      if (templateShortcut && window === window.top && (!isTyping || event.ctrlKey)) {
        consumeShortcutEvent(event);
        void sendTemplateMessage(templateShortcut);
        return;
      }
      if (
        CHAT_ENABLED &&
        isShortcutMatch(event, CHAT_INPUT_TOGGLE_SHORTCUT) &&
        window === window.top
      ) {
        consumeShortcutEvent(event);
        toggleChatInputFocus();
        return;
      }
      if (isTyping) return;
      if (CHAT_ENABLED && isShortcutMatch(event, CHAT_NEW_SHORTCUT) && window === window.top) {
        consumeShortcutEvent(event);
        resetChatHistory("会話をリセットしました");
        void saveSettings({ ...settings, chatOpen: true });
        return;
      }
      if (
        CHAT_ENABLED &&
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
      if (!isQuestionPage()) {
        if (shouldLogKey) {
          console.log("[QB_SUPPORT][frame-skip]", JSON.stringify({
            key: event.key,
            url: location.href,
            frame: window === window.top ? "top" : "iframe",
            reason: "no-question-container",
            diagnostics: getQuestionPageDiagnostics(),
          }));
        }
        return;
      }

      if (CHAT_ENABLED && isShortcutMatch(event, CHAT_TOGGLE_SHORTCUT) && window === window.top) {
        consumeShortcutEvent(event);
        void saveSettings({ ...settings, chatOpen: !settings.chatOpen });
        return;
      }

      if (
        window === window.top &&
        !event.repeat &&
        (isShortcutMatch(event, settings.copyKey) ||
          isPlainShortcutMatch(event, settings.copyKey, eventBaseKey))
      ) {
        consumeShortcutEvent(event);
        copyCurrentQuestion();
        return;
      }

      if (isShortcutMatch(event, settings.shortcut)) {
        consumeShortcutEvent(event);
        if (debug) {
          console.debug("[QB_SUPPORT][toggle]", {
            prevented: true,
            target: describeElement(event.target instanceof HTMLElement ? event.target : null),
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

      const revealMatch =
        isShortcutMatch(event, settings.revealKey) ||
        isPlainShortcutMatch(event, settings.revealKey, eventBaseKey) ||
        isShortcutMatch(event, defaultSettings.revealKey) ||
        isPlainShortcutMatch(event, defaultSettings.revealKey, eventBaseKey);
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
              key: eventBaseKey.toLowerCase(),
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
      void closeSettingsPanel();
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

function createSwitch(
  labelText: string,
  checked: boolean,
  onChange: (checked: boolean) => void
): { label: HTMLLabelElement; input: HTMLInputElement } {
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

function createOverlaySelect(
  options: Array<{ value: string; label: string }>,
  className?: string
): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = `qb-support-select qb-support-select-overlay qb-support-select-pill${
    className ? ` ${className}` : ""
  }`;
  options.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  return select;
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
  if (!isElementVisible(target)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT") {
    const input = target as HTMLInputElement;
    const type = (input.type || "text").toLowerCase();
    if (
      type === "hidden" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "button" ||
      type === "submit" ||
      type === "file"
    ) {
      return false;
    }
    if (input.disabled || input.readOnly) return false;
    return true;
  }
  if (tag === "TEXTAREA") {
    const textarea = target as HTMLTextAreaElement;
    if (textarea.disabled || textarea.readOnly) return false;
    return true;
  }
  return tag === "SELECT";
}

function isElementVisible(target: HTMLElement): boolean {
  if (target.offsetParent !== null) return true;
  const rect = target.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isExtensionUiTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(`#${ROOT_ID}, #${CHAT_ROOT_ID}`));
}

function isQuestionPage(): boolean {
  return isQuestionDocument(document, location.href);
}

function getQuestionPageDiagnostics(): Record<string, unknown> {
  return {
    readyState: document.readyState,
    title: document.title,
    hasLegacyContainer: document.querySelector(".question-container") !== null,
    hasQuestionIdQuery: new URLSearchParams(location.search).has("question_id"),
    buttonCount: document.querySelectorAll("button").length,
    htmlRendererCount: document.querySelectorAll(".html_renderer").length,
    iframeSources: listFrameSources(),
    bodyText: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
  };
}

function isQbHost(): boolean {
  return location.hostname.includes("qb.medilink-study.com");
}

function isInputHost(): boolean {
  return location.hostname.includes("input.medilink-study.com");
}

function isMoshiHost(): boolean {
  return isMoshiUrl(location.href);
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
  method: "querySelector" | "none";
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

function getEventBaseKey(event: KeyboardEvent): string {
  const code = event.code ?? "";
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return normalizeKey(event.key);
}

function isPlainShortcut(shortcut: string): boolean {
  const normalized = normalizeShortcut(shortcut);
  return Boolean(normalized && !normalized.includes("+"));
}

function isPlainShortcutMatch(
  event: KeyboardEvent,
  shortcut: string,
  eventBaseKey: string
): boolean {
  if (!isPlainShortcut(shortcut)) return false;
  if (hasModifier(event)) return false;
  return eventBaseKey === getShortcutBaseKey(shortcut);
}

function isTargetKey(event: KeyboardEvent): boolean {
  const key = getEventBaseKey(event);
  const optionKeys = settings.optionKeys
    .map((shortcut) => getShortcutBaseKey(shortcut))
    .filter(Boolean);
  return (
    key === getShortcutBaseKey(settings.navPrevKey) ||
    key === getShortcutBaseKey(settings.navNextKey) ||
    key === getShortcutBaseKey(settings.revealKey) ||
    key === getShortcutBaseKey(defaultSettings.revealKey) ||
    (CHAT_ENABLED && key === getShortcutBaseKey(CHAT_TOGGLE_SHORTCUT)) ||
    (CHAT_ENABLED && getTemplateShortcutKeys().includes(key)) ||
    optionKeys.includes(key)
  );
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function getChatTemplateShortcut(event: KeyboardEvent) {
  if (!CHAT_ENABLED) return null;
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
    const target = getNavigationTarget(document, getNavigationDirection(key));
    console.log("[QB_SUPPORT][nav-target]", JSON.stringify({
      key,
      target: describeElement(target),
      meta: describeElementMeta(target),
      url: location.href,
      frame: frameLabel,
      source,
    }));
    if (!target) return;
    const beforeUrl = location.href;
    if (source === "local") {
      clickWithFallback(target, { tag: "nav", logAlways: true });
    } else {
      void (async () => {
        const ok = await clickWithCdp(target, "nav");
        if (!ok) clickWithFallback(target, { tag: "nav", logAlways: true });
      })();
    }
    window.setTimeout(() => {
      console.log("[QB_SUPPORT][nav-effect]", JSON.stringify({
        key,
        beforeUrl,
        afterUrl: location.href,
        changed: location.href !== beforeUrl,
        frame: frameLabel,
        source,
      }));
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
    console.log("[QB_SUPPORT][reveal-target]", JSON.stringify({
      key,
      target: describeElement(revealButton),
      meta: describeElementMeta(revealButton),
      url: location.href,
      frame: frameLabel,
      source,
    }));
    if (revealButton) {
      const beforeState = getRevealState();
      if (source === "local") {
        clickWithFallback(revealButton, { tag: "reveal", logAlways: true });
      } else {
        void (async () => {
          const ok = await clickWithCdp(revealButton, "reveal");
          if (!ok) clickWithFallback(revealButton, { tag: "reveal", logAlways: true });
        })();
      }
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
    console.log("[QB_SUPPORT][submit-target]", JSON.stringify({
      key,
      target: describeElement(submitButton),
      meta: describeElementMeta(submitButton),
      url: location.href,
      frame: frameLabel,
      source,
    }));
    if (submitButton) {
      const beforeState = getRevealState();
      if (source === "local") {
        clickWithFallback(submitButton, { tag: "submit", logAlways: true });
      } else {
        void (async () => {
          const ok = await clickWithCdp(submitButton, "submit");
          if (!ok) clickWithFallback(submitButton, { tag: "submit", logAlways: true });
        })();
      }
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
  event.preventDefault();
  event.stopPropagation();
  if (window !== window.top) return;
  if (hasLocalActionTarget(payload)) {
    console.log("[QB_SUPPORT][action-local]", {
      url: location.href,
      frame: "top",
      action: payload.action,
      key: payload.key,
      index: payload.index ?? null,
      reason: "target-in-top",
    });
    handleActionInFrame(payload.action, payload.key, payload.index ?? null, "local");
    return;
  }
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

function getNavigationDirection(key: string): "next" | "prev" {
  const normalizedKey = normalizeKey(key).toLowerCase();
  const nextKey = getShortcutBaseKey(settings.navNextKey).toLowerCase();
  if (normalizedKey === nextKey || normalizedKey === "arrowright") return "next";
  return "prev";
}

function hasLocalActionTarget(payload: {
  action: "option" | "nav" | "reveal";
  key: string;
  index?: number;
}): boolean {
  if (!isQuestionDocument(document, location.href)) return false;
  if (payload.action === "nav") {
    return Boolean(getNavigationTarget(document, getNavigationDirection(payload.key)));
  }
  if (payload.action === "option") {
    const index = payload.index ?? -1;
    return index >= 0 && Boolean(getOptionElements(document)[index]);
  }
  return Boolean(getAnswerRevealButton(document) ?? getSubmitButton(document));
}

function getOptionState(option: HTMLElement | null): Record<string, unknown> | null {
  if (!option) return null;
  const ans = option.querySelector<HTMLElement>(".ans") ?? option;
  const input = option.querySelector<HTMLInputElement>("input");
  return {
    active: ans.classList.contains("active"),
    checked: input ? input.checked : null,
    className: option.className.toString(),
    labelClassName: option.firstElementChild?.className?.toString() ?? null,
    ariaPressed: option.getAttribute("aria-pressed"),
    ariaChecked: option.getAttribute("aria-checked"),
    style: option.getAttribute("style"),
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

  toggleWidgetVisibility(
    "qb-support-search-style",
    ".widget-search, [data-testid='side-search-header'], [data-testid='side-search-body']",
    searchVisible
  );
  toggleWidgetVisibility(
    "qb-support-note-style",
    ".widget-note, [data-testid='side-note-header'], [data-testid='side-note-body'], #fab-note",
    noteVisible
  );
}

function toggleWidgetVisibility(styleId: string, selector: string, visible: boolean) {
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!visible) {
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      ${selector} { display: none !important; }
    `;
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
  const events = ["pointerdown", "mousedown", "pointerup", "mouseup"];
  for (const type of events) {
    const event = createPointerLikeEvent(type);
    const result = target.dispatchEvent(event);
    logClick(tag, `dispatch:${type}`, target, logAlways, result);
  }
  target.click();
  logClick(tag, "element.click", target, logAlways);
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
