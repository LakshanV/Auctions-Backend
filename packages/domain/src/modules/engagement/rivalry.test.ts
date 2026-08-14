import { describe, expect, it } from 'vitest';
import {
  RIVALRY_VERSION,
  bidderAlias,
  buildRivalryProjection,
  toRivalryView,
  type LedgerBid,
} from './rivalry';

const NOW = new Date('2026-08-14T00:00:00.000Z');
const A = 'cust_A';
const B = 'cust_B';
const C = 'cust_C';

/** Build an ascending ledger from [bidder, amount] pairs; sequence = index+1. */
function ledger(...pairs: [string, number][]): LedgerBid[] {
  return pairs.map(([bidderId, amountMinor], i) => ({ sequence: i + 1, bidderId, amountMinor }));
}

describe('bidderAlias', () => {
  it('is deterministic, stable and distinct per slot', () => {
    expect(bidderAlias(0)).toBe(bidderAlias(0));
    expect(bidderAlias(0)).not.toBe(bidderAlias(1));
    const first50 = Array.from({ length: 50 }, (_, i) => bidderAlias(i));
    expect(new Set(first50).size).toBe(50); // no collisions
  });

  it('reads as a premium two-word alias, never a real name', () => {
    expect(bidderAlias(0)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('adds a numeric suffix only after the two-word space is exhausted (no count leak early)', () => {
    expect(bidderAlias(255)).not.toMatch(/\d/);
    expect(bidderAlias(256)).toMatch(/\d$/);
  });
});

describe('buildRivalryProjection (pack doc 05)', () => {
  it('stamps the version and handles an empty ledger', () => {
    const p = buildRivalryProjection('auc-1', [], NOW);
    expect(p.version).toBe(RIVALRY_VERSION);
    expect(p).toMatchObject({
      leaderId: null,
      challengerId: null,
      currentHighMinor: null,
      activeBidderCount: 0,
      totalBids: 0,
      leadChanges: 0,
    });
  });

  it('a single bidder leads with no lead changes and no challenger', () => {
    const p = buildRivalryProjection('auc-1', ledger([A, 100], [A, 120]), NOW);
    expect(p.leaderId).toBe(A);
    expect(p.challengerId).toBeNull();
    expect(p.currentHighMinor).toBe(120);
    expect(p.activeBidderCount).toBe(1);
    expect(p.leadChanges).toBe(0); // first bid establishes, but is not a change of hands
  });

  it('counts lead changes and detects the nearest challenger', () => {
    // A leads, B takes it, A retakes it.
    const p = buildRivalryProjection('auc-1', ledger([A, 100], [B, 125], [A, 150]), NOW);
    expect(p.leaderId).toBe(A);
    expect(p.currentHighMinor).toBe(150);
    expect(p.leadChanges).toBe(2); // A→B, B→A
    expect(p.challengerId).toBe(B); // B's best (125) is the nearest challenge
  });

  it('flags a comeback when a bidder regains the lead after losing it', () => {
    const p = buildRivalryProjection('auc-1', ledger([A, 100], [B, 125], [A, 150]), NOW);
    const retake = p.changes.find((c) => c.newLeaderId === A && c.displacedLeaderId === B);
    expect(retake?.isComeback).toBe(true);
    // B taking the lead the first time is not a comeback.
    expect(p.changes.find((c) => c.newLeaderId === B)?.isComeback).toBe(false);
  });

  it('is a pure function of the ledger — bid input order does not matter', () => {
    const forward = buildRivalryProjection('auc-1', ledger([A, 100], [B, 125], [A, 150]), NOW);
    const shuffled = buildRivalryProjection(
      'auc-1',
      [
        { sequence: 3, bidderId: A, amountMinor: 150 },
        { sequence: 1, bidderId: A, amountMinor: 100 },
        { sequence: 2, bidderId: B, amountMinor: 125 },
      ],
      NOW,
    );
    expect(shuffled).toEqual(forward);
  });

  it('does not mutate its input', () => {
    const bids = ledger([A, 100], [B, 125]);
    const snapshot = JSON.stringify(bids);
    buildRivalryProjection('auc-1', bids, NOW);
    expect(JSON.stringify(bids)).toBe(snapshot);
  });
});

describe('toRivalryView — safe, viewer-aware projection', () => {
  const projection = () =>
    buildRivalryProjection('auc-1', ledger([A, 100], [B, 125], [A, 150], [C, 175]), NOW);

  it('never exposes a bidderId (only aliases or "You")', () => {
    const view = toRivalryView(projection(), { viewerBidderId: A, incrementMinor: 25 });
    const json = JSON.stringify(view);
    for (const id of [A, B, C]) expect(json).not.toContain(id);
  });

  it('renders the viewer as "You" and computes leadership correctly', () => {
    const view = toRivalryView(projection(), { viewerBidderId: A });
    // C is the current leader (last, highest bid); A is the viewer.
    expect(view.leader).not.toBe('You');
    expect(view.youAreLeading).toBe(false);
    const viewAsLeader = toRivalryView(
      buildRivalryProjection('auc-1', ledger([B, 100], [A, 150]), NOW),
      { viewerBidderId: A },
    );
    expect(viewAsLeader.youAreLeading).toBe(true);
    expect(viewAsLeader.leader).toBe('You');
  });

  it('computes the next valid bid and gap from the increment', () => {
    const view = toRivalryView(projection(), { viewerBidderId: A, incrementMinor: 25 });
    expect(view.currentHighMinor).toBe(175);
    expect(view.nextValidBidMinor).toBe(200);
    expect(view.gapToNextMinor).toBe(25);
  });

  it('surfaces a "you were outbid" moment when the viewer loses the lead', () => {
    // A leads at 100, B outbids at 125.
    const view = toRivalryView(buildRivalryProjection('auc-1', ledger([A, 100], [B, 125]), NOW), {
      viewerBidderId: A,
    });
    const outbid = view.moments.find((m) => m.kind === 'you_outbid');
    expect(outbid).toBeDefined();
    expect(outbid?.who).not.toBe('You'); // names the rival alias, not the viewer
  });

  it('caps the moment window to the most recent N', () => {
    const many = ledger([A, 10], [B, 20], [A, 30], [B, 40], [A, 50], [B, 60], [A, 70]);
    const view = toRivalryView(buildRivalryProjection('auc-1', many, NOW), { maxMoments: 3 });
    expect(view.moments.length).toBeLessThanOrEqual(3);
    // Returned oldest→newest and strictly within the tail.
    const seqs = view.moments.map((m) => m.sequence);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it('a spectator (no viewer) sees aliases only and is never leading', () => {
    const view = toRivalryView(projection(), { incrementMinor: 25 });
    expect(view.youAreLeading).toBe(false);
    expect(view.leader).toMatch(/^[A-Z]/);
    expect(view.moments.every((m) => m.kind !== 'you_outbid')).toBe(true);
  });
});
