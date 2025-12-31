import React, { useEffect, useMemo, useState } from "react";

type TranscriptEntry = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
};

type FeedbackEntry = {
  id: string;
  provider: "openai" | "gemini" | "local";
  text: string;
  timestamp: number;
  utterance?: string;
  utteranceTimestamp?: number;
  utteranceId?: string;
};

type Grade = "A" | "B" | "C" | "D" | "E";

function gradeToNumber(g: Grade): number {
  return { A: 5, B: 4, C: 3, D: 2, E: 1 }[g];
}
function numberToGrade(n: number): Grade {
  if (n >= 4.5) return "A";
  if (n >= 3.5) return "B";
  if (n >= 2.5) return "C";
  if (n >= 1.5) return "D";
  return "E";
}

function detectOpenQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /what brings you (in|here)/.test(t) ||
    /tell me more/.test(t) ||
    /could you tell me/.test(t) ||
    /can you tell me/.test(t) ||
    /how can i help/.test(t) ||
    /what happened/.test(t) ||
    /what seems to be/.test(t)
  );
}

function analyzeContent(transcript: TranscriptEntry[]) {
  const userTexts = transcript
    .filter((e) => e.role === "user")
    .map((e) => e.text)
    .join("\n");
  const lines = userTexts.split(/\n+/);

  const patt = (re: RegExp) => lines.some((l) => re.test(l.toLowerCase()));

  // 1) Patient full name asked
  const askedName = patt(/(what is|could you tell me|may i have).*(your ).*(full )?name/);

  // 2) Open question asked
  const askedOpen = lines.some((l) => detectOpenQuestion(l));

  // 3) "anything else" check
  const askedAnythingElse = patt(/(anything|something) else|did i miss anything|any other (concern|issue|questions?)/);

  // 4) Summary + confirmation
  const didSummary = patt(/(let me|allow me).*(summaris|summariz)|just to (confirm|make sure)|if i (understood|understand)/);

  // Coverage of core history domains
  const coverageSignals = [
    /(when|since|how long)/, // time/onset/duration
    /(where|location|radiat)/, // location/radiation
    /(how (bad|severe)|severity|\bscale\b|rate.*(pain|discomfort))/,
    /(character|what kind|quality)/,
    /(associated|other) symptoms|伴う|together with/,
    /past medical|history of|previous( illnesses| conditions)/,
    /medications?|drugs? you take|prescriptions?/,
    /allerg(y|ies)/,
    /social history|smok(e|ing)|alcohol|drink|work|occupation|sex(ual)? history/,
    /family history/,
  ];
  const coverageMatched = coverageSignals.reduce((acc, re) => acc + (patt(re) ? 1 : 0), 0);
  const coverageTotal = coverageSignals.length;
  const coverageRate = coverageTotal === 0 ? 0 : coverageMatched / coverageTotal;

  // Simple auto-suggest grade for Content
  // Base 0.4 on coverage, 0.6 on key checkpoints achieved
  const checkpoints = [askedName, askedOpen, askedAnythingElse, didSummary];
  const checkpointRate = checkpoints.filter(Boolean).length / checkpoints.length;
  const contentScore = 0.6 * checkpointRate + 0.4 * coverageRate; // 0..1
  const suggestedContent: Grade = numberToGrade(contentScore * 5);

  return {
    askedName,
    askedOpen,
    askedAnythingElse,
    didSummary,
    coverageMatched,
    coverageTotal,
    coverageRate,
    suggestedContent,
  };
}

function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState] as const;
}

interface ScoreResult {
  content: Grade;
  attitude: Grade;
  english: Grade;
  overall: Grade;
  reasons?: Partial<Record<"content" | "attitude" | "english" | "overall", string>>;
  metrics?: Record<string, any>;
  timestamp: number;
}

interface ScoringPanelProps {
  transcriptEntries: TranscriptEntry[];
  feedbackEntries: FeedbackEntry[];
  scenarioTitle?: string;
  scoreResult?: ScoreResult | null;
}

