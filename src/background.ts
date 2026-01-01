import { webext } from "./lib/webext";

const AUTH_LOG_PREFIX = "[QB_SUPPORT][auth-bg]";
const AUTH_METHOD_TIMEOUT_MS = 8000;
const AUTH_INTERACTIVE_TIMEOUT_MS = 30000;

const ATTACHED_TABS = new Set<number>();

webext.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;
  console.log("[QB_SUPPORT][bg-message]", {
    type: message.type,
    senderUrl: sender.url ?? null,
    tabId: sender.tab?.id ?? null,
  });
  if (message.type === "QB_CDP_CLICK") {
    if (!webext.debugger) {
      sendResponse({ ok: false, error: "Debugger API not available" });
      return;
    }
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "Missing tabId" });
      return;
    }
    handleCdpClick(tabId, message.x, message.y)
      .then(() => sendResponse({ ok: true }))
      .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "QB_AUTH_GET_TOKEN") {
    const interactive = message.interactive !== false;
    handleAuthTokenRequest(interactive)
      .then((token) => sendResponse({ ok: true, token }))
      .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "QB_AUTH_REMOVE_TOKEN") {
    handleAuthTokenRemoval(message.token)
      .then(() => sendResponse({ ok: true }))
      .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "QB_CHAT_REQUEST") {
    handleChatRequest(message)
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

if (webext.webNavigation?.onCommitted) {
  webext.webNavigation.onCommitted.addListener((details) => {
    if (!details.url) return;
    if (
      !details.url.includes("accounts.google.com") &&
      !details.url.includes(".chromiumapp.org/")
    ) {
      return;
    }
    console.log("[QB_SUPPORT][webnav]", {
      event: "committed",
      tabId: details.tabId,
      frameId: details.frameId,
      url: details.url,
    });
  });
}

if (webext.webNavigation?.onCompleted) {
  webext.webNavigation.onCompleted.addListener((details) => {
    if (!details.url) return;
    if (
      !details.url.includes("accounts.google.com") &&
      !details.url.includes(".chromiumapp.org/")
    ) {
      return;
    }
    console.log("[QB_SUPPORT][webnav]", {
      event: "completed",
      tabId: details.tabId,
      frameId: details.frameId,
      url: details.url,
    });
  });
}

webext.runtime?.onConnect?.addListener((port) => {
  if (port.name !== "qb-chat") return;
  port.onMessage.addListener((message) => {
    if (!message || message.type !== "QB_CHAT_STREAM_REQUEST") return;
    handleChatStream(port, message).catch((error: Error) => {
      port.postMessage({
        type: "QB_CHAT_STREAM_ERROR",
        requestId: message.requestId ?? "unknown",
        error: error.message,
      });
    });
  });
});

async function handleCdpClick(tabId: number, x: number, y: number) {
  await attachDebugger(tabId);
  await sendMouseEvent(tabId, "mouseMoved", x, y, 0);
  await sendMouseEvent(tabId, "mousePressed", x, y, 1);
  await sendMouseEvent(tabId, "mouseReleased", x, y, 1);
}

function attachDebugger(tabId: number) {
  if (!webext.debugger) return Promise.reject(new Error("Debugger API not available"));
  if (ATTACHED_TABS.has(tabId)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    webext.debugger?.attach({ tabId }, "1.3", () => {
      if (webext.runtime?.lastError) {
        reject(new Error(webext.runtime.lastError.message ?? "Debugger attach failed"));
        return;
      }
      ATTACHED_TABS.add(tabId);
      resolve();
    });
  });
}

function sendMouseEvent(
  tabId: number,
  type: "mouseMoved" | "mousePressed" | "mouseReleased",
  x: number,
  y: number,
  buttons: number
) {
  if (!webext.debugger) return Promise.reject(new Error("Debugger API not available"));
  return new Promise<void>((resolve, reject) => {
    webext.debugger?.sendCommand(
      { tabId },
      "Input.dispatchMouseEvent",
      {
        type,
        x,
        y,
        button: "left",
        buttons,
        clickCount: 1,
      },
      () => {
        if (webext.runtime?.lastError) {
          reject(new Error(webext.runtime.lastError.message ?? "Debugger command failed"));
          return;
        }
        resolve();
      }
    );
  });
}

