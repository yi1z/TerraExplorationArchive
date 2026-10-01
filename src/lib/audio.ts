let context: AudioContext | null = null;
let last = -1;
export function tone(enabled: boolean) {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
    if (context.currentTime - last < 0.08) return;
    last = context.currentTime;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(640, last);
    oscillator.frequency.exponentialRampToValueAtTime(420, last + 0.075);
    gain.gain.setValueAtTime(0.025, last);
    gain.gain.exponentialRampToValueAtTime(0.0001, last + 0.09);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(last + 0.1);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Sound is optional; navigation remains available. */
  }
}
export function closeAudio() {
  if (context) {
    void context.close().catch(() => {});
    context = null;
  }
}
