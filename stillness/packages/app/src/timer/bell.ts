// The end-of-sit bell, synthesized: two detuned partials with a long
// exponential decay — a struck bowl, not a notification ping. Zero audio
// assets keeps the bundle tiny and the offline story trivial. Foreground
// only by nature (WebAudio); a backgrounded phone chimes via the scheduled
// local notification instead (Sit.tsx). Never throws — jsdom and ancient
// browsers just stay silent.

export function ringBell(): void {
  try {
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const strike = (frequency: number, gain: number, decaySeconds: number) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      amp.gain.setValueAtTime(gain, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decaySeconds);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + decaySeconds);
    };
    strike(432, 0.35, 6); // fundamental
    strike(864.9, 0.12, 4.5); // slightly sharp octave — the bowl's shimmer
    strike(1297, 0.05, 3);
    setTimeout(() => void ctx.close().catch(() => undefined), 6500);
  } catch {
    // silence is acceptable; a broken bell must never break the sit
  }
}
