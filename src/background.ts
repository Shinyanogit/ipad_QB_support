import { webext } from "./lib/webext";

const ATTACHED_TABS = new Set<number>();

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
    handleCdpClick(tabId, message.x, message.y)
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

async function handleChatRequest(message: {
  apiKey?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
}) {
  const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
  if (!apiKey) throw new Error("API key is not set.");
  const model =
    typeof message.model === "string" && message.model ? message.model : "gpt-4o-mini";
  const messages = Array.isArray(message.messages) ? message.messages : [];
  const supportsTemperature = model === "gpt-5.2";

  const payload: Record<string, unknown> = {
    model,
    messages,
  };
  if (supportsTemperature) {
    payload.temperature = 0.2;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

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
    model?: string;
    input?: unknown;
    instructions?: string;
    previousResponseId?: string | null;
  }
) {
  const requestId = message.requestId;
  const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
  if (!apiKey) throw new Error("API key is not set.");
  const model =
    typeof message.model === "string" && message.model ? message.model : "gpt-4o-mini";
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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

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
