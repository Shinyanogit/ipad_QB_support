import React, { useCallback, useMemo, useRef, useState } from "react";

type RealtimeProvider = "openai" | "gemini";

type CallStatus = "idle" | "connecting" | "connected" | "error";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const OPENAI_DEFAULT_MODEL =
  import.meta.env.VITE_OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
const OPENAI_DEFAULT_URL =
  import.meta.env.VITE_OPENAI_REALTIME_URL ||
  (import.meta.env.PROD
    ? "https://api.openai.com/v1/realtime"
    : "/api/openai");

const GEMINI_DEFAULT_MODEL =
  import.meta.env.VITE_GEMINI_LIVE_MODEL || "gemini-1.5-flash-latest";
const GEMINI_DEFAULT_BASE_URL =
  import.meta.env.VITE_GEMINI_LIVE_BASE_URL ||
  (import.meta.env.PROD
    ? "https://generativelanguage.googleapis.com/v1beta/models"
    : "/api/gemini");

const DEFAULT_PROMPT = `You are a cooperative standardized patient speaking natural English. Keep replies short (1-2 sentences). Avoid role leakage.`;

interface ProviderConfig {
  id: RealtimeProvider;
  label: string;
  dataChannelLabel: string;
  createAnswer: (args: {
    apiKey: string;
    offer: RTCSessionDescriptionInit;
  }) => Promise<string>;
  sendPrompt: (channel: RTCDataChannel, prompt: string) => void;
  describeEndpoint: () => string;
}

const formatTime = () => {
  const date = new Date();
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
};

