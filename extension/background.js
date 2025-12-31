"use strict";
(() => {
  // src/background.ts
  var ATTACHED_TABS = /* @__PURE__ */ new Set();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "QB_CDP_CLICK") return;
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "Missing tabId" });
      return;
    }
    handleCdpClick(tabId, message.x, message.y).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
  async function handleCdpClick(tabId, x, y) {
    await attachDebugger(tabId);
    await sendMouseEvent(tabId, "mouseMoved", x, y, 0);
    await sendMouseEvent(tabId, "mousePressed", x, y, 1);
    await sendMouseEvent(tabId, "mouseReleased", x, y, 1);
  }
  function attachDebugger(tabId) {
    if (ATTACHED_TABS.has(tabId)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        ATTACHED_TABS.add(tabId);
        resolve();
      });
    });
  }
  function sendMouseEvent(tabId, type, x, y, buttons) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(
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
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        }
      );
    });
  }
})();
