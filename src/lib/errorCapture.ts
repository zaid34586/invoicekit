// Lightweight production error capture without a third-party SDK.
// Collects unhandled errors/rejections into a small ring buffer and exposes
// them for support/debugging (and a future endpoint) instead of failing
// silently. Never sends data anywhere by itself.

const MAX = 40;
type Captured = {
  ts: string;
  type: "error" | "unhandledrejection";
  message: string;
  detail?: string;
};

const buffer: Captured[] = [];

export function captureError(err: unknown, detail?: string) {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  buffer.push({ ts: new Date().toISOString(), type: "error", message, detail });
  if (buffer.length > MAX) buffer.shift();
  // Always keep console visibility for developers debugging locally.
  console.error("[rivox:capture]", message, detail ?? "");
}

export function getCapturedErrors(): Captured[] {
  return [...buffer];
}

export function initErrorCapture() {
  window.addEventListener("error", (e) => captureError(e.error ?? e.message, e.filename));
  window.addEventListener("unhandledrejection", (e) =>
    captureError(e.reason, "unhandledrejection")
  );
}
