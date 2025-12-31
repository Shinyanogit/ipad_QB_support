import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

const AuthModal: React.FC<Props> = ({ open, onClose }) => {
  const { currentUser, signUp, signIn, signInWithGoogle, logout } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      // 成功したらフォームをリセット
      setEmail("");
      setPassword("");
      onClose();
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
      onClose();
    } catch (err: any) {
      setError(err.message || "Googleログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      onClose();
    } catch (err: any) {
      setError(err.message || "ログアウトに失敗しました");
    }
  };

  if (!open) return null;

  return (
    <div
      className="settings-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="settings-content">
        <div className="settings-header">
          <h2>{currentUser ? "アカウント" : isSignUp ? "新規登録" : "ログイン"}</h2>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="閉じる"
          >
            &times;
          </button>
        </div>

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
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
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
        )}
      </div>
    </div>
  );
};

export default AuthModal;
