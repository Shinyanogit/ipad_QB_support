import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDohl26n1qv16koNfb6Uf0RlZpHTMmWOVs",
  authDomain: "qb-support-d2c98.firebaseapp.com",
  projectId: "qb-support-d2c98",
  storageBucket: "qb-support-d2c98.firebasestorage.app",
  messagingSenderId: "400313981210",
  appId: "1:400313981210:web:55aa3ea5881720f7d174a3",
  measurementId: "G-QTKWGVT1TG",
};

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: "select_account" });

function getFirebaseApp() {
  const existing = getApps();
  if (existing.length) return existing[0];
  return initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp());
}
