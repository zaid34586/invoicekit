export type SignatureStyle = "elegant" | "flowing" | "bold" | "classic";
export type StampShape = "circle" | "square";

interface SignatureFontDef { family: string; googleFont: string; size: number }

export const SIGNATURE_STYLES: Record<SignatureStyle, SignatureFontDef & { label: string }> = {
  elegant: { label: "Elegant", family: "'Dancing Script', cursive", googleFont: "Dancing+Script:wght@600", size: 62 },
  flowing: { label: "Flowing", family: "'Great Vibes', cursive", googleFont: "Great+Vibes", size: 68 },
  bold: { label: "Bold", family: "'Pacifico', cursive", googleFont: "Pacifico", size: 50 },
  classic: { label: "Classic", family: "'Sacramento', cursive", googleFont: "Sacramento", size: 66 },
};

const loadedFonts = new Set<string>();

/** Injects the Google Fonts <link> for a signature style once, and waits for it to be usable. */
async function ensureFontLoaded(style: SignatureStyle): Promise<void> {
  const def = SIGNATURE_STYLES[style];
  if (!loadedFonts.has(style)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${def.googleFont}&display=swap`;
    document.head.appendChild(link);
    loadedFonts.add(style);
  }
  try {
    await document.fonts?.load(`${def.size}px ${def.family}`);
    await document.fonts?.ready;
  } catch {
    // If font loading APIs aren't available, fall back to whatever renders (still legible).
  }
}

export async function renderSignatureToDataUrl(name: string, style: SignatureStyle, color: string): Promise<string> {
  await ensureFontLoaded(style);
  const def = SIGNATURE_STYLES[style];
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 220;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = `${def.size}px ${def.family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.trim() || "Your Name", canvas.width / 2, canvas.height / 2 - 10);
  // a light flourish underline gives it a signed-document feel
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.22, canvas.height * 0.72);
  ctx.bezierCurveTo(canvas.width * 0.4, canvas.height * 0.8, canvas.width * 0.6, canvas.height * 0.64, canvas.width * 0.78, canvas.height * 0.72);
  ctx.stroke();
  return canvas.toDataURL("image/png");
}

function drawArcText(ctx: CanvasRenderingContext2D, text: string, radius: number, totalAngleDeg: number, font: string, color: string, flip = false) {
  const chars = text.split("");
  const totalAngle = (totalAngleDeg * Math.PI) / 180;
  const step = chars.length > 1 ? totalAngle / (chars.length - 1) : 0;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.rotate(-totalAngle / 2);
  for (const ch of chars) {
    ctx.save();
    ctx.rotate(flip ? Math.PI : 0);
    ctx.translate(0, flip ? radius : -radius);
    ctx.rotate(flip ? Math.PI : 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    ctx.rotate(step);
  }
  ctx.restore();
}

export async function renderStampToDataUrl(
  lines: { top: string; middle: string; bottom: string },
  shape: StampShape,
  color: string,
): Promise<string> {
  const size = 320;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate((-7 * Math.PI) / 180); // a slight tilt reads as "stamped", not "designed"
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (shape === "circle") {
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 140, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 128, 0, Math.PI * 2); ctx.stroke();
    if (lines.top) drawArcText(ctx, lines.top.toUpperCase(), 108, Math.min(160, lines.top.length * 16), "bold 17px Arial", color, false);
    if (lines.bottom) drawArcText(ctx, lines.bottom.toUpperCase(), 108, Math.min(160, lines.bottom.length * 16), "bold 15px Arial", color, true);
    ctx.font = "bold 30px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lines.middle.toUpperCase() || "APPROVED", 0, 6);
    ctx.beginPath(); ctx.moveTo(-60, 30); ctx.lineTo(60, 30); ctx.lineWidth = 2; ctx.stroke();
  } else {
    const half = 118;
    ctx.lineWidth = 4;
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    ctx.lineWidth = 2;
    ctx.strokeRect(-half + 10, -half + 10, half * 2 - 20, half * 2 - 20);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (lines.top) { ctx.font = "bold 16px Arial"; ctx.fillText(lines.top.toUpperCase(), 0, -60); }
    ctx.font = "bold 28px Georgia";
    ctx.fillText(lines.middle.toUpperCase() || "APPROVED", 0, 6);
    if (lines.bottom) { ctx.font = "bold 15px Arial"; ctx.fillText(lines.bottom.toUpperCase(), 0, 60); }
  }

  return canvas.toDataURL("image/png");
}
