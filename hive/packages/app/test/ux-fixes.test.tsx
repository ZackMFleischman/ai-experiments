// First-real-game UX batch: status-gated waiting screen with a re-shareable
// invite (link + code), join-by-typed-code, your-turn indicator, empty-board
// hint, normalized guide glyphs + rules summary, long-press piece info.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameBoard } from '../src/board/GameBoard';
import { HandTray } from '../src/board/HandTray';
import { PieceArtProvider } from '../src/board/pieceArt';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { GameScreen } from '../src/game/GameScreen';
import { PieceGuideDialog } from '../src/game/PieceGuide';
import { GAME_RULES } from '../src/game/pieceInfo';
import { PlayerBar } from '../src/game/PlayerBar';
import { JoinByCodeButton } from '../src/screens/JoinByCode';
import { Lobby } from '../src/screens/Lobby';
import { ChallengeReceived, WaitingForOpponent } from '../src/screens/waitingView';
import { ALL_ON } from './replay';

function mockRect(el: Element) {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 }) as DOMRect;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WaitingForOpponent (open games keep the invite shareable)', () => {
  it('shows the invite as a link AND a bare code', () => {
    render(
      <MemoryRouter>
        <WaitingForOpponent code="HK4M2XQ9" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('waiting-for-opponent')).toBeTruthy();
    expect(screen.getByTestId('invite-url')).toHaveProperty(
      'value',
      `${window.location.origin}/join/HK4M2XQ9`,
    );
    expect(screen.getByTestId('invite-code').textContent).toBe('HK4M2XQ9');
    expect(screen.getByTestId('copy-invite')).toBeTruthy();
    expect(screen.getByTestId('copy-code')).toBeTruthy();
  });

  it('degrades gracefully for pre-inviteCode game docs', () => {
    render(
      <MemoryRouter>
        <WaitingForOpponent code={undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('waiting-for-opponent')).toBeTruthy();
    expect(screen.queryByTestId('invite-code')).toBeNull();
  });

  it('offers to cancel the pending invite', () => {
    const onCancel = vi.fn();
    render(
      <MemoryRouter>
        <WaitingForOpponent code="HK4M2XQ9" onCancel={onCancel} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('cancel-invite'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the challenge-sent variant instead of an invite when addressed', () => {
    render(
      <MemoryRouter>
        <WaitingForOpponent challengeName="Sam" onCancel={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('waiting-for-opponent').textContent).toMatch(/challenge is out to Sam/i);
    expect(screen.queryByTestId('invite-code')).toBeNull();
    expect(screen.getByTestId('cancel-invite').textContent).toMatch(/withdraw/i);
  });
});

describe('ChallengeReceived (the challenged player opens the game link)', () => {
  it('names the challenger and wires accept/decline', () => {
    const onRespond = vi.fn();
    render(
      <MemoryRouter>
        <ChallengeReceived name="Ada" onRespond={onRespond} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('challenge-received').textContent).toMatch(/Ada challenges you/i);
    fireEvent.click(screen.getByTestId('challenge-accept'));
    expect(onRespond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByTestId('challenge-decline'));
    expect(onRespond).toHaveBeenCalledWith(false);
  });
});

describe('Pillbug toss discoverability', () => {
  // Straight-line placements: white chain grows left, black grows right, so
  // wG1 ends up a leaf beside the pillbug and genuine toss moves exist.
  function tossPosition(): GameController {
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    const play = (kind: Parameters<GameController['selectHandBug']>[0], q: number) => {
      c.selectHandBug(kind);
      c.selectCell({ q, r: 0 });
    };
    play('S', 0); // w
    play('S', 1); // b
    play('Q', -1); // w
    play('Q', 2); // b
    play('P', -2); // w
    play('G', 3); // b
    play('G', -3); // w
    play('A', 4); // b
    return c; // white to move; wP at -2,0; leaf wG1 at -3,0
  }

  it('selecting the pillbug raises the toss hint', () => {
    const c = tossPosition();
    c.selectCell({ q: -2, r: 0 });
    expect(c.getSnapshot().tossHint).toBe(true);
    render(
      <MemoryRouter>
        <GameScreen controller={c} staticMode />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('toss-hint')).toBeTruthy();
  });

  it('selecting the neighbour exposes the toss destinations', () => {
    const c = tossPosition();
    c.selectCell({ q: -3, r: 0 }); // the tossable grasshopper
    const targets = c.getSnapshot().targets;
    expect(targets.has('-2,-1')).toBe(true); // an empty cell beside the pillbug
  });

  it('a non-toss selection never hints', () => {
    const c = tossPosition();
    c.selectCell({ q: -3, r: 0 });
    expect(c.getSnapshot().tossHint).toBe(false);
  });
});

function JoinProbe() {
  return <div data-testid="join-route">{useParams<{ code: string }>().code}</div>;
}

describe('Join with a typed code', () => {
  function renderLobbyStub() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<JoinByCodeButton />} />
          <Route path="/join/:code" element={<JoinProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('routes a valid code to /join/{CODE}, uppercased', () => {
    renderLobbyStub();
    fireEvent.click(screen.getByTestId('join-by-code'));
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'hk4m2xq9' } });
    fireEvent.click(screen.getByTestId('join-code-go'));
    expect(screen.getByTestId('join-route').textContent).toBe('HK4M2XQ9');
  });

  it('rejects malformed codes (lookalike alphabet, 8 chars)', () => {
    renderLobbyStub();
    fireEvent.click(screen.getByTestId('join-by-code'));
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'HK4M' } });
    expect(screen.getByTestId('join-code-go')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'HK4M2XQ0' } }); // 0 is not in the alphabet
    expect(screen.getByTestId('join-code-go')).toHaveProperty('disabled', true);
  });
});

