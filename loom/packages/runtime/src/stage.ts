import type { FrameCtx } from "./frame";

/** What the engine's compositor should do this frame. */
export type StageDirective =
  | { mode: "single"; live: string | null }
  | { mode: "crossfade"; live: string; staged: string; mix: number }
  | { mode: "hold" };

interface Fade {
  from: string;
  to: string;
  /** First frame of the fade (frame boundary after commit was called). */
  start: number;
  duration: number;
}

/**
 * The slot/commit machinery (R4.1/R4.2), pure state: which instance is LIVE,
 * which is staged, crossfade progress, and PANIC. The engine calls tick()
 * once per frame and renders whatever the directive says. Stage knows ids
 * only — instance lifecycles live in the engine's session registry.
 */
export class Stage {
  private liveId: string | null;
  private stagedId: string | null = null;
  private fade: Fade | null = null;
  private held = false;

  constructor(initialLive: string | null = null) {
    this.liveId = initialLive;
  }

  get live(): string | null {
    return this.liveId;
  }

  get staged(): string | null {
    return this.stagedId;
  }

  get panicked(): boolean {
    return this.held;
  }

  get fading(): boolean {
    return this.fade !== null;
  }

  stage(id: string): void {
    if (id === this.liveId) throw new Error(`"${id}" is already live`);
    this.stagedId = id;
  }

  /**
   * Boot/recovery only: make an instance live when nothing is. Every other
   * LIVE change must go through commit() — the audience-safety invariant.
   */
  adoptLive(id: string): void {
    if (this.liveId !== null) {
      throw new Error(`cannot adopt "${id}" — "${this.liveId}" is live; use commit()`);
    }
    this.liveId = id;
    if (this.stagedId === id) this.stagedId = null;
  }

  unstage(): void {
    this.stagedId = null;
    this.fade = null; // a fade only exists toward a staged candidate
  }

  /**
   * Begin the crossfade to the staged candidate at the next frame boundary.
   * The audience-facing transition: only this (and panic) may change LIVE.
   */
  commit(f: FrameCtx, durationFrames = 60): void {
    if (this.held) throw new Error("PANIC is engaged — resume before committing");
    if (this.fade) throw new Error("a commit is already in progress");
    if (this.stagedId === null || this.liveId === null) {
      throw new Error("nothing staged to commit");
    }
    this.fade = {
      from: this.liveId,
      to: this.stagedId,
      start: f.frame + 1,
      duration: Math.max(0, Math.floor(durationFrames)), // 0 = hard cut at the boundary
    };
  }

  /** Hold the last presented frame. Cancels an in-flight fade — live stays live. */
  panic(): void {
    this.held = true;
    this.fade = null;
  }

  resume(): void {
    this.held = false;
  }

  onInstanceDestroyed(id: string): void {
    if (this.stagedId === id) this.unstage();
    if (this.liveId === id) {
      this.liveId = null;
      this.fade = null;
    }
  }

  tick(f: FrameCtx): StageDirective {
    if (this.held) return { mode: "hold" };
    const fade = this.fade;
    if (fade && f.frame >= fade.start) {
      if (f.frame >= fade.start + fade.duration) {
        this.liveId = fade.to;
        this.stagedId = null;
        this.fade = null;
        return { mode: "single", live: this.liveId };
      }
      // Every fade frame is a true blend: mix walks (0, 1) exclusive, so a
      // duration-N fade spends exactly N frames visibly crossing.
      return {
        mode: "crossfade",
        live: fade.from,
        staged: fade.to,
        mix: (f.frame - fade.start + 1) / (fade.duration + 1),
      };
    }
    return { mode: "single", live: this.liveId };
  }
}
