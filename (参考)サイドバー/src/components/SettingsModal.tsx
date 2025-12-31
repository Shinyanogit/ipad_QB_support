import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LayoutMode, useLayout } from '../context/LayoutContext';
import { useAuth } from '../context/AuthContext';
import useRealtimeCall from '../hooks/useRealtimeCall';

type Props = {
  open: boolean;
  onClose: () => void;
};

const SettingsModal: React.FC<Props> = ({
  open,
  onClose,
}) => {
  const { theme, setTheme } = useTheme();
  const { layout, setLayout } = useLayout();
  const { currentUser, signUp, signIn, signInWithGoogle, logout } = useAuth();
  const { setApiKey, getApiKey } = useRealtimeCall();
  const [showAuth, setShowAuth] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // APIキーを読み込む（セクションが開かれた時だけ、一度だけ）
  useEffect(() => {
    if (showApiKeys) {
      // セクションが開かれた時だけ初期値を設定
      const currentOpenaiKey = getApiKey("openai");
      const currentGeminiKey = getApiKey("gemini");
      setOpenaiKey(currentOpenaiKey);
      setGeminiKey(currentGeminiKey);
    } else {
      // セクションが閉じられたらリセット
      setOpenaiKey("");
      setGeminiKey("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showApiKeys]); // showApiKeysが変更された時だけ実行

  const handleApiKeySave = () => {
    setError("");
    setLoading(true);

    // useRealtimeCallの状態も更新（デバウンス付きで保存されます）
    setApiKey("openai", openaiKey);
    setApiKey("gemini", geminiKey);

    setShowApiKeys(false);

    // デバウンス保存の完了を待たずにローディング表示を終了
    setTimeout(() => {
      setLoading(false);
    }, 1100);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      setEmail("");
      setPassword("");
      setShowAuth(false);
      setError("");
    } catch (err: any) {
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      setShowAuth(false);
      setError("");
    } catch (err: any) {
      setError(err.message || "Googleログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowAuth(false);
    } catch (err: any) {
      setError(err.message || "ログアウトに失敗しました");
    }
  };

  if (!open) return null;

  return (
    <div className="settings-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-content">
        <div className="settings-header">
          <h2>設定</h2>
          <button className="close-button" onClick={onClose} aria-label="閉じる">&times;</button>
        </div>
        <div className="settings-item">
          <span className="settings-label">ダークモード</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => setTheme(e.target.checked ? 'dark' : 'auto')}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-item">
          <span className="settings-label">レイアウト</span>
          <div className="layout-options">
            {(['auto', 'two-column', 'single-column'] as LayoutMode[]).map((mode) => (
              <label className="radio-option" key={mode}>
                <input
                  type="radio"
                  name="layoutMode"
                  value={mode}
                  checked={layout === mode}
                  onChange={() => setLayout(mode)}
                />
                <span>{mode === 'auto' ? '自動' : mode === 'two-column' ? '2段組' : '1段組'}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-item settings-api-keys-section">
          <div className="settings-auth-header">
            <span className="settings-label">APIキー</span>
            {!showApiKeys && (
              <button
                type="button"
                className="settings-auth-toggle"
                onClick={() => {
                  setShowApiKeys(true);
                  setError("");
                }}
              >
                APIキーを設定
              </button>
            )}
          </div>

          {showApiKeys && (
            <div className="settings-auth-content">
              <div className="auth-field">
                <label htmlFor="api-key-openai" className="auth-label">
                  OpenAI APIキー
                </label>
                <input
                  id="api-key-openai"
                  type="password"
                  className="auth-input"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk- で始まるキーを入力"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="auth-hint">
                  リアルタイム通話機能で使用します
                </p>
              </div>

              <div className="auth-field">
                <label htmlFor="api-key-gemini" className="auth-label">
                  Gemini APIキー
                </label>
                <input
                  id="api-key-gemini"
                  type="password"
                  className="auth-input"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AI... で始まるキーを入力"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="auth-hint">
                  リアルタイム通話機能で使用します
                </p>
              </div>

              <div className="settings-api-keys-actions">
                <button
                  type="button"
                  className="auth-button auth-button-primary"
                  onClick={handleApiKeySave}
                  disabled={loading}
                >
                  {loading ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  className="settings-auth-close"
                  onClick={() => {
                    setShowApiKeys(false);
                    setError("");
                  }}
                >
                  キャンセル
                </button>
              </div>
              {error && (
                <p className="auth-error" style={{ marginTop: '12px' }}>
                  {error}
                </p>
              )}
              <p className="auth-hint" style={{ marginTop: '12px', fontSize: '12px' }}>
                {currentUser
                  ? "ログイン中です。APIキーはFirebaseに保存されます。"
                  : "ログインしていません。APIキーはブラウザのLocalStorageにのみ保存されます。"}
              </p>
            </div>
          )}
        </div>

        <div className="settings-item settings-auth-section">
          <div className="settings-auth-header">
            <span className="settings-label">アカウント</span>
            {!showAuth && (
              <button
                type="button"
                className="settings-auth-toggle"
                onClick={() => {
                  setShowAuth(true);
                  setError("");
                }}
              >
                {currentUser ? "アカウント情報" : "ログイン"}
              </button>
            )}
          </div>

          {showAuth && (
            <div className="settings-auth-content">
              {currentUser ? (
                <div className="auth-content">
                  <div className="auth-user-info">
                    <p className="auth-email">{currentUser.email}</p>
                    <p className="auth-hint">
                      ログイン中です。APIキーはFirebaseに保存されます。
                    </p>
                  </div>
                  <button
                    className="auth-button auth-button-logout"
                    onClick={handleLogout}
                    disabled={loading}
                  >
                    ログアウト
                  </button>
                  <button
                    type="button"
                    className="settings-auth-close"
                    onClick={() => {
                      setShowAuth(false);
                      setError("");
                    }}
                  >
                    閉じる
                  </button>
                </div>
              ) : (
                <div>
                  <form onSubmit={handleAuthSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}

                    <div className="auth-field">
                      <label htmlFor="auth-email" className="auth-label">
                        メールアドレス
                      </label>
                      <input
                        id="auth-email"
                        type="email"
                        className="auth-input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="example@email.com"
                      />
                    </div>

                    <div className="auth-field">
                      <label htmlFor="auth-password" className="auth-label">
                        パスワード
                      </label>
                      <input
                        id="auth-password"
                        type="password"
                        className="auth-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        placeholder="6文字以上"
                        minLength={6}
                      />
                    </div>

                    <button
                      type="submit"
                      className="auth-button auth-button-primary"
                      disabled={loading}
                    >
                      {loading ? "処理中..." : isSignUp ? "新規登録" : "ログイン"}
                    </button>

                    <div className="auth-divider">
                      <span>または</span>
                    </div>

                    <button
                      type="button"
                      className="auth-button auth-button-google"
                      onClick={handleGoogleSignIn}
                      disabled={loading}
                    >
                      <span className="auth-google-icon">🔍</span>
                      Googleでログイン
                    </button>

                    <div className="auth-switch">
                      <button
                        type="button"
                        className="auth-switch-link"
                        onClick={() => {
                          setIsSignUp(!isSignUp);
                          setError("");
                        }}
                      >
                        {isSignUp
                          ? "既にアカウントをお持ちですか？ログイン"
                          : "アカウントをお持ちでない方は新規登録"}
                      </button>
                    </div>
                  </form>
                  <button
                    type="button"
                    className="settings-auth-close"
                    onClick={() => {
                      setShowAuth(false);
                      setError("");
                      setEmail("");
                      setPassword("");
                    }}
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