function resolveBackendChatUrl(base: string): string | null {
  return resolveBackendEndpoint(base, "chat");
}

function resolveBackendStreamUrl(base: string): string | null {
  return resolveBackendEndpoint(base, "chat/stream");
}

function resolveBackendEndpoint(base: string, suffix: string): string | null {
  const trimmed = base.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (!path) {
    path = `/${suffix}`;
  } else if (path.endsWith(`/${suffix}`)) {
    // already set
  } else if (suffix === "chat/stream" && path.endsWith("/chat")) {
    path = `${path}/stream`;
  } else if (suffix === "chat" && path.endsWith("/chat/stream")) {
    path = path.replace(/\/chat\/stream$/, "/chat");
  } else {
    path = `${path}/${suffix}`;
  }
  url.pathname = path;
  return url.toString();
}

function getOAuthClientId(): string | null {
  const manifest = webext.runtime?.getManifest?.();
  if (!manifest?.oauth2?.client_id) return null;
  return manifest.oauth2.client_id;
}

function buildOAuthUrl(identity: chrome.identity.Identity): string {
  const clientId = getOAuthClientId();
  if (!clientId) {
    throw new Error(
      "manifest.json に oauth2.client_id がありません。Google Cloud Console で OAuth クライアントIDを作成して設定してください。"
    );
  }
  const redirectUri = identity.getRedirectURL("qb-support-auth");
  const state =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

function withAuthTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = AUTH_METHOD_TIMEOUT_MS
): Promise<T> {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      console.warn(AUTH_LOG_PREFIX, `${label} timed out`);
      if (label === "getAuthToken") {
        console.warn(AUTH_LOG_PREFIX, "Atlas非対応の可能性があります。");
      }
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function getAuthTimeout(interactive: boolean): number {
  return interactive ? AUTH_INTERACTIVE_TIMEOUT_MS : AUTH_METHOD_TIMEOUT_MS;
}

async function launchWebAuthFlowToken(
  identity: chrome.identity.Identity,
  interactive: boolean
): Promise<string> {
  if (!identity.launchWebAuthFlow) {
    throw new Error("chrome.identity.launchWebAuthFlow is not available.");
  }
  const url = buildOAuthUrl(identity);
  console.log(AUTH_LOG_PREFIX, "launchWebAuthFlow:start", { url });
  return new Promise<string>((resolve, reject) => {
    identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
      const err = webext.runtime?.lastError;
      console.log(AUTH_LOG_PREFIX, "launchWebAuthFlow:callback", {
        redirectUrl: redirectUrl ?? null,
        lastError: err?.message ?? null,
      });
      if (err?.message) {
        reject(new Error(err.message));
        return;
      }
      if (!redirectUrl) {
        reject(new Error("OAuth redirect URL was not returned."));
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(redirectUrl);
      } catch (parseError) {
        reject(new Error(`Invalid redirect URL: ${String(parseError)}`));
        return;
      }
      const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      const error = params.get("error");
      if (error) {
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      const token = params.get("access_token");
      if (!token) {
        reject(new Error("OAuth access_token was not returned."));
        return;
      }
      resolve(token);
    });
  });
}