describe('PlayerBar turn indicator (multiplayer)', () => {
  const names = { white: 'Zack', black: 'Sam' };

  it('marks the local seat and shows an explicit turn chip', () => {
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON, 'w');
    const snap = c.getSnapshot(); // white to move, my seat
    render(<PlayerBar snap={snap} color="w" names={names} />);
    expect(screen.getByTestId('player-bar-w').textContent).toContain('Zack');
    expect(screen.getByTestId('player-bar-w').textContent).toContain('(you)');
    expect(screen.getByTestId('turn-chip').textContent).toBe('Your turn');
  });

  it("shows Their turn on the opponent's bar when it isn't mine", () => {
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON, 'b');
    const snap = c.getSnapshot(); // white to move, I play black
    render(<PlayerBar snap={snap} color="w" names={names} />);
    expect(screen.getByTestId('turn-chip').textContent).toBe('Their turn');
  });

  it('hot-seat keeps the subtle highlight without a chip', () => {
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    render(<PlayerBar snap={c.getSnapshot()} color="w" />);
    expect(screen.queryByTestId('turn-chip')).toBeNull();
  });
});

describe('Empty-board hint', () => {
  it('invites the first placement when the player can act', () => {
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    render(<GameBoard controller={c} />);
    expect(screen.getByTestId('empty-board-hint').textContent).toContain('first tile');
  });

  it('says waiting when the opponent opens', () => {
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON, 'b'); // white moves first
    render(<GameBoard controller={c} />);
    expect(screen.getByTestId('empty-board-hint').textContent).toContain('Waiting');
  });

  it('disappears once a tile is on the board', () => {
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    c.selectHandBug('S');
    c.selectCell({ q: 0, r: 0 });
    render(<GameBoard controller={c} />);
    expect(screen.queryByTestId('empty-board-hint')).toBeNull();
  });
});