const SimpleRealtimeDebugger: React.FC = () => {
  const [provider, setProvider] = useState<RealtimeProvider>("openai");
  const [apiKey, setApiKey] = useState<string>("");
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_PROMPT);
  const [logs, setLogs] = useState<string[]>([]);
  const [outboundText, setOutboundText] = useState<string>("");
  const [openaiUrl, setOpenaiUrl] = useState<string>(OPENAI_DEFAULT_URL);
  const [openaiModel, setOpenaiModel] = useState<string>(OPENAI_DEFAULT_MODEL);
  const [geminiBaseUrl, setGeminiBaseUrl] = useState<string>(
    GEMINI_DEFAULT_BASE_URL
  );
  const [geminiModel, setGeminiModel] = useState<string>(GEMINI_DEFAULT_MODEL);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, `${formatTime()} ${line}`].slice(-200));
  }, []);

  const providerConfigs = useMemo<Record<RealtimeProvider, ProviderConfig>>(
    () => ({
      openai: {
        id: "openai",
        label: "OpenAI Realtime",
        dataChannelLabel: "oai-events",
        describeEndpoint: () =>
          `${openaiUrl}?model=${encodeURIComponent(openaiModel)}`,
        createAnswer: async ({ apiKey, offer }) => {
          const endpoint = `${openaiUrl}?model=${encodeURIComponent(
            openaiModel
          )}`;
          const headers: HeadersInit = {
            "Content-Type": "application/sdp",
          };
          if (import.meta.env.PROD) {
            headers.Authorization = `Bearer ${apiKey}`;
          } else {
            headers["X-Api-Key"] = apiKey;
          }
          const response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: offer.sdp ?? "",
          });
          const answer = await response.text();
          if (!response.ok) {
            throw new Error(answer || response.statusText || "OpenAI error");
          }
          return answer;
        },
        sendPrompt: (channel, prompt) => {
          try {
            channel.send(
              JSON.stringify({
                type: "session.update",
                session: { instructions: prompt },
              })
            );
          } catch (error) {
            console.warn("Failed to send OpenAI session instructions", error);
          }
        },
      },
      gemini: {
        id: "gemini",
        label: "Gemini Live",
        dataChannelLabel: "client-events",
        describeEndpoint: () =>
          `${geminiBaseUrl}/${encodeURIComponent(geminiModel)}:connect`,
        createAnswer: async ({ apiKey, offer }) => {
          let url = `${geminiBaseUrl}/${encodeURIComponent(
            geminiModel
          )}:connect`;
          const headers: HeadersInit = {
            "Content-Type": "application/sdp",
          };
          if (import.meta.env.PROD) {
            url = `${url}?key=${encodeURIComponent(apiKey)}`;
          } else {
            headers["X-Api-Key"] = apiKey;
          }
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: offer.sdp ?? "",
          });
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
            const payload = await response.json();
            if (!response.ok) {
              throw new Error(
                payload?.error?.message || response.statusText || "Gemini error"
              );
            }
            const sdp: unknown =
              payload?.sdp ?? payload?.answer ?? payload?.sessionDescription;
            if (typeof sdp !== "string" || !sdp) {
              throw new Error("Gemini response missing SDP");
            }
            return sdp;
          }
          const text = await response.text();
          if (!response.ok) {
            throw new Error(text || response.statusText || "Gemini error");
          }
          return text;
        },
        sendPrompt: (channel, prompt) => {
          try {
            channel.send(
              JSON.stringify({
                type: "input_text",
                text: prompt,
              })
            );
          } catch (error) {
            console.warn("Failed to send Gemini prompt", error);
          }
        },
      },
    }),
    [openaiUrl, openaiModel, geminiBaseUrl, geminiModel]
  );

  const cleanup = useCallback(() => {
    appendLog("cleaning up connection");
    setStatus("idle");
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {}
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, [appendLog]);

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("APIキーを入力してください");
      return;
    }
    if (status === "connected" || status === "connecting") {
      setError("既に接続中です");
      return;
    }
    setError(null);
    setStatus("connecting");
    appendLog("starting simple realtime session");

    const config = providerConfigs[provider];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.addEventListener("track", (event) => {
      const [stream] = event.streams;
      if (stream && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        appendLog("remote audio stream attached");
      }
    });
    pc.addEventListener("connectionstatechange", () => {
      appendLog(`connection state: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setStatus("connected");
      } else if (pc.connectionState === "failed") {
        setError("接続に失敗しました");
        setStatus("error");
      }
    });

    try {
      const local = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = local;
      local
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStreamRef.current!));
      appendLog("microphone stream ready");
    } catch (micError) {
      appendLog("microphone access failed");
      setError("マイクの取得に失敗しました");
      setStatus("error");
      cleanup();
      return;
    }

    let dataChannel: RTCDataChannel | null = null;
    try {
      dataChannel = pc.createDataChannel(config.dataChannelLabel);
      dataChannelRef.current = dataChannel;
      dataChannel.addEventListener("message", (event) => {
        appendLog(`DC → ${event.data}`);
      });
      dataChannel.addEventListener("open", () => {
        appendLog("data channel opened");
        config.sendPrompt(dataChannel!, systemPrompt);
      });
      dataChannel.addEventListener("close", () => {
        appendLog("data channel closed");
      });
    } catch (channelError) {
      appendLog(`Failed to create data channel: ${channelError}`);
    }

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    try {
      const answerSdp = await config.createAnswer({ apiKey, offer });
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      appendLog("remote description applied");
    } catch (apiError) {
      console.error(apiError);
      appendLog(`API error: ${apiError}`);
      setError(apiError instanceof Error ? apiError.message : String(apiError));
      cleanup();
      return;
    }
  }, [apiKey, provider, systemPrompt, status, appendLog, cleanup, providerConfigs]);

  const handleHangup = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const handleSendText = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      appendLog("data channel is not open");
      return;
    }
    const text = outboundText.trim();
    if (!text) return;
    const payload =
      provider === "openai"
        ? JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text"],
              instructions: text,
            },
          })
        : JSON.stringify({ type: "input_text", text });
    try {
      channel.send(payload);
      appendLog(`DC ← ${text}`);
      setOutboundText("");
    } catch (sendError) {
      appendLog(`send failed: ${sendError}`);
    }
  }, [appendLog, outboundText, provider]);

  const handleDiagnostics = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("APIキーを入力してください");
      return;
    }
    const targetProviderConfig = providerConfigs[provider];
    appendLog(`[diag] ${provider} 接続診断を開始`);
    try {
      let response: Response;
      if (provider === "openai") {
        const url = `https://api.openai.com/v1/models/${encodeURIComponent(
          openaiModel || "gpt-4o-realtime-preview"
        )}`;
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
      } else {
        let url = `${geminiBaseUrl}/${encodeURIComponent(
          geminiModel || "gemini-1.5-flash-latest"
        )}`;
        if (import.meta.env.PROD) {
          url = `${url}?key=${encodeURIComponent(apiKey)}`;
        }
        const headers: HeadersInit = {};
        if (!import.meta.env.PROD) {
          headers["X-Api-Key"] = apiKey;
        }
        response = await fetch(url, { headers });
      }
      const preview = await response
        .clone()
        .text()
        .then((txt) => txt.slice(0, 400))
        .catch(() => "<no body>");
      appendLog(
        `[diag] HTTP ${response.status} ${response.statusText} :: ${preview}`
      );
      if (!response.ok) {
        setError("診断リクエストが失敗しました。ログを確認してください。");
      } else {
        setError(null);
      }
    } catch (diagError) {
      appendLog(`[diag] failed: ${diagError}`);
      setError(diagError instanceof Error ? diagError.message : String(diagError));
    }
    appendLog(
      `[diag] This session will POST to ${targetProviderConfig.describeEndpoint()}`
    );
  }, [
    apiKey,
    provider,
    providerConfigs,
    openaiModel,
    geminiBaseUrl,
    geminiModel,
    appendLog,
  ]);

  const logOutput = useMemo(() => logs.slice().reverse(), [logs]);

  return (
    <div className="simple-realtime-debugger">
      <div className="srd-row">
        <label>
          プロバイダー
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as RealtimeProvider)}
          >
            <option value="openai">OpenAI Realtime</option>
            <option value="gemini">Gemini Live</option>
          </select>
        </label>
        <label className="srd-flex">
          APIキー
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </label>
        <span className={`srd-status srd-status-${status}`}>状態: {status}</span>
      </div>
      <div className="srd-row srd-advanced">
        {provider === "openai" ? (
          <>
            <label className="srd-flex">
              Realtime URL
              <input
                type="text"
                value={openaiUrl}
                onChange={(e) => setOpenaiUrl(e.target.value)}
              />
            </label>
            <label className="srd-flex">
              Model
              <input
                type="text"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="srd-flex">
              Gemini Base URL
              <input
                type="text"
                value={geminiBaseUrl}
                onChange={(e) => setGeminiBaseUrl(e.target.value)}
              />
            </label>
            <label className="srd-flex">
              Model
              <input
                type="text"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <div className="srd-hint-box">
        <p>
          接続先: <code>{providerConfigs[provider].describeEndpoint()}</code>
        </p>
        {provider === "gemini" ? (
          <p>
            ✅ Google CloudコンソールでRealtimeアクセスを有効化し、キーに{" "}
            <code>{geminiModel}</code>{" "}
            を許可してください。開発モードではX-Api-Keyヘッダー、公開時は
            <code>?key=</code> を使います。
          </p>
        ) : (
          <p>
            ✅ OpenAIキーはRealtime権限が必要です。`session.update` でプロンプト変更、`response.create` で応答生成します。
          </p>
        )}
      </div>
      {error && <p className="srd-error">{error}</p>}
      <label className="srd-flex">
        システムプロンプト
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={3}
        />
      </label>
      <div className="srd-actions">
        <button
          onClick={handleConnect}
          disabled={status === "connecting" || status === "connected"}
        >
          接続
        </button>
        <button
          onClick={handleHangup}
          disabled={status === "idle" || status === "error"}
        >
          切断
        </button>
        <button onClick={handleDiagnostics}>診断チェック</button>
      </div>
      <audio ref={remoteAudioRef} autoPlay controls playsInline />
      <div className="srd-send-box">
        <textarea
          rows={2}
          value={outboundText}
          onChange={(e) => setOutboundText(e.target.value)}
          placeholder="テキストで応答を送信"
        />
        <button onClick={handleSendText} disabled={!outboundText.trim()}>
          送信
        </button>
      </div>
      <div className="srd-log">
        <strong>ログ</strong>
        <ul>
          {logOutput.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SimpleRealtimeDebugger;
