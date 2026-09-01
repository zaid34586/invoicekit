# Firebase Phone OTP — What Changed & What To Do Next

## Files in this zip (copy these into your project, replacing the old ones)
- `package.json` — added the `firebase` package
- `src/lib/firebase.ts` — NEW file, Firebase config/init
- `src/pages/VerifyPhone.tsx` — replaced Twilio calls with Firebase phone auth
- `.env.example` — documents all env vars needed (Supabase + new Firebase ones)

## How to apply
1. Copy these files into your local `invoicekit` repo, overwriting the matching paths.
2. Run `npm install` (this pulls in the new `firebase` package).
3. Commit and push to GitHub as usual:
   ```
   git add .
   git commit -m "Replace Twilio OTP with Firebase phone auth"
   git push
   ```
4. Vercel will auto-redeploy from GitHub (if that's how it's connected).

## Before phone OTP will actually work (once your card/billing is sorted)
1. Go to console.firebase.google.com → create a project (or link your existing
   Google Cloud project, same one you were setting up billing for).
2. Upgrade the project to the **Blaze plan** (requires a working billing card —
   this is mandatory even to use the free 10 SMS/day quota).
3. Authentication → Sign-in method → enable **Phone**.
4. Authentication → Settings → Authorized domains → add `getrivox.vercel.app`
   (and keep `localhost` for local testing).
5. Project Settings → General → scroll to "Your apps" → add a Web app (if none
   exists) → copy the 6 config values shown there.
6. Add those 6 values to your **Vercel project's environment variables**
   (Settings → Environment Variables) using the exact names in `.env.example`:
   - VITE_FIREBASE_API_KEY
   - VITE_FIREBASE_AUTH_DOMAIN
   - VITE_FIREBASE_PROJECT_ID
   - VITE_FIREBASE_STORAGE_BUCKET
   - VITE_FIREBASE_MESSAGING_SENDER_ID
   - VITE_FIREBASE_APP_ID
7. Redeploy on Vercel (or just trigger a redeploy — env var changes need one).

## Until Firebase is configured
The app will NOT crash. `VerifyPhone.tsx` checks `isFirebaseConfigured` and
will show "Phone verification is not set up yet. Please contact support."
instead of a blank screen or a crash, if someone reaches that step before
step 6 above is done. Email/password login and everything else is unaffected —
this only touches the phone verification step.

## Old Twilio functions
`supabase/functions/send-otp` and `supabase/functions/verify-otp` are no
longer called by the app but were left in place untouched. Safe to delete
later once you've confirmed Firebase is working, not urgent.
