import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

type ApiKeys = {
  openai?: string;
  gemini?: string;
  [key: string]: string | undefined;
};

type UserData = {
  apiKeys?: ApiKeys;
  createdAt?: Date;
  updatedAt?: Date;
};

type AuthContextValue = {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateApiKeys: (keys: ApiKeys) => Promise<void>;
  refreshUserData: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // ユーザーデータをFirestoreから取得
  const fetchUserData = async (user: User) => {
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({
          apiKeys: data.apiKeys || {},
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        });
      } else {
        // 新規ユーザーの場合はドキュメントを作成
        const initialData: UserData = {
          apiKeys: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await setDoc(userDocRef, {
          apiKeys: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        setUserData(initialData);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setUserData(null);
    }
  };

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserData(user);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // サインアップ
  const signUp = async (email: string, password: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // ユーザードキュメントを作成
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(userDocRef, {
      apiKeys: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await fetchUserData(user);
  };

  // サインイン
  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  // Googleでサインイン
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;

    // ユーザードキュメントが存在しない場合は作成
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        apiKeys: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await fetchUserData(user);
  };

  // ログアウト
  const logout = async () => {
    await signOut(auth);
    setUserData(null);
  };

  // APIキーを更新
  const updateApiKeys = async (keys: ApiKeys) => {
    if (!currentUser) {
      throw new Error("User must be logged in to update API keys");
    }

    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      await updateDoc(userDocRef, {
        apiKeys: keys,
        updatedAt: new Date(),
      });

      // ローカル状態を更新
      setUserData((prev) => ({
        ...prev,
        apiKeys: keys,
        updatedAt: new Date(),
      }));
    } catch (error) {
      console.error("Error updating API keys:", error);
      throw error;
    }
  };

  // ユーザーデータを再取得
  const refreshUserData = async () => {
    if (currentUser) {
      await fetchUserData(currentUser);
    }
  };

  const value: AuthContextValue = {
    currentUser,
    userData,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    logout,
    updateApiKeys,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