async function launchTabAuthFlowToken(
  identity: chrome.identity.Identity,
  interactive: boolean
): Promise<string> {
  const tabs = webext.tabs;
  if (!tabs?.create || !tabs.onUpdated) {
    throw new Error("chrome.tabs API not available.");
  }
  const url = buildOAuthUrl(identity);
  const redirectBase = identity.getRedirectURL("qb-support-auth");
  console.log(AUTH_LOG_PREFIX, "tabs.create:start", { url });
  const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
    tabs.create({ url, active: interactive }, (created) => {
      const err = webext.runtime?.lastError;
      console.log(AUTH_LOG_PREFIX, "tabs.create:callback", {
        tabId: created?.id ?? null,
        lastError: err?.message ?? null,
      });
      if (err?.message) {
        reject(new Error(err.message));
        return;
      }
      if (!created) {
        reject(new Error("Failed to create auth tab."));
        return;
      }
      resolve(created);
    });
  });
  const tabId = tab.id;
  if (typeof tabId !== "number") {
    throw new Error("Auth tab id is missing.");
  }
  return new Promise<string>((resolve, reject) => {
    let lastUrl: string | null = null;
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("OAuth tab flow timed out."));
    }, AUTH_METHOD_TIMEOUT_MS);

    const onUpdated = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId) return;
      if (!info.url) return;
      lastUrl = info.url;
      console.log(AUTH_LOG_PREFIX, "tabs.onUpdated", {
        tabId: updatedTabId,
        url: info.url,
        status: info.status ?? null,
      });
      if (!info.url.startsWith(redirectBase)) return;
      const redirectUrl = info.url;
      let parsed: URL;
      try {
        parsed = new URL(redirectUrl);
      } catch (parseError) {
        cleanup();
        reject(new Error(`Invalid redirect URL: ${String(parseError)}`));
        return;
      }
      const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      const error = params.get("error");
      if (error) {
        cleanup();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      const token = params.get("access_token");
      if (!token) {
        cleanup();
        reject(new Error("OAuth access_token was not returned."));
        return;
      }
      cleanup();
      resolve(token);
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      tabs.onUpdated.removeListener(onUpdated);
      tabs.remove(tabId);
      if (lastUrl) {
        console.log(AUTH_LOG_PREFIX, "tabs.onUpdated:last", { tabId, url: lastUrl });
      }
    };

    tabs.onUpdated.addListener(onUpdated);
  });
}

async function handleAuthTokenRequest(interactive: boolean): Promise<string> {
  const identity = webext.identity;
  if (!identity) throw new Error("chrome.identity API not available.");
  console.log(AUTH_LOG_PREFIX, "token request", {
    interactive,
    launchWebAuthFlow: Boolean(identity.launchWebAuthFlow),
    getAuthToken: Boolean(identity.getAuthToken),
  });
  const methodTimeout = getAuthTimeout(interactive);
  if (identity.getAuthToken) {
    try {
      console.log(AUTH_LOG_PREFIX, "getAuthToken:start");
      const token = await withAuthTimeout(
        new Promise<string>((resolve, reject) => {
          identity.getAuthToken({ interactive }, (token) => {
            const err = webext.runtime?.lastError;
            console.log(AUTH_LOG_PREFIX, "getAuthToken:callback", {
              tokenPresent: Boolean(token),
              lastError: err?.message ?? null,
            });
            if (err?.message) {
              reject(new Error(err.message));
              return;
            }
            if (!token) {
              reject(new Error("OAuth token was not returned."));
              return;
            }
            resolve(token);
          });
        }),
        "getAuthToken",
        methodTimeout
      );
      console.log(AUTH_LOG_PREFIX, "token success", { method: "getAuthToken" });
      return token;
    } catch (error) {
      console.warn("[QB_SUPPORT][auth]", "getAuthToken failed", error);
      throw error;
    }
  }
  if (identity.launchWebAuthFlow) {
    try {
      const token = await withAuthTimeout(
        launchWebAuthFlowToken(identity, interactive),
        "launchWebAuthFlow",
        methodTimeout
      );
      console.log(AUTH_LOG_PREFIX, "token success", { method: "launchWebAuthFlow" });
      return token;
    } catch (error) {
      console.warn("[QB_SUPPORT][auth]", "launchWebAuthFlow failed", error);
    }
  }
  throw new Error("No supported auth flow. Check chrome.identity permissions.");
}

