import type { ChatDock, PanelPosition, Settings } from "./types";

const MODIFIER_LABELS = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_LABELS)[number]> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
};

export const defaultSettings: Settings = {
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
  chatModel: "gpt-4o-mini",
};

export function normalizeSettings(
  input: (Partial<Settings> & { noteHeaderVisible?: boolean }) | undefined
): Settings {
  if (!input) return { ...defaultSettings };
  const legacyNoteVisible =
    typeof input.noteHeaderVisible === "boolean" ? input.noteHeaderVisible : undefined;
  const optionKeys =
    Array.isArray(input.optionKeys) && input.optionKeys.length > 0
      ? input.optionKeys.map((key) => normalizeSingleKey(key)).filter(Boolean)
      : defaultSettings.optionKeys;
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaultSettings.enabled,
    shortcutsEnabled:
      typeof input.shortcutsEnabled === "boolean"
        ? input.shortcutsEnabled
        : defaultSettings.shortcutsEnabled,
    debugEnabled:
      typeof input.debugEnabled === "boolean"
        ? input.debugEnabled
        : defaultSettings.debugEnabled,
    noteVisible:
      typeof input.noteVisible === "boolean"
        ? input.noteVisible
        : legacyNoteVisible ?? defaultSettings.noteVisible,
    searchVisible:
      typeof input.searchVisible === "boolean"
        ? input.searchVisible
        : defaultSettings.searchVisible,
    navPrevKey: normalizeSingleKey(input.navPrevKey) || defaultSettings.navPrevKey,
    navNextKey: normalizeSingleKey(input.navNextKey) || defaultSettings.navNextKey,
    revealKey: normalizeSingleKey(input.revealKey) || defaultSettings.revealKey,
    optionKeys,
    position: isPosition(input.position) ? input.position : defaultSettings.position,
    shortcut: normalizeShortcut(input.shortcut) || defaultSettings.shortcut,
    chatOpen: typeof input.chatOpen === "boolean" ? input.chatOpen : defaultSettings.chatOpen,
    chatDock: isChatDock(input.chatDock) ? input.chatDock : defaultSettings.chatDock,
    chatApiKey:
      typeof input.chatApiKey === "string"
        ? input.chatApiKey.trim()
        : defaultSettings.chatApiKey,
    chatModel:
      typeof input.chatModel === "string" && input.chatModel.trim()
        ? input.chatModel.trim()
        : defaultSettings.chatModel,
  };
}

function normalizeSingleKey(input?: string | null): string {
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

export function normalizeShortcut(input: string | undefined | null): string {
  if (!input) return "";
  const parts = input
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  const modifiers = new Set<(typeof MODIFIER_LABELS)[number]>();
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

export function shortcutFromEvent(event: KeyboardEvent): string {
  const modifiers = MODIFIER_LABELS.filter((label) => {
    if (label === "Ctrl") return event.ctrlKey;
    if (label === "Alt") return event.altKey;
    if (label === "Shift") return event.shiftKey;
    if (label === "Meta") return event.metaKey;
    return false;
  });

  const key = normalizeKeyLabel(event.key);
  if (!key || key === "Ctrl" || key === "Alt" || key === "Shift" || key === "Meta") {
    return "";
  }
  return [...modifiers, key].join("+");
}

export function isShortcutMatch(event: KeyboardEvent, shortcut: string): boolean {
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

function normalizeKeyLabel(raw: string): string {
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

function isPosition(value: unknown): value is PanelPosition {
  return (
    value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
  );
}

function isChatDock(value: unknown): value is ChatDock {
  return value === "left" || value === "right";
}
