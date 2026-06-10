export class FpsMeter {
  private frames = 0;
  private last = performance.now();

  constructor(private readonly el: HTMLElement) {}

  tick(): void {
    this.frames++;
    const now = performance.now();
    const elapsed = now - this.last;
    if (elapsed >= 500) {
      const fps = (this.frames * 1000) / elapsed;
      this.el.textContent = `${fps.toFixed(0)} fps`;
      this.frames = 0;
      this.last = now;
    }
  }
}
