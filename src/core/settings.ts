import type {
  ChatDock,
  ChatTemplateSetting,
  ExplanationLevel,
  PanelPosition,
  Settings,
} from "./types";

const MODIFIER_LABELS = ["Ctrl", "Alt", "Shift", "Meta"] as const;
export const CHAT_MODEL_OPTIONS = [
  "gpt-5.2",
  "gpt-5.2-chat-latest",
  "gpt-5",
  "gpt-4.1",
  "gpt-4o",
] as const;
const CHAT_TEMPLATE_LIMIT = 5;
const DEFAULT_EXPLANATION_PROMPTS: Record<ExplanationLevel, string> = {
  highschool:
    "高校生でもわかるように、専門用語はできるだけ避け、必要なら簡単な言い換えと短い例えを添えて説明してください。",
  "med-junior":
    "医学部低学年向けに、基本的な専門用語は使ってよいので、重要ポイントを簡潔に整理して説明してください。",
  "med-senior":
    "医学部高学年〜研修医レベルで、病態生理や鑑別ポイントに踏み込み、簡潔だが密度の高い説明にしてください。",
};
const DEFAULT_CHAT_TEMPLATES: ChatTemplateSetting[] = [
  {
    enabled: true,
    label: "ヒント",
    shortcut: "Ctrl+Z",
    prompt:
      "絶妙なヒント（答えありきでなく、所見や症状から推論する視点で思考力を養う答えに迫りすぎないもの）をどうぞ。",
  },
  {
    enabled: true,
    label: "4箇条",
    shortcut: "Ctrl+4",
    prompt: [
      "各々の選択肢について、以下の4箇条を守ってわかりやすく解説してください。",
      "",
      "❶ 一言でいうと？（直感的なイメージ）",
      "",
      "その病態・症状・所見について、初めて聞いた人でも直感的に理解できるような、具体的なイメージや比喩を一文で表現する（基本的に体言止め）。専門用語や厳密な定義ではなく、「なるほど、そういう感じか」とイメージが湧く表現を心がける。",
      "",
      "例（裂肛の場合）：",
      "✅ 「硬い便で肛門が“紙のようにピリッと裂ける”」",
      "❌ 「裂肛の多くは後方正中にできる」（具体性やイメージが不足）",
      "",
      "❷ 因果関係スタイル（Pathophysiologyの連鎖）",
      "",
      "診断に至る思考プロセスではなく、病態そのものが体内で引き起こす現象の連鎖を時系列・因果関係順に示す。キーワードを「↓→」で結び、生体内で実際に起きている内容・症状・所見を順序立てて表現する。",
      "",
      "例（ASO発症機序）：",
      "糖尿病・高血圧・高脂血症・喫煙などの動脈硬化リスク↑",
      "↓",
      "中〜大動脈（主に下肢動脈）で動脈硬化性プラーク形成（脂質核＋線維性被膜）",
      "↓",
      "管腔狭窄 → 安静時は血流保たれるが、運動時は需要＞供給に",
      "↓",
      "下肢の間欠性跛行（claudication）、さらには安静時痛へと進行",
      "↓",
      "血流不足が高度化 → 末梢潰瘍（足趾先端など）・皮膚萎縮・壊疽",
      "↓",
      "夜間や足挙上時に血流がさらに低下 → 安静時痛が悪化 → 足を垂らして寝ると楽になる",
      "",
      "❸ 情報を落とさない",
      "",
      "問題文に記載されている臨床情報（症状、所見、誘因、背景など）は必ず因果関係スタイル内に適切に組み込む。追加の補足情報を入れることは可能だが、元の問題文の情報を削除しないよう注意する。",
      "",
      "❹ 正解選択肢をえこひいきしない",
      "",
      "すべての選択肢に対して、同じレベルの詳細さと明確さで解説を行う。ただし、問題文の所見や症状が明らかに正解選択肢の病態に関連する場合、それらは正解選択肢の因果関係スタイルに明示的に組み込む。",
      "",
      "⸻",
      "",
      "以下は改善後の具体例です。",
      "",
      "✅ 正解：F. Posterior midline of the anal verge",
      "",
      "❶ 一言でいうと？",
      "",
      "硬い便が「紙を破るように」肛門の後ろ側を裂いてしまう",
      "",
      "❷ 因果関係スタイル",
      "",
      "慢性便秘・硬便",
      "↓",
      "肛門部への過度な張力と伸展",
      "↓",
      "肛門粘膜が裂ける（特に後方正中は血流が少なく弱い）",
      "↓",
      "裂肛形成",
      "＋",
      "肛門括約筋のけいれん → 裂創の治癒が遅れ、強い痛み",
      "",
      "❸ 情報を落とさない",
      "• 裂肛は歯状線より遠位（皮膚寄り）の縦方向の裂創",
      "• 硬便の通過、慢性便秘、過度の伸展が誘因となる",
      "• 後方正中が血流不足のため最も起こりやすい",
      "• 鮮血便（トイレットペーパーに付着）と排便時の鋭い痛みが典型的な症状",
      "",
      "（他の選択肢についても同様の基準で説明）",
    ].join("\n"),
  },
  {
    enabled: true,
    label: "統合",
    shortcut: "Ctrl+T",
    prompt: [
      "統合因果関係スタイル(正解選択肢を中心にして、所見や症状などをすべて盛り込んだ巨大な１つのフローチャート。当然箇条書きではないので番号をふるなど不要。→↓で因果列、時系列にキーワードを結んだ忠実な図を作成。以下は一例(本当はこの2倍程度の分量を期待します。可能なら他の選択肢で言及されている内容を矛盾なく結合させて。)",
      "例（ASO）：",
      "糖尿病・高血圧・高脂血症・喫煙などの動脈硬化リスク↑",
      "↓",
      "中〜大動脈（主に下肢動脈）で動脈硬化性プラーク形成（脂質核＋線維性被膜）",
      "↓",
      "管腔狭窄 → 安静時は血流保たれるが、運動時は需要＞供給に",
      "↓",
      "下肢の間欠性跛行（claudication）、さらには安静時痛へと進行",
      "↓",
      "血流不足が高度化 → 末梢潰瘍（足趾先端など）・皮膚萎縮・壊疽",
      "↓",
      "夜間や足挙上時に血流がさらに低下 → 安静時痛が悪化 → 足を垂らして寝ると楽になる",
    ].join("\n"),
  },
  {
    enabled: false,
    label: "テンプレ4",
    shortcut: "",
    prompt: "",
  },
  {
    enabled: false,
    label: "テンプレ5",
    shortcut: "",
    prompt: "",
  },
];
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
  revealKey: "Ctrl+S",
  optionKeys: ["A", "B", "C", "D", "E"],
  position: "bottom-right",
  shortcut: "Alt+Q",
  chatOpen: false,
  chatDock: "right",
  chatApiKey: "",
  chatModel: "gpt-5.2",
  chatTemplates: DEFAULT_CHAT_TEMPLATES,
  explanationLevel: "med-junior",
  explanationPrompts: DEFAULT_EXPLANATION_PROMPTS,
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
    revealKey: normalizeShortcut(input.revealKey) || defaultSettings.revealKey,
    optionKeys,
    position: isPosition(input.position) ? input.position : defaultSettings.position,
    shortcut: normalizeShortcut(input.shortcut) || defaultSettings.shortcut,
    chatOpen: typeof input.chatOpen === "boolean" ? input.chatOpen : defaultSettings.chatOpen,
    chatDock: isChatDock(input.chatDock) ? input.chatDock : defaultSettings.chatDock,
    chatApiKey:
      typeof input.chatApiKey === "string"
        ? input.chatApiKey.trim()
        : defaultSettings.chatApiKey,
    chatModel: normalizeChatModel(input.chatModel) ?? defaultSettings.chatModel,
    chatTemplates: normalizeChatTemplates(input.chatTemplates),
    explanationLevel: isExplanationLevel(input.explanationLevel)
      ? input.explanationLevel
      : defaultSettings.explanationLevel,
    explanationPrompts: normalizeExplanationPrompts(input.explanationPrompts),
  };
}

