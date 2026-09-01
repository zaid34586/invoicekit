import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { firebaseAuth, isFirebaseConfigured } from "../lib/firebase";

type Stage = "phone" | "otp" | "verifying" | "success";

// Firebase requires an invisible reCAPTCHA to be attached to a real DOM node
// before signInWithPhoneNumber will work. We create it once and reuse it;
// if a send fails we reset it (Firebase's own recommendation) so the next
// attempt gets a fresh challenge instead of silently failing.
let recaptchaVerifier: RecaptchaVerifier | null = null;

function getRecaptchaVerifier(): RecaptchaVerifier {
  if (!firebaseAuth) {
    throw new Error("Firebase is not configured.");
  }
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, "recaptcha-container", {
      size: "invisible",
    });
  }
  return recaptchaVerifier;
}

export default function VerifyPhone() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<Stage>("phone");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState("");
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  useEffect(() => {
    if (stage !== "otp" || resendTimer <= 0) return;
    const timer = window.setTimeout(() => setResendTimer((p) => p - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [stage, resendTimer]);

  const countryCode = profile?.country_code ?? "";
const fullPhone = countryCode + phone;

  // Firebase error codes -> plain-language messages.
  // (Full list: https://firebase.google.com/docs/reference/js/auth#autherrorcodes)
  function friendlyFirebaseError(err: unknown): string {
    const code = (err as { code?: string })?.code || "";
    if (code === "auth/invalid-phone-number") return "Enter a valid mobile number.";
    if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
    if (code === "auth/quota-exceeded") return "SMS limit reached for today. Please try again tomorrow.";
    if (code === "auth/code-expired") return "This code has expired. Please request a new one.";
    if (code === "auth/invalid-verification-code") return "Invalid OTP. Please try again.";
    if (code === "auth/billing-not-enabled" || code === "auth/operation-not-allowed") {
      return "Phone verification is not fully set up yet. Please contact support.";
    }
    return (err as Error)?.message || "Something went wrong. Please try again.";
  }

  async function sendOTP() {
    setError("");
    setOtp("");

    if (!isFirebaseConfigured || !firebaseAuth) {
      setError("Phone verification is not set up yet. Please contact support.");
      return;
    }

    if (phone.replace(/\D/g, "").length < 8) {
      setError("Enter a valid mobile number.");
      return;
    }

    setLoading(true);

    try {
      const verifier = getRecaptchaVerifier();
      const confirmationResult = await signInWithPhoneNumber(firebaseAuth, fullPhone, verifier);
      confirmationResultRef.current = confirmationResult;

      setStage("otp");
      setResendTimer(30);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      // Reset the reCAPTCHA widget so the next attempt starts clean —
      // Firebase's own docs recommend this after any send failure.
      recaptchaVerifier?.clear();
      recaptchaVerifier = null;
      setError(friendlyFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOTP() {
    setError("");

    if (otp.length !== 6) {
      setError("Enter the 6-digit OTP.");
      return;
    }

    if (!confirmationResultRef.current) {
      setError("Session expired. Please request a new OTP.");
      setStage("phone");
      return;
    }

    setStage("verifying");

    try {
      await confirmationResultRef.current.confirm(otp);

      // Firebase only verifies the phone number — Supabase profile stays
      // the single source of truth for the app, so we write the result there.
      await supabase
        .from("profiles")
        .update({
          phone: fullPhone,
          phone_verified: true,
        })
        .eq("user_id", user?.id);

      await refreshProfile();

      setStage("success");

      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 1500);
    } catch (err) {
      setStage("otp");
      setError(friendlyFirebaseError(err));
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const arr = otp.padEnd(6, " ").split("");
    arr[index] = digit || " ";
    const next = arr.join("").replace(/\s/g, "").slice(0, 6);
    setOtp(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, key: string) {
    if (key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(text: string) {
    const pasted = text.replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    setOtp(pasted);
    setTimeout(() => {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }, 0);
  }

  if (stage === "verifying") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950">
        <div className="w-14 h-14 border-4 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-6" />
        <p className="text-lg font-semibold text-white">Verifying your number...</p>
        <p className="text-sm text-slate-400 mt-2">Almost there!</p>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-emerald-400/15 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">You are all set!</h1>
          <p className="text-slate-400 text-sm">Preparing your workspace...</p>

          <div className="mt-6 w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full"
              style={{ width: "100%", transition: "width 1.5s linear" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      {/* Invisible reCAPTCHA anchor required by Firebase before it will send an SMS. Stays hidden. */}
      <div id="recaptcha-container" />
      <div className="auth-shell">
        <section className="auth-aside">
          <div>
            <div className="inline-flex items-center gap-3">
              <img src="/rivox-logo.svg" alt="Rivox" className="h-10 w-10 rounded-xl" />
              <span className="text-2xl font-bold tracking-tight">Rivox</span>
            </div>
            <div className="mt-16 max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[.24em] text-violet-300">Phone verification</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">
                {stage === "otp" ? "Check your messages." : "One quick step to secure your account."}
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-300">
                {stage === "otp"
                  ? `We texted a 6-digit code to ${fullPhone}. Enter it to finish setting up your workspace.`
                  : "Rivox uses your mobile number to protect your account and send important billing alerts."}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-slate-300">
            {["Delivered instantly", "One-time use only", "Editable anytime"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3">{item}</div>
            ))}
          </div>
        </section>

        <section className="auth-content">
          <div className="mb-6 flex min-w-0 items-start justify-between gap-3 sm:mb-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-600">Step 2 of 2</p>
              <h2 className="mt-2 auth-heading font-bold text-slate-950">
                {stage === "otp" ? "Enter your code" : "Verify Mobile Number"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {stage === "otp"
                  ? `Enter the 6-digit code sent to ${fullPhone}.`
                  : "Verify your phone number to continue."}
              </p>
            </div>
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">2/2</div>
          </div>

          <div className="mb-8 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500" />
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {stage === "phone" && (
            <div className="space-y-5">
              <div>
                <label className="label">Mobile Number</label>
                <div className="flex gap-2">
                  <div className="input h-12 w-28 flex items-center justify-center bg-slate-100">
                    {countryCode}
                  </div>
                  <input
                    className="input h-12 flex-1"
                    placeholder="Enter mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                  />
                </div>
              </div>
              <button className="btn-primary h-12 w-full justify-center text-base" onClick={sendOTP} disabled={loading}>
                {loading ? "Sending OTP..." : "Send OTP"}
              </button>
              <p className="text-center text-xs text-slate-400">Your number is only used for verification and security alerts.</p>
            </div>
          )}

          {stage === "otp" && (
            <div>
              <label className="label text-center block mb-3">Enter OTP</label>
              <div className="flex justify-center gap-2 mb-5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={otp[index] || ""}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e.key)}
                    onPaste={(e) => {
                      e.preventDefault();
                      handleOtpPaste(e.clipboardData.getData("text"));
                    }}
                    className="w-12 h-14 rounded-xl border border-slate-300 text-center text-xl font-bold focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none"
                  />
                ))}
              </div>

              <button className="btn-primary h-12 w-full justify-center text-base" onClick={verifyOTP} disabled={otp.length !== 6}>
                Verify OTP
              </button>

              <div className="text-center mt-5">
                <p className="text-sm text-slate-500 mb-2">Did not receive the code?</p>
                {resendTimer > 0 ? (
                  <p className="text-sm font-medium text-slate-600">Resend OTP in {resendTimer}s</p>
                ) : (
                  <button
                    type="button"
                    onClick={sendOTP}
                    disabled={loading}
                    className="text-sm font-semibold text-violet-600 hover:underline"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              <button
                className="btn-secondary h-11 w-full mt-4"
                onClick={() => {
                  setOtp("");
                  setStage("phone");
                  setError("");
                  setResendTimer(0);
                }}
                disabled={loading}
              >
                Change Mobile Number
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}