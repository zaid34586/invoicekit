import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase is used ONLY for phone number OTP verification (SMS).
// All other auth (email/password, sessions) stays on Supabase — see src/lib/supabase.ts.
//
// Fill these values in your .env file once the Firebase project is created:
// (Firebase Console → Project Settings → General → Your apps → Web app → SDK config)
//
// VITE_FIREBASE_API_KEY=
// VITE_FIREBASE_AUTH_DOMAIN=
// VITE_FIREBASE_PROJECT_ID=
// VITE_FIREBASE_STORAGE_BUCKET=
// VITE_FIREBASE_MESSAGING_SENDER_ID=
// VITE_FIREBASE_APP_ID=
//
// Also required before phone OTP will work at all:
// 1. Firebase project must be on the Blaze (pay-as-you-go) plan with a billing
//    account attached — this is mandatory even to use the free 10 SMS/day quota.
// 2. In Firebase Console → Authentication → Sign-in method → enable "Phone".
// 3. In Firebase Console → Authentication → Settings → Authorized domains →
//    add your production domain (e.g. getrivox.vercel.app) and localhost.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  // Don't throw at import time — this file is imported by VerifyPhone.tsx,
  // and we want the rest of the app (email/password login, dashboard, etc.)
  // to keep working even before Firebase is configured. VerifyPhone.tsx
  // checks isFirebaseConfigured() and shows a clear message instead of a
  // blank screen if these are missing.
  console.warn(
    `Firebase phone auth is not configured. Missing env vars: ${missingKeys.join(", ")}`
  );
}

export const isFirebaseConfigured = missingKeys.length === 0;

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
