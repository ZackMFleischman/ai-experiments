import { Events } from "./events";
import { Signal, type SignalLike, asSignal } from "./signal";

/**
 * Exponential smoothing toward `target` with time constant `tau` seconds.
 * Starts from 0; tau <= 0 passes through.
 */
export function lagSignal(target: SignalLike, tau: SignalLike): Signal<number> {
  const targetS = asSignal(target);
  const tauS = asSignal(tau);
  let value = 0;
  return new Signal((f) => {
    const t = targetS.get(f);
    const tc = tauS.get(f);
    if (tc <= 0) {
      value = t;
      return value;
    }
    const alpha = 1 - Math.exp(-f.dt / tc);
    value += (t - value) * alpha;
    return value;
  });
}

export type LfoShape = "sine" | "saw" | "square";

export interface LfoOpts {
  shape?: LfoShape;
  /** Cycle length in beats (against the supplied beats signal). */
  periodBeats?: number;
  /** Duty cycle for square. */
  width?: number;
}

/**
 * Low-frequency oscillator in [0, 1], phase-locked to a running beat count
 * (use TimeBus.beats for beat-sync, or any monotonic signal).
 */
export function lfoSignal(beats: Signal<number>, opts: LfoOpts = {}): Signal<number> {
  const shape = opts.shape ?? "sine";
  const period = opts.periodBeats ?? 1;
  const width = opts.width ?? 0.5;
  return beats.map((b) => {
    const phase = ((b / period) % 1 + 1) % 1;
    switch (shape) {
      case "sine":
        return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      case "saw":
        return phase;
      case "square":
        return phase < width ? 1 : 0;
    }
  });
}

export interface EnvelopeOpts {
  /** Exponential decay time constant, seconds. */
  decay?: number;
}

/**
 * Events -> AR-ish envelope: jumps to 1 on any event, decays exponentially.
 * The M1 way to make onsets punch visuals; `trigger` (full AR) arrives in M5.
 */
export function envelopeSignal(trigger: Events<unknown>, opts: EnvelopeOpts = {}): Signal<number> {
  const decay = opts.decay ?? 0.15;
  let value = 0;
  return new Signal((f) => {
    if (trigger.poll(f).length > 0) {
      value = 1;
    } else {
      value *= Math.exp(-f.dt / Math.max(decay, 1e-4));
    }
    return value;
  });
}
