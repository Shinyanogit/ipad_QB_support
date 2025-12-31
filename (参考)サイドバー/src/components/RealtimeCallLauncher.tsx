import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useRealtimeCall, {
  RealtimeProvider,
} from "../hooks/useRealtimeCall";
import ScoringPanel from "./ScoringPanel";
import ScoreDialog from "./ScoreDialog";
import { symptomCategories } from "../data/patientScenarios";

const PROVIDER_OPTIONS: Array<{
  id: RealtimeProvider;
  label: string;
  description: string;
}> = [
  {
    id: "openai",
    label: "ChatGPT Realtime mini",
    description: "OpenAI Realtime API を利用します。",
  },
  {
    id: "gemini",
    label: "Gemini Live 2.5 Flash",
    description: "Google Gemini Live API を利用します。",
  },
];

const STATUS_LABEL: Record<string, string> = {
  idle: "未接続",
  connecting: "接続中…",
  connected: "通話中",
  ending: "終了処理中…",
  error: "エラー",
};

const RealtimeCallLauncher: React.FC = () => {
  const [open, setOpen] = useState(false);

  const {
    provider,
    status,
    error,
    remoteStream,
    localStream,
    systemPrompt,
    startCall,
    stopCall,
    setProvider,
    setSystemPrompt,
    hasApiKey,
    setApiKey,
    getApiKey,
    clearError,
    feedbackEntries,
    transcriptEntries,
    scoreResult,
    endedWithoutScore,
    awaitingFinalScore,
    feedbackFallbackActive,
    scoreFallbackActive,
    availableScenarios,
    scenarioId,
    setScenarioId,
    activeScenario,
    requestScoring,
    pendingAssistantText,
  } = useRealtimeCall();
  const isCallActive =
    status === "connecting" || status === "connected" || status === "ending";
  const [caseDetailsOpen, setCaseDetailsOpen] = useState(false);

  // Wide-screen detection for split (right dock)
  const [isWide, setIsWide] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const w = window.innerWidth;
    const h = window.innerHeight || 1;
    return w / h > 1.2;
  });
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight || 1;
      setIsWide(w / h > 1.2);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  const [dockWidth, setDockWidth] = useState<number>(
    Math.min(520, Math.floor((typeof window !== "undefined" ? window.innerWidth : 1200) * 0.45))
  );
  // Push main document to the left when dock is visible
  useEffect(() => {
    const showDock = (open && isWide) || (isCallActive && isWide);
    if (!showDock) {
      document.body.style.marginRight = "";
      return;
    }
    document.body.style.marginRight = `${dockWidth}px`;
    return () => {
      document.body.style.marginRight = "";
    };
  }, [open, isWide, status, dockWidth]);
  // Show dock when panel is open in landscape, or during call/ending
  const showDock = (open && isWide) || (isCallActive && isWide);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const max = Math.max(320, Math.floor(window.innerWidth * 0.8));
    setDockWidth((w) => Math.min(Math.max(320, w), max));
  }, [isWide]);
  const isResizingRef = useRef(false);
  const startResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isResizingRef.current = true;
    e.preventDefault();
  }, []);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const vw = window.innerWidth;
      const x = e.clientX;
      const newWidth = Math.max(320, Math.min(vw - 200, vw - x));
      setDockWidth(newWidth);
    };
    const onUp = () => {
      isResizingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    const element = audioRef.current;
    if (remoteStream) {
      element.srcObject = remoteStream;
      const play = () => {
        element
          .play()
          .catch((playError) =>
            console.warn("Autoplay prevented for remote stream:", playError)
          );
      };
      if (element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        play();
      } else {
        element.onloadedmetadata = play;
      }
    } else {
      element.pause();
      element.srcObject = null;
    }
  }, [remoteStream]);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  const onProviderChange = useCallback(
    (nextProvider: RealtimeProvider) => {
      clearError();
      setProvider(nextProvider);
    },
    [setProvider, clearError]
  );

  const onConnect = useCallback(async () => {
    await startCall({ provider });
  }, [startCall, provider]);

  const connectDisabled =
    status === "connecting" || !hasApiKey(provider) || status === "connected";
  const hangupDisabled = status !== "connected" && status !== "connecting";

  const activeStatusLabel = useMemo(
    () => STATUS_LABEL[status] || status,
    [status]
  );

  const currentKey = getApiKey(provider);

  const handleKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      clearError();
      setApiKey(provider, event.target.value);
    },
    [provider, setApiKey, clearError]
  );

  const handleScenarioSelect = useCallback(
    (nextScenarioId: string) => {
      clearError();
      setScenarioId(nextScenarioId);
    },
    [clearError, setScenarioId]
  );
  const handleRandomScenario = useCallback(() => {
    if (!availableScenarios.length) return;
    const random =
      availableScenarios[Math.floor(Math.random() * availableScenarios.length)];
    handleScenarioSelect(random.id);
  }, [availableScenarios, handleScenarioSelect]);

  useEffect(() => {
    setCaseDetailsOpen(false);
  }, [scenarioId]);

  const [lastSeenFeedbackCount, setLastSeenFeedbackCount] = useState(0);

  useEffect(() => {
    if (open) {
      setLastSeenFeedbackCount(feedbackEntries.length);
    }
  }, [open, feedbackEntries.length]);

  const unreadFeedbackCount = Math.max(
    0,
    feedbackEntries.length - lastSeenFeedbackCount
  );

  const launcherClassName = [
    "call-launcher",
    status === "connected" ? "is-active" : "",
    unreadFeedbackCount > 0 ? "has-unread" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleHangup = useCallback(() => {
    stopCall();
  }, [stopCall]);

  const formatTimestamp = useCallback((value: number) => {
    const date = new Date(value);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }, []);

  const renderScenarioChooser = () => {
    const caseDetails = activeScenario?.casePresentation;
    const sourceLabel =
      activeScenario?.source?.type === "pdf"
        ? `ロールプレイ資料 ${activeScenario.source.reference ?? ""}`.trim()
        : activeScenario?.source?.type === "custom"
        ? "Custom scenario"
        : undefined;

    return (
      <div className="call-section">
        <h3>シナリオ</h3>
        <p className="call-hint">
          症候カテゴリから診たい症例を選択すると、患者提示と面接のポイントが表示されます。
        </p>
        {!isCallActive && (
          <div className="call-provider-options">
            {PROVIDER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`call-provider-button ${provider === option.id ? "is-active" : ""}`}
                onClick={() => onProviderChange(option.id)}
                aria-pressed={provider === option.id}
              >
                <span className="call-provider-label">{option.label}</span>
                <span className="call-provider-description">{option.description}</span>
              </button>
            ))}
          </div>
        )}
        <div className="call-scenario-actions">
          <button
            type="button"
            className="call-random-button"
            onClick={handleRandomScenario}
          >
            🎲 ランダム出題
          </button>
          <span className="call-scenario-count">
            全{availableScenarios.length}症例
          </span>
        </div>
        <div className="call-symptom-browser">
          {symptomCategories.map((category) => (
            <div key={category.id} className="call-symptom-category">
              <div className="call-symptom-category-header">
                <span className="call-symptom-category-roman">{category.roman}.</span>
                <div>
                  <div className="call-symptom-category-label-ja">{category.labelJa}</div>
                  <div className="call-symptom-category-label-en">{category.labelEn}</div>
                </div>
              </div>
              <div className="call-symptom-list">
                {category.symptoms.map((symptom) => (
                  <button
                    key={symptom.scenarioId}
                    type="button"
                    className={`call-symptom-pill ${scenarioId === symptom.scenarioId ? "is-active" : ""}`}
                    onClick={() => handleScenarioSelect(symptom.scenarioId)}
                    aria-pressed={scenarioId === symptom.scenarioId}
                  >
                    <span className="call-symptom-pill-order">{symptom.order}.</span>
                    <span className="call-symptom-pill-label">
                      <span className="call-symptom-pill-label-ja">{symptom.labelJa}</span>
                      <span className="call-symptom-pill-label-en">{symptom.labelEn}</span>
                      {symptom.variant ? (
                        <span className="call-symptom-pill-variant">({symptom.variant})</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {activeScenario && caseDetails && (
          <div className="call-case-card">
            <button
              type="button"
              className={`call-case-toggle ${caseDetailsOpen ? "is-open" : ""}`}
              onClick={() => setCaseDetailsOpen((prev) => !prev)}
              aria-expanded={caseDetailsOpen}
            >
              <span>症例提示 / Case Presentation</span>
              <span className="call-case-toggle-icon">{caseDetailsOpen ? "▲" : "▼"}</span>
            </button>
            <div className={`call-collapsible ${caseDetailsOpen ? "is-open" : ""}`}>
              <ul className="call-case-list">
                <li>
                  <strong>Patient:</strong>{" "}
                  {`${caseDetails.demographicsJa}${caseDetails.demographicsJa ? " / " : ""}${caseDetails.demographicsEn}`}
                </li>
                <li>
                  <strong>Chief complaint:</strong>{" "}
                  {`${caseDetails.chiefComplaintJa ?? ""}${
                    caseDetails.chiefComplaintJa ? " / " : ""
                  }${caseDetails.chiefComplaintEn}`}
                </li>
                {caseDetails.vitalsJa || caseDetails.vitalsEn ? (
                  <li>
                    <strong>Vitals:</strong>{" "}
                    {`${caseDetails.vitalsJa ?? ""}${caseDetails.vitalsJa ? " / " : ""}${caseDetails.vitalsEn ?? ""}`}
                  </li>
                ) : null}
                {activeScenario.shortSummary ? (
                  <li>
                    <strong>Summary:</strong> {activeScenario.shortSummary}
                  </li>
                ) : null}
              </ul>
              {caseDetails.notesEn && caseDetails.notesEn.length > 0 && (
                <>
                  <p className="call-case-notes-label">Key exam / assessment hints</p>
                  <ul className="call-case-notes">
                    {caseDetails.notesEn.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </>
              )}
              {sourceLabel && <p className="call-case-source">{sourceLabel}</p>}
            </div>
          </div>
        )}
      </div>
    );
  };

  const lastAssistant = useMemo(() => {
    for (let i = transcriptEntries.length - 1; i >= 0; i--) {
      const e = transcriptEntries[i];
      if (e.role === "assistant" && e.text) return e.text;
    }
    return "";
  }, [transcriptEntries]);

  const assistantSubtitle = pendingAssistantText || lastAssistant;
  const providerLabel = useCallback((p: RealtimeProvider | "local") => {
    if (p === "openai") return "OpenAI";
    if (p === "gemini") return "Gemini";
    return "Local";
  }, []);

  const renderLivePanels = () => {
    const hasTranscriptEntries =
      transcriptEntries.length > 0 || Boolean(pendingAssistantText);
    return (
      <div className="call-live-panels">
        <div className="call-section call-live-panel">
          <h3>会話ログ</h3>
          {hasTranscriptEntries ? (
            <div className="call-scroll-block">
              <ul className="call-transcript-list">
                {transcriptEntries.map((entry) => (
                  <li key={entry.id} className="call-transcript-item">
                    <span className="call-transcript-meta">
                      <span className={`call-transcript-role role-${entry.role}`}>
                        {entry.role === "user"
                          ? "医師"
                          : entry.role === "assistant"
                          ? "患者"
                          : "システム"}
                      </span>
                      <time dateTime={new Date(entry.timestamp).toISOString()}>
                        {formatTimestamp(entry.timestamp)}
                      </time>
                    </span>
                    <p className="call-transcript-text">{entry.text}</p>
                  </li>
                ))}
                {pendingAssistantText && (
                  <li className="call-transcript-item">
                    <span className="call-transcript-meta">
                      <span className="call-transcript-role role-assistant">患者</span>
                      <time>{formatTimestamp(Date.now())}</time>
                    </span>
                    <p className="call-transcript-text">{pendingAssistantText}</p>
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <p className="call-hint">
              医師と患者の発話がここに表示されます。接続後に音声で話しかけてください。
            </p>
          )}
        </div>
        <div className="call-section call-live-panel">
          <h3>リアルタイムフィードバック</h3>
          {feedbackEntries.length === 0 ? (
            <p className="call-hint">
              通話中の発話内容に対するフィードバックがここに表示されます。閉じている間も通話と記録は継続します。
            </p>
          ) : (
            <div className="call-scroll-block">
              <ul className="call-feedback-list">
                {feedbackEntries.map((entry) => (
                  <li key={entry.id} className="call-feedback-item">
                    <div className="call-feedback-header">
                      <span className="call-feedback-provider">
                        {providerLabel(entry.provider)}
                      </span>
                      <time dateTime={new Date(entry.timestamp).toISOString()}>
                        {formatTimestamp(entry.timestamp)}
                      </time>
                    </div>
                    {entry.utterance && (
                      <div className="call-feedback-source">
                        <span className="call-feedback-source-label">
                          対象の発話
                          {entry.utteranceTimestamp
                            ? `（${formatTimestamp(entry.utteranceTimestamp)}）`
                            : ""}
                        </span>
                        <p className="call-feedback-source-text">
                          「{entry.utterance}」
                        </p>
                      </div>
                    )}
                    <p className="call-feedback-text">{entry.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  const hasTranscriptContent =
    transcriptEntries.length > 0 || Boolean(pendingAssistantText);
  const showLivePanels = isCallActive || hasTranscriptContent || feedbackEntries.length > 0;
  const showScenarioPanel = !isCallActive;

  const handleLauncherClick = useCallback(() => {
    if (status === "connecting" || status === "connected" || status === "ending") {
      stopCall();
      return;
    }

    if (!open) {
      setOpen(true);
      return;
    }

    if (status === "idle" || status === "error") {
      startCall({ provider });
    }
  }, [status, open, startCall, stopCall, provider]);

  const [scoreOpen, setScoreOpen] = useState(false);
  // Open score dialog automatically when a new score arrives after ending or hangup
  useEffect(() => {
    if ((awaitingFinalScore || scoreResult || endedWithoutScore) && (status === "idle" || status === "ending")) {
      setScoreOpen(true);
    }
  }, [awaitingFinalScore, scoreResult, endedWithoutScore, status]);

  return (
    <>
      <button
        type="button"
        className={launcherClassName}
        aria-label="音声ロールプレイを開始"
        onClick={handleLauncherClick}
      >
        🎧
        {unreadFeedbackCount > 0 && (
          <span className="call-launcher-badge">
            {unreadFeedbackCount > 9 ? "9+" : unreadFeedbackCount}
          </span>
        )}
      </button>
      {(status === "connected" || status === "connecting" || status === "ending") && !open && (
        <div className={`call-mini-status call-mini-status-${status}`}>
          <div className="call-mini-details">
            <span className="call-mini-status-label">{activeStatusLabel}</span>
            {unreadFeedbackCount > 0 && (
              <span className="call-mini-feedback">
                フィードバック {unreadFeedbackCount}
              </span>
            )}
          </div>
          <div className="call-mini-actions">
            <button
              type="button"
              className="call-mini-button"
              onClick={() => setOpen(true)}
            >
              設定を開く
            </button>
            <button
              type="button"
              className="call-mini-button is-danger"
              onClick={handleHangup}
              disabled={status === "connecting"}
            >
              終了
            </button>
          </div>
        </div>
      )}
      <audio
        ref={audioRef}
        className="call-audio"
        autoPlay
        playsInline
        hidden
      />
      {open && !showDock && (
        <div className="call-modal" onMouseDown={handleBackdropClick}>
          <div
            className="call-modal-content"
            role="dialog"
            aria-modal="true"
            aria-label="音声ロールプレイ設定"
          >
            <div className="call-modal-header">
              <div>
                <h2>音声ロールプレイ</h2>
                <p className="call-subtitle">
                  右下のボタンから患者役との会話を開始できます。
                </p>
              </div>
              <button
                type="button"
                className="call-modal-close"
                onClick={handleClose}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            {feedbackFallbackActive && (
              <div className="call-warning">
                リアルタイムフィードバックを取得できていないため、暫定的なヒントを表示しています。
              </div>
            )}
            {scoreFallbackActive && (
              <div className="call-warning">
                採点は暫定値です。API設定やネットワーク状態をご確認ください。
              </div>
            )}

            <div className="call-status-row">
              <span className={`call-status-badge call-status-${status}`}>
                {activeStatusLabel}
              </span>
              {localStream && status === "connected" && (
                <span className="call-mic-indicator">🎤 マイク取得済み</span>
              )}
            </div>

            {/* プロバイダー・接続設定は設定画面に移動 */}

            {showScenarioPanel && renderScenarioChooser()}

            {/* 接続（APIキー）は設定画面に移動 */}

            {/* 患者の設定編集はこの画面では不可（シナリオは上で選択） */}

            {showLivePanels && (
              <>
                {renderLivePanels()}
                <ScoringPanel
                  transcriptEntries={transcriptEntries}
                  feedbackEntries={feedbackEntries}
                  scenarioTitle={activeScenario?.title}
                  scoreResult={scoreResult}
                />
              </>
            )}

            {error && <p className="call-error">{error}</p>}

            <div className="call-actions">
              <button
                type="button"
                className="call-button call-button-primary"
                onClick={() => startCall({ provider })}
                disabled={status === "connecting" || status === "connected"}
              >
                {status === "connecting" ? "接続中…" : status === "connected" ? "通話中" : "通話を開始"}
              </button>
              <button
                type="button"
                className="call-button"
                onClick={stopCall}
                disabled={status !== "connected" && status !== "connecting"}
              >
                通話を終了
              </button>
            </div>
          </div>
        </div>
      )}

      {showDock && (
        <>
          <div className="call-dock" style={{ width: dockWidth }}>
            <div className="call-dock-header">
              <strong>音声ロールプレイ</strong>
              <div className="spacer" />
              <span className={`call-status-badge call-status-${status}`}>{activeStatusLabel}</span>
              <button type="button" className="call-modal-close" onClick={handleHangup} aria-label="終了">×</button>
            </div>
            <div className="call-dock-body">
              {feedbackFallbackActive && (
                <div className="call-warning">
                  リアルタイムフィードバックを取得できていないため、暫定的なヒントを表示しています。
                </div>
              )}
              {scoreFallbackActive && (
                <div className="call-warning">
                  採点は暫定値です。API設定やネットワーク状態をご確認ください。
                </div>
              )}
              {/* プロバイダー・接続設定は設定画面に移動 */}

              {/* Scenario */}
              {showScenarioPanel && renderScenarioChooser()}

              {/* 接続設定は設定画面に移動 */}

              {showLivePanels && (
                <>
                  {renderLivePanels()}
                  <ScoringPanel
                    transcriptEntries={transcriptEntries}
                    feedbackEntries={feedbackEntries}
                    scenarioTitle={activeScenario?.title}
                    scoreResult={scoreResult}
                  />
                </>
              )}

              {/* 通話開始/終了は🎧ボタンに集約 */}
            </div>
          </div>
          <div className="call-dock-resizer" style={{ left: `calc(100vw - ${dockWidth + 4}px)` }} onMouseDown={startResize} />
        </>
      )}
      {(status === "connected" || status === "connecting") && assistantSubtitle && (
        <div className="call-subtitles">
          {assistantSubtitle}
        </div>
      )}
      <ScoreDialog
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        result={scoreResult}
        awaiting={awaitingFinalScore && !scoreResult && !endedWithoutScore}
        failed={endedWithoutScore && !scoreResult}
        fallback={scoreFallbackActive}
      />
    </>
  );
};

export default RealtimeCallLauncher;
