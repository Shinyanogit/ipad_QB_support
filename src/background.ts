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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
    }),
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
