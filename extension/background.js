"use strict";
(() => {
  // src/lib/webext.ts
  var globalApi = globalThis;
  var webext = globalApi.browser ?? globalApi.chrome ?? {};

  // src/background.ts
  var AUTH_LOG_PREFIX = "[QB_SUPPORT][auth-bg]";
  var AUTH_METHOD_TIMEOUT_MS = 8e3;
  var AUTH_INTERACTIVE_TIMEOUT_MS = 3e4;
  var ATTACHED_TABS = /* @__PURE__ */ new Set();
  webext.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;
    console.log("[QB_SUPPORT][bg-message]", {
      type: message.type,
      senderUrl: sender.url ?? null,
      tabId: sender.tab?.id ?? null
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
      handleCdpClick(tabId, message.x, message.y).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "QB_AUTH_GET_TOKEN") {
      const interactive = message.interactive !== false;
      handleAuthTokenRequest(interactive).then((token) => sendResponse({ ok: true, token })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "QB_AUTH_REMOVE_TOKEN") {
      handleAuthTokenRemoval(message.token).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "QB_CHAT_REQUEST") {
      handleChatRequest(message).then((payload) => sendResponse({ ok: true, ...payload })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });
  if (webext.webNavigation?.onCommitted) {
    webext.webNavigation.onCommitted.addListener((details) => {
      if (!details.url) return;
      if (!details.url.includes("accounts.google.com") && !details.url.includes(".chromiumapp.org/")) {
        return;
      }
      console.log("[QB_SUPPORT][webnav]", {
        event: "committed",
        tabId: details.tabId,
        frameId: details.frameId,
        url: details.url
      });
    });
  }
  if (webext.webNavigation?.onCompleted) {
    webext.webNavigation.onCompleted.addListener((details) => {
      if (!details.url) return;
      if (!details.url.includes("accounts.google.com") && !details.url.includes(".chromiumapp.org/")) {
        return;
      }
      console.log("[QB_SUPPORT][webnav]", {
        event: "completed",
        tabId: details.tabId,
        frameId: details.frameId,
        url: details.url
      });
    });
  }
  webext.runtime?.onConnect?.addListener((port) => {
    if (port.name !== "qb-chat") return;
    port.onMessage.addListener((message) => {
      if (!message || message.type !== "QB_CHAT_STREAM_REQUEST") return;
      handleChatStream(port, message).catch((error) => {
        port.postMessage({
          type: "QB_CHAT_STREAM_ERROR",
          requestId: message.requestId ?? "unknown",
          error: error.message
        });
      });
    });
  });
  async function handleCdpClick(tabId, x, y) {
    await attachDebugger(tabId);
    await sendMouseEvent(tabId, "mouseMoved", x, y, 0);
    await sendMouseEvent(tabId, "mousePressed", x, y, 1);
    await sendMouseEvent(tabId, "mouseReleased", x, y, 1);
  }
  function attachDebugger(tabId) {
    if (!webext.debugger) return Promise.reject(new Error("Debugger API not available"));
    if (ATTACHED_TABS.has(tabId)) return Promise.resolve();
    return new Promise((resolve, reject) => {
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
  function sendMouseEvent(tabId, type, x, y, buttons) {
    if (!webext.debugger) return Promise.reject(new Error("Debugger API not available"));
    return new Promise((resolve, reject) => {
      webext.debugger?.sendCommand(
        { tabId },
        "Input.dispatchMouseEvent",
        {
          type,
          x,
          y,
          button: "left",
          buttons,
          clickCount: 1
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
  function resolveBackendChatUrl(base) {
    return resolveBackendEndpoint(base, "chat");
  }
  function resolveBackendStreamUrl(base) {
    return resolveBackendEndpoint(base, "chat/stream");
  }
  function resolveBackendEndpoint(base, suffix) {
    const trimmed = base.trim();
    if (!trimmed) return null;
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) {
      path = `/${suffix}`;
    } else if (path.endsWith(`/${suffix}`)) {
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
  function getOAuthClientId() {
    const manifest = webext.runtime?.getManifest?.();
    if (!manifest?.oauth2?.client_id) return null;
    return manifest.oauth2.client_id;
  }
  function buildOAuthUrl(identity) {
    const clientId = getOAuthClientId();
    if (!clientId) {
      throw new Error(
        "manifest.json \u306B oauth2.client_id \u304C\u3042\u308A\u307E\u305B\u3093\u3002Google Cloud Console \u3067 OAuth \u30AF\u30E9\u30A4\u30A2\u30F3\u30C8ID\u3092\u4F5C\u6210\u3057\u3066\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
      );
    }
    const redirectUri = identity.getRedirectURL("qb-support-auth");
    const state = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  function withAuthTimeout(promise, label, timeoutMs = AUTH_METHOD_TIMEOUT_MS) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        console.warn(AUTH_LOG_PREFIX, `${label} timed out`);
        if (label === "getAuthToken") {
          console.warn(AUTH_LOG_PREFIX, "Atlas\u975E\u5BFE\u5FDC\u306E\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002");
        }
        reject(new Error(`${label} timed out`));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }
  function getAuthTimeout(interactive) {
    return interactive ? AUTH_INTERACTIVE_TIMEOUT_MS : AUTH_METHOD_TIMEOUT_MS;
  }
  async function launchWebAuthFlowToken(identity, interactive) {
    if (!identity.launchWebAuthFlow) {
      throw new Error("chrome.identity.launchWebAuthFlow is not available.");
    }
    const url = buildOAuthUrl(identity);
    console.log(AUTH_LOG_PREFIX, "launchWebAuthFlow:start", { url });
    return new Promise((resolve, reject) => {
      identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
        const err = webext.runtime?.lastError;
        console.log(AUTH_LOG_PREFIX, "launchWebAuthFlow:callback", {
          redirectUrl: redirectUrl ?? null,
          lastError: err?.message ?? null
        });
        if (err?.message) {
          reject(new Error(err.message));
          return;
        }
        if (!redirectUrl) {
          reject(new Error("OAuth redirect URL was not returned."));
          return;
        }
        let parsed;
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
  async function handleAuthTokenRequest(interactive) {
    const identity = webext.identity;
    if (!identity) throw new Error("chrome.identity API not available.");
    console.log(AUTH_LOG_PREFIX, "token request", {
      interactive,
      launchWebAuthFlow: Boolean(identity.launchWebAuthFlow),
      getAuthToken: Boolean(identity.getAuthToken)
    });
    const methodTimeout = getAuthTimeout(interactive);
    if (identity.getAuthToken) {
      try {
        console.log(AUTH_LOG_PREFIX, "getAuthToken:start");
        const token = await withAuthTimeout(
          new Promise((resolve, reject) => {
            identity.getAuthToken({ interactive }, (token2) => {
              const err = webext.runtime?.lastError;
              console.log(AUTH_LOG_PREFIX, "getAuthToken:callback", {
                tokenPresent: Boolean(token2),
                lastError: err?.message ?? null
              });
              if (err?.message) {
                reject(new Error(err.message));
                return;
              }
              if (!token2) {
                reject(new Error("OAuth token was not returned."));
                return;
              }
              resolve(token2);
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
  async function handleAuthTokenRemoval(token) {
    const identity = webext.identity;
    if (!identity?.removeCachedAuthToken) return;
    if (!token) return;
    await new Promise((resolve, reject) => {
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
  async function handleChatRequest(message) {
    const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
    const backendBaseUrl = typeof message.backendUrl === "string" ? message.backendUrl.trim() : "";
    const authToken = typeof message.authToken === "string" ? message.authToken.trim() : "";
    const backendUrl = backendBaseUrl ? resolveBackendChatUrl(backendBaseUrl) : "";
    const useBackend = !apiKey && Boolean(backendUrl && authToken);
    if (!apiKey && !useBackend) throw new Error("API key is not set.");
    const requestedModel = typeof message.model === "string" && message.model ? message.model : "gpt-5-mini";
    const model = requestedModel;
    const messages = Array.isArray(message.messages) ? message.messages : [];
    const supportsTemperature = model === "gpt-5.2";
    const payload = {
      model,
      messages
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
          Authorization: `Bearer ${useBackend ? authToken : apiKey}`
        },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from API.");
    return { text, usage: data.usage ?? null };
  }
  async function handleChatStream(port, message) {
    const requestId = message.requestId;
    const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
    const backendBaseUrl = typeof message.backendUrl === "string" ? message.backendUrl.trim() : "";
    const authToken = typeof message.authToken === "string" ? message.authToken.trim() : "";
    const backendUrl = backendBaseUrl ? resolveBackendStreamUrl(backendBaseUrl) : "";
    const useBackend = !apiKey && Boolean(backendUrl && authToken);
    if (!apiKey && !useBackend) throw new Error("API key is not set.");
    const requestedModel = typeof message.model === "string" && message.model ? message.model : "gpt-5-mini";
    const model = requestedModel;
    const input = message.input ?? [];
    const instructions = typeof message.instructions === "string" ? message.instructions.trim() : "";
    const previousResponseId = typeof message.previousResponseId === "string" && message.previousResponseId ? message.previousResponseId : null;
    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());
    const payload = {
      model,
      instructions: instructions || void 0,
      input,
      previous_response_id: previousResponseId ?? void 0,
      stream: true,
      store: true
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
          Authorization: `Bearer ${useBackend ? authToken : apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
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
    let responseId = null;
    let usage = null;
    const flush = (chunk, isFinal = false) => {
      buffer += chunk;
      const parts = buffer.split("\n\n");
      if (!isFinal) {
        buffer = parts.pop() ?? "";
      } else {
        buffer = "";
      }
      for (const part of parts) {
        const lines = part.split("\n");
        const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.replace(/^data:\s?/, "").trim()).filter(Boolean);
        if (!dataLines.length) continue;
        const data = dataLines.join("");
        if (data === "[DONE]") {
          port.postMessage({ type: "QB_CHAT_STREAM_DONE", requestId, responseId, usage });
          return;
        }
        let payload2;
        try {
          payload2 = JSON.parse(data);
        } catch {
          continue;
        }
        if (payload2?.type === "response.output_text.delta") {
          const delta = typeof payload2.delta === "string" ? payload2.delta : typeof payload2.text === "string" ? payload2.text : "";
          if (delta) {
            port.postMessage({ type: "QB_CHAT_STREAM_DELTA", requestId, delta });
          }
        }
        if (payload2?.type === "response.completed") {
          responseId = payload2.response?.id ?? payload2.id ?? responseId;
          usage = payload2.response?.usage ?? payload2.usage ?? usage;
        }
        if (payload2?.type === "response.created") {
          responseId = payload2.response?.id ?? payload2.id ?? responseId;
        }
        if (payload2?.error?.message) {
          throw new Error(payload2.error.message);
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
})();