const ScoringPanel: React.FC<ScoringPanelProps> = ({
  transcriptEntries,
  feedbackEntries,
  scenarioTitle,
  scoreResult,
}) => {
  const contentAnalysis = useMemo(
    () => analyzeContent(transcriptEntries),
    [transcriptEntries]
  );

  const overall: Grade | null = scoreResult?.overall ?? null;

  const feedbackHints = useMemo(() => {
    const n = feedbackEntries.length;
    if (n >= 10) return "フィードバック件数が多めです。文法・表現の改善余地あり。";
    if (n >= 5) return "表現の改善ポイントがあります。";
    if (n >= 1) return "良好ですが、細かな改善が可能です。";
    return "良好です。";
  }, [feedbackEntries.length]);

  return (
    <div className="call-section">
      <h3>採点</h3>
      {scenarioTitle && (
        <p className="call-hint">シナリオ: {scenarioTitle}</p>
      )}

      <div className="grading-grid">
        <div className="grading-col">
          <h4>内容</h4>
          <ul className="grading-checklist">
            <li>
              <input type="checkbox" readOnly checked={contentAnalysis.askedName} />
              <span>患者のフルネームを確認した</span>
            </li>
            <li>
              <input type="checkbox" readOnly checked={contentAnalysis.askedOpen} />
              <span>開放型質問で情報を引き出した</span>
            </li>
            <li>
              <input
                type="checkbox"
                readOnly
                checked={contentAnalysis.askedAnythingElse}
              />
              <span>聞き漏らしの有無を確認した</span>
            </li>
            <li>
              <input type="checkbox" readOnly checked={contentAnalysis.didSummary} />
              <span>最後に簡潔にまとめて確認した</span>
            </li>
          </ul>
          <p className="call-hint">
            臨床面接の網羅率: {contentAnalysis.coverageMatched}/
            {contentAnalysis.coverageTotal}（{Math.round(
              contentAnalysis.coverageRate * 100
            )}
            %）
          </p>
          <p className="call-hint">
            参考（自動推定）: {contentAnalysis.suggestedContent}
          </p>
          <p className="call-field-label">AI評定: {scoreResult?.content ?? "未採点"}</p>
          {scoreResult?.reasons?.content && (
            <p className="call-hint">理由: {scoreResult.reasons.content}</p>
          )}
        </div>

        <div className="grading-col">
          <h4>態度</h4>
          <ul className="grading-checklist">
            <li>声量・スピード・音調が適切</li>
            <li>積極的傾聴（開放型質問の活用含む）</li>
            <li>言葉がけ・うなずき・間の取り方が適切</li>
            <li>話を遮らない・過剰な相槌をしない</li>
            <li>言い換え・繰り返しで理解を確認</li>
            <li>必要に応じてメモを取る</li>
            <li>共感を言葉と態度で示す</li>
          </ul>
          <p className="call-field-label">AI評定: {scoreResult?.attitude ?? "未採点"}</p>
          {scoreResult?.reasons?.attitude && (
            <p className="call-hint">理由: {scoreResult.reasons.attitude}</p>
          )}
        </div>

        <div className="grading-col">
          <h4>英語表現</h4>
          <p className="call-hint">採点観点: 文法・発音・自然なコロケーション</p>
          <p className="call-hint">自動フィードバック件数: {feedbackEntries.length}</p>
          <p className="call-hint">ヒント: {feedbackHints}</p>
          <p className="call-field-label">AI評定: {scoreResult?.english ?? "未採点"}</p>
          {scoreResult?.reasons?.english && (
            <p className="call-hint">理由: {scoreResult.reasons.english}</p>
          )}
        </div>
      </div>

      <div className="grading-overall">
        <span className="grading-overall-label">総合評価:</span>
        {overall ? (
          <span className={`grading-overall-grade grade-${overall.toLowerCase()}`}>
            {overall}
          </span>
        ) : (
          <span className="call-hint">未採点</span>
        )}
        {scoreResult?.reasons?.overall && (
          <span className="call-hint">理由: {scoreResult.reasons.overall}</span>
        )}
      </div>
    </div>
  );
};

export default ScoringPanel;
