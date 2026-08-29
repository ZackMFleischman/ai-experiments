// T7.5: the pre-game guest list (DECISIONS 2026-08-28 — invitations reserve
// nothing, first come first served; a decline moves a name and never deletes
// the game). Pure transitions, so no emulator is needed here; the callable
// shells around them are covered by the games' functions suites.
import { describe, expect, it } from 'vitest';
import {
  declineInvite,
  emptyGuestList,
  guestListOf,
  inviteToList,
  joinRoster,
  leaveList,
  playerIdsOf,
  previewOf,
  resolveSeatOrder,
  type GuestList,
} from '../src/roster.js';

const ada = { uid: 'u-ada', name: 'Ada' };
const sam = { uid: 'u-sam', name: 'Sam' };
const lee = { uid: 'u-lee', name: 'Lee' };
const kim = { uid: 'u-kim', name: 'Kim' };

const listOf = (over: Partial<GuestList> = {}): GuestList => ({
  roster: [ada],
  invited: [],
  declined: [],
  ...over,
});

describe('joining', () => {
  it('appends in arrival order — the host is always roster[0]', () => {
    const list = joinRoster(joinRoster(emptyGuestList(ada), sam, 4), lee, 4);
    expect(list.roster.map((e) => e.name)).toEqual(['Ada', 'Sam', 'Lee']);
  });

  it('clears the joiner from invited and declined — no double-counting', () => {
    const invitedThenJoined = joinRoster(listOf({ invited: [sam], declined: [lee] }), sam, 4);
    expect(invitedThenJoined.invited).toEqual([]);
    expect(joinRoster(invitedThenJoined, lee, 4).declined).toEqual([]);
  });

  it('refuses a second join and a full table', () => {
    const list = joinRoster(emptyGuestList(ada), sam, 2);
    expect(() => joinRoster(list, sam, 4)).toThrow(/already in this game/);
    expect(() => joinRoster(list, lee, 2)).toThrow(/full/);
  });
});

describe('inviting', () => {
  it('adds names without reserving a seat, and skips anyone already there', () => {
    const list = inviteToList(listOf({ invited: [sam] }), [sam, lee, ada]);
    expect(list.invited.map((e) => e.name)).toEqual(['Sam', 'Lee']);
    expect(list.roster.map((e) => e.name)).toEqual(['Ada']);
  });

  it('re-inviting someone who declined moves them back to invited', () => {
    const list = inviteToList(listOf({ declined: [sam] }), [sam]);
    expect(list.declined).toEqual([]);
    expect(list.invited).toEqual([sam]);
  });
});

describe('declining and leaving', () => {
  it('a decline moves the name and leaves the game standing', () => {
    const list = declineInvite(listOf({ invited: [sam, lee] }), sam.uid);
    expect(list.invited).toEqual([lee]);
    expect(list.declined).toEqual([sam]);
    expect(list.roster).toEqual([ada]);
  });

  it('refuses a decline from someone never invited', () => {
    expect(() => declineInvite(listOf(), sam.uid)).toThrow(/no invitation/);
  });

  it('leaving drops you entirely and records nothing — the host may re-invite', () => {
    const joined = joinRoster(listOf({ invited: [lee] }), sam, 4);
    const left = leaveList(joined, sam.uid);
    expect(left.roster).toEqual([ada]);
    expect(left.declined).toEqual([]);
    expect(leaveList(joined, lee.uid).invited).toEqual([]);
  });

  it('the next roster member becomes the host when the host leaves', () => {
    const list = leaveList(joinRoster(joinRoster(emptyGuestList(ada), sam, 4), lee, 4), ada.uid);
    expect(list.roster[0]).toEqual(sam);
  });

  it('refuses a leave from a stranger', () => {
    expect(() => leaveList(listOf(), kim.uid)).toThrow(/not in this game/);
  });
});

describe('who can see the game', () => {
  it('is the roster plus anyone still holding an invitation', () => {
    const list = listOf({ roster: [ada, sam], invited: [lee], declined: [kim] });
    expect(playerIdsOf(list)).toEqual(['u-ada', 'u-sam', 'u-lee']);
  });

  it('drops the reader as soon as they decline', () => {
    expect(playerIdsOf(declineInvite(listOf({ invited: [lee] }), lee.uid))).toEqual(['u-ada']);
  });
});

describe('the invite preview', () => {
  it('carries names and counts but never a uid', () => {
    const preview = previewOf(listOf({ roster: [ada, sam], invited: [lee] }), 4);
    expect(preview).toEqual({ hostName: 'Ada', names: ['Ada', 'Sam'], filled: 2, maxPlayers: 4 });
    expect(JSON.stringify(preview)).not.toContain('u-');
  });
});

describe('reading a guest list off a doc', () => {
  it('defaults every list to empty for a pre-M7 (two-seat) doc', () => {
    expect(guestListOf({ status: 'open' })).toEqual({ roster: [], invited: [], declined: [] });
  });

  it('round-trips a written one', () => {
    const list = listOf({ roster: [ada, sam], invited: [lee], declined: [kim] });
    expect(guestListOf({ ...list })).toEqual(list);
  });
});

describe('resolveSeatOrder', () => {
  const roster = [ada, sam, lee];

  it('host-seat puts the host at that index, the rest in join order', () => {
    expect(resolveSeatOrder({ mode: 'host-seat', seat: 0 }, roster)).toEqual([ada, sam, lee]);
    expect(resolveSeatOrder({ mode: 'host-seat', seat: 1 }, roster)).toEqual([sam, ada, lee]);
    expect(resolveSeatOrder({ mode: 'host-seat', seat: 2 }, roster)).toEqual([sam, lee, ada]);
    // Out of range clamps rather than throwing — the roster shrank under it.
    expect(resolveSeatOrder({ mode: 'host-seat', seat: 9 }, roster)).toEqual([sam, lee, ada]);
  });

  it('arrange follows the stored order', () => {
    expect(resolveSeatOrder({ mode: 'arrange', order: ['u-lee', 'u-ada', 'u-sam'] }, roster)).toEqual([
      lee,
      ada,
      sam,
    ]);
  });

  it('arrange APPENDS a newcomer the host never arranged, in join order', () => {
    // The trap: a stored arrangement predates the last joiner, so treating it
    // as a permutation would drop Kim (or fail the check) at auto-start.
    const late = [...roster, kim];
    expect(resolveSeatOrder({ mode: 'arrange', order: ['u-lee', 'u-ada', 'u-sam'] }, late)).toEqual([
      lee,
      ada,
      sam,
      kim,
    ]);
  });

  it('arrange ignores a uid that has since left', () => {
    expect(resolveSeatOrder({ mode: 'arrange', order: ['u-kim', 'u-sam'] }, roster)).toEqual([
      sam,
      ada,
      lee,
    ]);
  });

  it('random is a permutation of the roster, every time', () => {
    for (let i = 0; i < 50; i++) {
      const order = resolveSeatOrder({ mode: 'random' }, roster);
      expect([...order].sort((a, b) => a.uid.localeCompare(b.uid))).toEqual(
        [...roster].sort((a, b) => a.uid.localeCompare(b.uid)),
      );
    }
  });
});
