export type PanelPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface QuestionInfo {
  id: string | null;
  progressText: string | null;
  pageRef: string | null;
  optionCount: number | null;
  tags: string[];
  updatedAt: number;
}

export interface QuestionSnapshot {
  id: string | null;
  url: string;
  questionText: string | null;
  optionTexts: string[];
  progressText: string | null;
  pageRef: string | null;
  tags: string[];
  updatedAt: number;
}

export type ChatDock = "left" | "right";

export interface Settings {
  enabled: boolean;
  shortcutsEnabled: boolean;
  debugEnabled: boolean;
  noteVisible: boolean;
  searchVisible: boolean;
  navPrevKey: string;
  navNextKey: string;
  revealKey: string;
  optionKeys: string[];
  position: PanelPosition;
  shortcut: string;
  chatOpen: boolean;
  chatDock: ChatDock;
  chatApiKey: string;
  chatModel: string;
}
