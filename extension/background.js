"use strict";
(() => {
  // src/lib/webext.ts
  var globalApi = globalThis;
  var webext = globalApi.browser ?? globalApi.chrome ?? {};

  // src/background.ts
  var ATTACHED_TABS = /* @__PURE__ */ new Set();
  webext.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;
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
    if (message.type === "QB_CHAT_REQUEST") {
      handleChatRequest(message).then((payload) => sendResponse({ ok: true, ...payload })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });
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
  async function handleChatRequest(message) {
    const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
    if (!apiKey) throw new Error("API key is not set.");
    const model = typeof message.model === "string" && message.model ? message.model : "gpt-4o-mini";
    const messages = Array.isArray(message.messages) ? message.messages : [];
    const supportsTemperature = model === "gpt-5.2";
    const payload = {
      model,
      messages
    };
    if (supportsTemperature) {
      payload.temperature = 0.2;
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
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
    if (!apiKey) throw new Error("API key is not set.");
    const model = typeof message.model === "string" && message.model ? message.model : "gpt-4o-mini";
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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
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