async function handleAuthTokenRemoval(token?: string | null): Promise<void> {
  const identity = webext.identity;
  if (!identity?.removeCachedAuthToken) return;
  if (!token) return;
  await new Promise<void>((resolve, reject) => {
    identity.removeCachedAuthToken({ token }, () => {
      const err = webext.runtime?.lastError;
      if (err?.message) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

async function handleChatRequest(message: {
  apiKey?: string;
  backendUrl?: string;
  authToken?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
}) {
  const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
  const backendBaseUrl =
    typeof message.backendUrl === "string" ? message.backendUrl.trim() : "";
  const authToken = typeof message.authToken === "string" ? message.authToken.trim() : "";
  const backendUrl = backendBaseUrl ? resolveBackendChatUrl(backendBaseUrl) : "";
  const useBackend = !apiKey && Boolean(backendUrl && authToken);
  if (!apiKey && !useBackend) throw new Error("API key is not set.");
  const requestedModel =
    typeof message.model === "string" && message.model ? message.model : "gpt-5-mini";
  const model = requestedModel;
  const messages = Array.isArray(message.messages) ? message.messages : [];
  const supportsTemperature = model === "gpt-5.2";

  const payload: Record<string, unknown> = {
    model,
    messages,
  };
  if (supportsTemperature) {
    payload.temperature = 0.2;
  }

  const response = await fetch(
    useBackend && backendUrl ? backendUrl : "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${useBackend ? authToken : apiKey}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, unknown>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from API.");
  return { text, usage: data.usage ?? null };
}

async function handleChatStream(
  port: chrome.runtime.Port,
  message: {
    requestId: string;
    apiKey?: string;
    backendUrl?: string;
    authToken?: string;
    model?: string;
    input?: unknown;
    instructions?: string;
    previousResponseId?: string | null;
  }
) {
  const requestId = message.requestId;
  const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
  const backendBaseUrl =
    typeof message.backendUrl === "string" ? message.backendUrl.trim() : "";
  const authToken = typeof message.authToken === "string" ? message.authToken.trim() : "";
  const backendUrl = backendBaseUrl ? resolveBackendStreamUrl(backendBaseUrl) : "";
  const useBackend = !apiKey && Boolean(backendUrl && authToken);
  if (!apiKey && !useBackend) throw new Error("API key is not set.");
  const requestedModel =
    typeof message.model === "string" && message.model ? message.model : "gpt-5-mini";
  const model = requestedModel;
  const input = message.input ?? [];
  const instructions =
    typeof message.instructions === "string" ? message.instructions.trim() : "";
  const previousResponseId =
    typeof message.previousResponseId === "string" && message.previousResponseId
      ? message.previousResponseId
      : null;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  const payload: Record<string, unknown> = {
    model,
    instructions: instructions || undefined,
    input,
    previous_response_id: previousResponseId ?? undefined,
    stream: true,
    store: true,
  };
  if (model === "gpt-5.2") {
    payload.temperature = 0.2;
  }

  const response = await fetch(
    useBackend && backendUrl ? backendUrl : "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${useBackend ? authToken : apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  if (!response.body) throw new Error("No response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let responseId: string | null = null;
  let usage: Record<string, unknown> | null = null;

  const flush = (chunk: string, isFinal = false) => {
    buffer += chunk;
    const parts = buffer.split("\n\n");
    if (!isFinal) {
      buffer = parts.pop() ?? "";
    } else {
      buffer = "";
    }
    for (const part of parts) {
      const lines = part.split("\n");
      const dataLines = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, "").trim())
        .filter(Boolean);
      if (!dataLines.length) continue;
      const data = dataLines.join("");
      if (data === "[DONE]") {
        port.postMessage({ type: "QB_CHAT_STREAM_DONE", requestId, responseId, usage });
        return;
      }
      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      if (payload?.type === "response.output_text.delta") {
        const delta =
          typeof payload.delta === "string"
            ? payload.delta
            : typeof payload.text === "string"
            ? payload.text
            : "";
        if (delta) {
          port.postMessage({ type: "QB_CHAT_STREAM_DELTA", requestId, delta });
        }
      }
      if (payload?.type === "response.completed") {
        responseId = payload.response?.id ?? payload.id ?? responseId;
        usage = payload.response?.usage ?? payload.usage ?? usage;
      }
      if (payload?.type === "response.created") {
        responseId = payload.response?.id ?? payload.id ?? responseId;
      }
      if (payload?.error?.message) {
        throw new Error(payload.error.message);
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    flush(decoder.decode(value, { stream: true }));
  }
  flush(decoder.decode(), true);
  port.postMessage({ type: "QB_CHAT_STREAM_DONE", requestId, responseId, usage });
}