function normalizeChatModel(input?: string | null): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return CHAT_MODEL_OPTIONS.includes(trimmed as (typeof CHAT_MODEL_OPTIONS)[number])
    ? trimmed
    : null;
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

function normalizeChatTemplates(input: unknown): ChatTemplateSetting[] {
  const safeDefaults = DEFAULT_CHAT_TEMPLATES.map((template) => ({ ...template }));
  if (!Array.isArray(input)) return safeDefaults;

  const next: ChatTemplateSetting[] = [];
  const count = Math.min(input.length, CHAT_TEMPLATE_LIMIT);
  for (let i = 0; i < count; i += 1) {
    const fallback = safeDefaults[i] ?? {
      enabled: false,
      label: `テンプレ${i + 1}`,
      shortcut: "",
      prompt: "",
    };
    const raw = input[i] as Partial<ChatTemplateSetting> | null | undefined;
    const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : fallback.enabled;
    const label =
      typeof raw?.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : fallback.label;
    const shortcut = normalizeShortcut(raw?.shortcut ?? "") || fallback.shortcut || "";
    const prompt = typeof raw?.prompt === "string" ? raw.prompt : fallback.prompt;
    next.push({ enabled, label, shortcut, prompt });
  }

  for (let i = next.length; i < CHAT_TEMPLATE_LIMIT; i += 1) {
    next.push(
      safeDefaults[i] ?? { enabled: false, label: `テンプレ${i + 1}`, shortcut: "", prompt: "" }
    );
  }

  return next;
}

function isExplanationLevel(input?: string | null): input is ExplanationLevel {
  return input === "highschool" || input === "med-junior" || input === "med-senior";
}

function normalizeExplanationPrompts(input: unknown): Record<ExplanationLevel, string> {
  const fallback = { ...DEFAULT_EXPLANATION_PROMPTS };
  if (!input || typeof input !== "object") return fallback;
  const raw = input as Partial<Record<ExplanationLevel, string>>;
  return {
    highschool:
      typeof raw.highschool === "string" && raw.highschool.trim()
        ? raw.highschool.trim()
        : fallback.highschool,
    "med-junior":
      typeof raw["med-junior"] === "string" && raw["med-junior"].trim()
        ? raw["med-junior"].trim()
        : fallback["med-junior"],
    "med-senior":
      typeof raw["med-senior"] === "string" && raw["med-senior"].trim()
        ? raw["med-senior"].trim()
        : fallback["med-senior"],
  };
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