describe('Long-press piece info', () => {
  it('board: holding a piece surfaces its kind, release hides it', () => {
    vi.useFakeTimers();
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    c.selectHandBug('S');
    c.selectCell({ q: 0, r: 0 });
    const onInfo = vi.fn();
    const { container } = render(<GameBoard controller={c} onPieceInfo={onInfo} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    fireEvent.pointerDown(container.querySelector('[data-cell="0,0"]') as Element, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    vi.advanceTimersByTime(600);
    expect(onInfo).toHaveBeenLastCalledWith('S');
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onInfo).toHaveBeenLastCalledWith(null);
  });

  it('board: a real drag replaces the info card', () => {
    vi.useFakeTimers();
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    c.selectHandBug('S');
    c.selectCell({ q: 0, r: 0 });
    c.selectHandBug('S');
    c.selectCell({ q: 1, r: 0 });
    c.selectHandBug('Q');
    c.selectCell({ q: -1, r: 0 });
    c.selectHandBug('Q');
    c.selectCell({ q: 2, r: 0 });
    const onInfo = vi.fn();
    const { container } = render(<GameBoard controller={c} onPieceInfo={onInfo} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    fireEvent.pointerDown(container.querySelector('[data-cell="-1,0"]') as Element, {
      pointerId: 1,
      clientX: 300,
      clientY: 200,
    });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 360, clientY: 260 });
    vi.advanceTimersByTime(600);
    // The timer was cancelled by the drag: never called with a kind.
    expect(onInfo).not.toHaveBeenCalledWith('Q');
  });

  it('board: a draggable piece NEVER grows the card (it would cover targets)', () => {
    vi.useFakeTimers();
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    c.selectHandBug('S');
    c.selectCell({ q: 0, r: 0 });
    c.selectHandBug('S');
    c.selectCell({ q: 1, r: 0 });
    c.selectHandBug('Q');
    c.selectCell({ q: -1, r: 0 });
    c.selectHandBug('Q');
    c.selectCell({ q: 2, r: 0 });
    const onInfo = vi.fn();
    const { container } = render(<GameBoard controller={c} onPieceInfo={onInfo} />);
    mockRect(screen.getByTestId('board-view'));
    expect(c.getSnapshot().movableCells.has('-1,0')).toBe(true); // white queen, white to move
    fireEvent.pointerDown(container.querySelector('[data-cell="-1,0"]') as Element, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    vi.advanceTimersByTime(1000);
    expect(onInfo).not.toHaveBeenCalledWith('Q');
  });

  it('tray: presses start placements, never the info card', () => {
    vi.useFakeTimers();
    const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    render(<HandTray controller={c} />);
    fireEvent.pointerDown(screen.getByTestId('tray-A'));
    vi.advanceTimersByTime(1000);
    expect(c.getSnapshot().selection?.kind).toBe('hand'); // the press selected the bug
    // and the tile still carries the hover title for desktop
    expect(screen.getByTestId('tray-A').getAttribute('title')).toContain('Ant');
  });
});

describe('Piece guide', () => {
  it('normalizes glyph size and lists the rest of the rules', () => {
    const { baseElement } = render(<PieceGuideDialog open onClose={() => {}} />);
    // Every guide tile renders through FittedGlyph (a scale() wrapper).
    const fitted = baseElement.querySelectorAll('svg g[transform^="scale("]');
    expect(fitted.length).toBe(8);
    const summary = screen.getByTestId('rules-summary');
    for (const rule of GAME_RULES) {
      expect(summary.textContent).toContain(rule.title);
    }
  });

  it('hosts the bear-mode toggle and retitles the pieces live', () => {
    render(
      <PieceArtProvider>
        <PieceGuideDialog open onClose={() => {}} />
      </PieceArtProvider>,
    );
    expect(screen.queryByText('Brown bear · Queen Bee')).toBeNull();
    fireEvent.click(screen.getByTestId('guide-bear-toggle'));
    expect(screen.getByText('Brown bear · Queen Bee')).toBeTruthy();
    fireEvent.click(screen.getByTestId('guide-bear-toggle'));
    expect(screen.queryByText('Brown bear · Queen Bee')).toBeNull();
  });
});

describe('Settings reachability', () => {
  it('the lobby links to /settings', () => {
    render(
      <MemoryRouter>
        <Lobby />
      </MemoryRouter>,
    );
    const gear = screen.getByTestId('lobby-settings');
    expect(gear.getAttribute('href')).toBe('/settings');
  });
});
