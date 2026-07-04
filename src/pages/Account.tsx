import { useState, useRef, useEffect, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getGlobalCountryConfig } from "../lib/globalConfig";


// Time zones list
const TIME_ZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
  { value: "UTC", label: "Coordinated Universal Time (UTC)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST)" },
  { value: "Asia/Singapore", label: "Singapore Time (SGT)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET)" },
];

// Countries list
const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "UAE",
  "Singapore",
  "Japan",
  "Other",
];

// Password strength calculator
function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 4) return { score, label: "Fair", color: "bg-amber-500" };
  if (score <= 5) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

// Confirmation Modal
function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  variant = "primary",
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  variant?: "primary" | "danger";
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative card max-w-sm w-full p-6 animate-scale-in">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-sm text-white rounded-lg transition ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-primary-600 hover:bg-primary-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Toggle Switch Component
function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
          enabled ? "bg-primary-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// Section Header Component
function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && (
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      )}
    </div>
  );
}

export default function Account() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Profile state
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [language, setLanguage] = useState("en");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences
  const [notifications, setNotifications] = useState({
    invoiceCreated: true,
    invoicePaid: true,
    invoiceOverdue: true,
    billingUpdates: true,
    productUpdates: false,
  });

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    variant?: "primary" | "danger";
  } | null>(null);

  // Initialize form from profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.business_name ?? "");
      setBusinessName(profile.business_name ?? "");
      setPhone(profile.phone ?? "");
      setAvatarUrl(profile.logo_url ?? null);

      setCountry(profile.country ?? "");
setTimezone(profile.timezone ?? "UTC");
    }
  }, [profile]);

  // Session data (placeholder)
  const currentSession = {
    device: "MacBook Pro",
    browser: "Chrome 125",
    lastLogin: "2026-06-26T10:30:00Z",
    location: "Mumbai, India",
  };

  async function handleAvatarUpload(file: File) {
    if (!user) return;
    setUploading(true);
    setMessage(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(path);
      setAvatarUrl(urlData.publicUrl);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed",
      });
    }
    setUploading(false);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);
