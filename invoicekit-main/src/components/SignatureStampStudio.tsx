import { useEffect, useState } from "react";
import {
  renderSignatureToDataUrl,
  renderStampToDataUrl,
  SIGNATURE_STYLES,
  type SignatureStyle,
  type StampShape,
} from "../lib/signatureStamp";

interface SignatureStampStudioProps {
  mode: "signature" | "stamp";
  defaultName: string;
  brandColor: string;
  onClose: () => void;
  onApply: (dataUrl: string) => void;
}

export default function SignatureStampStudio({ mode, defaultName, brandColor, onClose, onApply }: SignatureStampStudioProps) {
  const [name, setName] = useState(defaultName || "Your Name");
  const [style, setStyle] = useState<SignatureStyle>("elegant");
  const [color, setColor] = useState(brandColor && brandColor !== "#ffffff" ? brandColor : "#1e293b");
  const [shape, setShape] = useState<StampShape>("circle");
  const [top, setTop] = useState(defaultName || "Your Business");
  const [middle, setMiddle] = useState("APPROVED");
  const [bottom, setBottom] = useState("OFFICIAL");
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const render = mode === "signature"
      ? renderSignatureToDataUrl(name, style, color)
      : renderStampToDataUrl({ top, middle, bottom }, shape, color);
    render.then((url) => { if (!cancelled) { setPreview(url); setBusy(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, name, style, color, shape, top, middle, bottom]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-950">
            {mode === "signature" ? "Design your signature" : "Design your company stamp"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          No upload needed — pick a style and color, we'll generate a clean image for your invoices.
        </p>

        {/* Live preview */}
        <div className="mt-5 grid h-36 place-items-center rounded-xl border border-dashed bg-slate-50">
          {busy && !preview ? (
            <span className="text-xs text-slate-400">Rendering…</span>
          ) : (
            <img src={preview} alt="Preview" className="h-28 object-contain" />
          )}
        </div>

        <div className="mt-5 space-y-4">
          {mode === "signature" ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">Your name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="e.g. Alex Morgan" />
              </label>
              <div>
                <span className="mb-1.5 block text-sm font-bold">Style</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(SIGNATURE_STYLES) as SignatureStyle[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${style === s ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    >
                      {SIGNATURE_STYLES[s].label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="mb-1.5 block text-sm font-bold">Shape</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["circle", "square"] as StampShape[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setShape(s)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${shape === s ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">Top text (business name)</span>
                <input className="input" value={top} onChange={(e) => setTop(e.target.value.slice(0, 24))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">Center text</span>
                <input className="input" value={middle} onChange={(e) => setMiddle(e.target.value.slice(0, 16))} placeholder="APPROVED, PAID, VERIFIED..." />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">Bottom text</span>
                <input className="input" value={bottom} onChange={(e) => setBottom(e.target.value.slice(0, 24))} />
              </label>
            </>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Color</span>
            <div className="flex gap-2">
              <input type="color" className="h-11 w-16 rounded-lg border" value={color} onChange={(e) => setColor(e.target.value)} />
              <input className="input" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => preview && onApply(preview)}
            disabled={!preview || busy}
            className="flex-1 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-600 disabled:opacity-60"
          >
            Use this design
          </button>
        </div>
      </div>
    </div>
  );
}
