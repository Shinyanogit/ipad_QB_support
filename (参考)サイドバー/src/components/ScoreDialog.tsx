import React from "react";

type Grade = "A" | "B" | "C" | "D" | "E";
export interface ScoreResult {
  content: Grade;
  attitude: Grade;
  english: Grade;
  overall: Grade;
  reasons?: Partial<Record<"content" | "attitude" | "english" | "overall", string>>;
  metrics?: Record<string, any>;
  timestamp: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  result: ScoreResult | null;
  awaiting: boolean;
  failed: boolean;
  fallback: boolean;
}

const ScoreDialog: React.FC<Props> = ({ open, onClose, result, awaiting, failed, fallback }) => {
  if (!open) return null;
  return (
    <div className="call-modal" role="dialog" aria-modal="true" aria-label="採点結果">
      <div className="call-modal-content">
        <div className="call-modal-header">
          <div>
            <h2>採点結果</h2>
            <p className="call-subtitle">会話の終了時点での評価</p>
          </div>
          <button type="button" className="call-modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        {awaiting && !result ? (
          <div className="call-section">
            <p className="call-hint">採点結果を取得しています…</p>
          </div>
        ) : result ? (
          <div className="call-section">
            <h3>総合評価: <span className={`grading-overall-grade grade-${result.overall.toLowerCase()}`}>{result.overall}</span></h3>
            <ul className="grading-checklist">
              <li>内容: {result.content} {result.reasons?.content ? `— ${result.reasons.content}` : ""}</li>
              <li>態度: {result.attitude} {result.reasons?.attitude ? `— ${result.reasons.attitude}` : ""}</li>
              <li>英語: {result.english} {result.reasons?.english ? `— ${result.reasons.english}` : ""}</li>
            </ul>
            {fallback && (
              <p className="call-hint">※ Realtime API に接続できなかったため、ローカル採点を表示しています。</p>
            )}
          </div>
        ) : failed ? (
          <div className="call-section">
            <p className="call-hint">最終採点を取得できませんでした。ネットワークやAPIの設定をご確認ください。</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ScoreDialog;
