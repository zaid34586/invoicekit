// Plays a short, pleasant two-tone "ding" for new notifications/messages.
// Uses the Web Audio API directly instead of an <audio> file so there's
// no asset to bundle, host, or have fail to load — it works everywhere the
// app already runs.
let ctx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (!ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const notes: [number, number][] = [
      [880, now], // A5
      [1318.51, now + 0.09], // E6
    ];

    notes.forEach(([freq, start]) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    // Sound is a nice-to-have; never let it break the app.
  }
}