const config = getGlobalCountryConfig(country);
    const payload = {
      user_id: user.id,
      business_name: businessName.trim() || fullName.trim() || null,
      phone: phone.trim() || null,
      logo_url: avatarUrl,
      country,
timezone,
country_code: config.phoneCode,
currency: config.currency,
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Profile saved successfully!" });
      await refreshProfile();
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user || newPassword !== confirmPassword) {
      setMessage({
        type: "error",
        text: "Passwords do not match",
      });
      return;
    }

    setChangingPassword(true);
    setMessage(null);

    // Placeholder - would call Supabase auth in real implementation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setChangingPassword(false);
    setMessage({
      type: "success",
      text: "Password updated successfully!",
    });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function handleExportData() {
    setConfirmModal({
      open: true,
      title: "Export Your Data",
      message:
        "Your data export will be prepared and sent to your email address. This may take a few minutes.",
      confirmLabel: "Request Export",
      onConfirm: () => {
        setMessage({
          type: "success",
          text: "Data export requested. You'll receive an email shortly.",
        });
      },
    });
  }

  function handleDeleteAccount() {
    setConfirmModal({
      open: true,
      title: "Delete Account",
      message:
        "This action cannot be undone. All your data including invoices, clients, and settings will be permanently deleted.",
      confirmLabel: "Delete My Account",
      variant: "danger",
      onConfirm: async () => {
  const { error } = await supabase.functions.invoke("delete-account");

  if (error) {
    setMessage({
      type: "error",
      text: error.message,
    });
    return;
  }

  await signOut();

  navigate("/", {
    replace: true,
  });
},
    });
  }

  function handleLogoutAllDevices() {
    setConfirmModal({
      open: true,
      title: "Log Out All Devices",
      message:
        "You will be logged out from all devices including this one. You'll need to sign in again.",
      confirmLabel: "Log Out All",
      onConfirm: async () => {
        await signOut();
      },
    });
  }

  const passwordStrength = getPasswordStrength(newPassword);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your profile, security, and preferences
        </p>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-3 ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          )}
          {message.text}
        </div>
      )}

      {/* Section 1: Profile */}
      <section className="card p-6">
        <SectionHeader
          title="Profile"
          description="Your personal information"
        />

        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Avatar Upload */}
          <div>
            <label className="label">Profile Photo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg
                    className="w-8 h-8 text-slate-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                )}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAvatarUpload(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary text-sm"
                >
                  {uploading ? "Uploading..." : "Upload photo"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="text-sm text-red-600 hover:text-red-700 ml-3"
                  >
                    Remove
                  </button>
                )}
                <p className="text-xs text-slate-400 mt-1.5">
                  PNG, JPG up to 2MB
                </p>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="label">Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="label">Business Name</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="input"
                placeholder="Acme Enterprises"
              />
            </div>
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                value={user?.email ?? ""}
                readOnly
                className="input bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1">
                Email cannot be changed
              </p>
            </div>
            <div>
              <label className="label">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
                placeholder="+91 9876543210"
              />
            </div>
            <div>
              <label className="label">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="input"
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Time Zone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input"
              >
                {TIME_ZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="input"
              >
                <option value="en">English</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">
                More languages coming soon
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </section>

      {/* Section 2: Security */}
      <section className="card p-6">
        <SectionHeader
          title="Security"
          description="Manage your password and sessions"
        />

        <div className="space-y-8">
          {/* Change Password */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4">
              Change Password
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPasswords ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="input pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPasswords ? (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type={showPasswords ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Password Strength Indicator */}
              {newPassword && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{
                          width: `${(passwordStrength.score / 6) * 100}%`,
                        }}
                      />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        passwordStrength.label === "Weak"
                          ? "text-red-600"
                          : passwordStrength.label === "Fair"
                          ? "text-amber-600"
                          : passwordStrength.label === "Good"
                          ? "text-blue-600"
                          : "text-green-600"
                      }`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li
                      className={
                        newPassword.length >= 8 ? "text-green-600" : ""
                      }
                    >
                      {newPassword.length >= 8 ? "✓" : "○"} At least 8
                      characters
                    </li>
                    <li
                      className={
                        /[A-Z]/.test(newPassword) ? "text-green-600" : ""
                      }
                    >
                      {/[A-Z]/.test(newPassword) ? "✓" : "○"} Uppercase letter
                    </li>
                    <li
                      className={
                        /[0-9]/.test(newPassword) ? "text-green-600" : ""
                      }
                    >
                      {/[0-9]/.test(newPassword) ? "✓" : "○"} Number
                    </li>
                    <li
                      className={
                        /[^A-Za-z0-9]/.test(newPassword)
                          ? "text-green-600"
                          : ""
                      }
                    >
                      {/[^A-Za-z0-9]/.test(newPassword) ? "✓" : "○"} Special
                      character
                    </li>
                  </ul>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={
                    changingPassword ||
                    !currentPassword ||
                    !newPassword ||
                    newPassword !== confirmPassword
                  }
                  className="btn-primary"
                >
                  {changingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>

          {/* Login Sessions */}
          <div className="border-t border-slate-200 pt-8">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">
              Login Sessions
            </h3>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-primary-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {currentSession.device}
                    </p>
                    <p className="text-xs text-slate-500">
                      {currentSession.browser} • {currentSession.location}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Active Now
                  </span>
                  <p className="text-xs text-slate-400 mt-1">
                    Last login:{" "}
                    {new Date(currentSession.lastLogin).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    title: "Log Out This Device",
                    message: "You will be signed out and need to log in again.",
                    confirmLabel: "Log Out",
                    onConfirm: async () => {
                      await signOut();
                    },
                  })
                }
                className="btn-secondary text-sm"
              >
                Log Out This Device
              </button>
              <button
                onClick={handleLogoutAllDevices}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Log Out All Devices
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Notification Preferences */}
      <section className="card p-6">
        <SectionHeader
          title="Notification Preferences"
          description="Choose how you want to be notified"
        />

        <div className="divide-y divide-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Email Notifications
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Receive email updates about your account
            </p>
            <Toggle
              enabled={notifications.invoiceCreated}
              onChange={(enabled) =>
                setNotifications({ ...notifications, invoiceCreated: enabled })
              }
              label="Invoice Created"
              description="Get notified when a new invoice is created"
            />
            <Toggle
              enabled={notifications.invoicePaid}
              onChange={(enabled) =>
                setNotifications({ ...notifications, invoicePaid: enabled })
              }
              label="Invoice Paid"
              description="Get notified when an invoice is marked as paid"
            />
            <Toggle
              enabled={notifications.invoiceOverdue}
              onChange={(enabled) =>
                setNotifications({ ...notifications, invoiceOverdue: enabled })
              }
              label="Invoice Overdue"
              description="Get notified when an invoice becomes overdue"
            />
            <Toggle
              enabled={notifications.billingUpdates}
              onChange={(enabled) =>
                setNotifications({ ...notifications, billingUpdates: enabled })
              }
              label="Billing Updates"
              description="Receive updates about payments and subscriptions"
            />
            <Toggle
              enabled={notifications.productUpdates}
              onChange={(enabled) =>
                setNotifications({ ...notifications, productUpdates: enabled })
              }
              label="Product Updates"
              description="Learn about new features and improvements"
            />
          </div>
        </div>
      </section>

      {/* Section 4: Danger Zone */}
      <section className="rounded-xl border-2 border-red-200 bg-red-50/30 p-6">
        <SectionHeader
          title="Danger Zone"
          description="Irreversible actions for your account"
        />

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">
                Export Your Data
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Download all your invoices, clients, and profile data
              </p>
            </div>
            <button onClick={handleExportData} className="btn-secondary text-sm">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export Data
            </button>
          </div>

          <div className="border-t border-red-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-red-900">
                Delete Account
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Permanently delete your account and all associated data
              </p>
            </div>
            <button
              onClick={handleDeleteAccount}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700 transition active:scale-[0.98]"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Account
            </button>
          </div>
        </div>
      </section>

      {/* Confirmation Modal */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.open}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          variant={confirmModal.variant}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
