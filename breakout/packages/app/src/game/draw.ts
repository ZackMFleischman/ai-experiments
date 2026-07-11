// The single render pass: world state → one canvas frame. Pure given a 2D
// context — all sizing comes from @parlor/arcade's letterbox so the court
// keeps its aspect in any container; all color comes from the caller (the
// MUI theme), so light/dark render from the same code.
import {
  BALL,
  PADDLE,
  WORLD,
  brickRect,
  type BreakoutState,
} from '@breakout/engine';
import { letterbox } from '@parlor/arcade';

export interface CourtPalette {
  /** The page background the court sits on. */
  paper: string;
  /** Court surface — a step off the paper. */
  court: string;
  /** Single-hit bricks + court line work. */
  ink: string;
  /** Paddle, ball, and hardened (two-hit) bricks. */
  accent: string;
}

export interface Canvas2dLike {
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  translate(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
}

/** Draw one frame into a backing store of pixelWidth×pixelHeight. */
export function drawGame(
  ctx: Canvas2dLike,
  state: BreakoutState,
  pixelWidth: number,
  pixelHeight: number,
  palette: CourtPalette,
): void {
  const vp = letterbox(pixelWidth, pixelHeight, WORLD.width, WORLD.height);
  ctx.save();
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  ctx.translate(vp.left, vp.top);
  ctx.scale(vp.scale, vp.scale);

  // The court.
  ctx.fillStyle = palette.court;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // Bricks, inset in their cells; hardened bricks carry the accent.
  for (let index = 0; index < state.bricks.length; index++) {
    const hp = state.bricks[index] ?? 0;
    if (hp <= 0) continue;
    const rect = brickRect(index);
    ctx.fillStyle = hp >= 2 ? palette.accent : palette.ink;
    ctx.beginPath();
    ctx.roundRect(rect.x + 0.75, rect.y + 0.75, rect.width - 1.5, rect.height - 1.5, 1.25);
    ctx.fill();
  }

  // Paddle.
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.roundRect(
    state.paddleX - PADDLE.width / 2,
    PADDLE.y,
    PADDLE.width,
    PADDLE.height,
    PADDLE.height / 2,
  );
  ctx.fill();

  // Ball — riding the paddle while serving.
  const ballX = state.ball?.x ?? state.paddleX;
  const ballY = state.ball?.y ?? PADDLE.y - BALL.radius;
  if (state.phase !== 'game-over') {
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Reserve balls wait quietly in the bottom corner.
  for (let i = 0; i < state.lives - 1; i++) {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(WORLD.width - 4 - i * 5, WORLD.height - 4, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
