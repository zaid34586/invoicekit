import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type Stage = "phone" | "otp" | "verifying" | "success";

export default function VerifyPhone() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<Stage>("phone");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState("");

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

  async function sendOTP() {
    setError("");
    setOtp("");

    if (phone.replace(/\D/g, "").length < 8) {
      setError("Enter a valid mobile number.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("send-otp", {
      body: { phone: fullPhone },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data?.success) {
      setStage("otp");
      setResendTimer(30);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } else {
      setError(data?.error || "Failed to send OTP.");
    }
  }

  async function verifyOTP() {
    setError("");

    if (otp.length !== 6) {
      setError("Enter the 6-digit OTP.");
      return;
    }

    setStage("verifying");

    const { data, error } = await supabase.functions.invoke("verify-otp", {
      body: { phone: fullPhone, code: otp },
    });

    if (error) {
      setStage("otp");
      setError(error.message);
      return;
    }

    if (data?.success) {
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
    } else {
      setStage("otp");
      setError("Invalid OTP. Please try again.");
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />
        <p className="text-lg font-semibold text-slate-700">Verifying your number...</p>
        <p className="text-sm text-slate-400 mt-2">Almost there!</p>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <svg
              className="w-10 h-10 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            You are all set!
          </h1>
          <p className="text-slate-500 text-sm">Preparing your workspace...</p>

          <div className="mt-6 w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full"
              style={{
                width: "100%",
                transition: "width 1.5s linear",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Verify Mobile Number
          </h1>
          <p className="text-slate-500 text-sm">
            {stage === "otp"
              ? "Enter the 6-digit code sent to " + fullPhone
              : "Verify your phone number to continue."}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {stage === "phone" && (
          <div>
            <label className="label">Mobile Number</label>
            <div className="flex gap-2 mb-6">
              <div className="input w-28 flex items-center justify-center bg-slate-100">
  {countryCode}
</div>
              <input
                className="input flex-1"
                placeholder="Enter mobile number"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))
                }
              />
            </div>
            <button
              className="btn-primary w-full"
              onClick={sendOTP}
              disabled={loading}
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
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
                  className="w-12 h-14 rounded-xl border border-slate-300 text-center text-xl font-bold focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                />
              ))}
            </div>

            <button
              className="btn-primary w-full"
              onClick={verifyOTP}
              disabled={otp.length !== 6}
            >
              Verify OTP
            </button>

            <div className="text-center mt-5">
              <p className="text-sm text-slate-500 mb-2">
                Did not receive the code?
              </p>
              {resendTimer > 0 ? (
                <p className="text-sm font-medium text-slate-600">
                  Resend OTP in {resendTimer}s
                </p>
              ) : (
                <button
                  type="button"
                  onClick={sendOTP}
                  disabled={loading}
                  className="text-sm font-semibold text-primary-600 hover:underline"
                >
                  Resend OTP
                </button>
              )}
            </div>

            <button
              className="btn-secondary w-full mt-4"
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
      </div>
    </div>
  );
}