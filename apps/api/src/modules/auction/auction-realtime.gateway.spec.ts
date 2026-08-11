import { describe, expect, it } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuctionRealtimeGateway } from './auction-realtime.gateway';

describe('AuctionRealtimeGateway (pack 01 doc 07 — shared fan-out)', () => {
  it('fans one publish out to every subscriber of the same auction', async () => {
    const gw = new AuctionRealtimeGateway();
    const a = firstValueFrom(gw.subscribe('auc-1'));
    const b = firstValueFrom(gw.subscribe('auc-1'));

    gw.publish('auc-1', { id: 'auc-1', version: 3, currentBidMinor: 1000 });

    expect(await a).toMatchObject({ id: 'auc-1', version: 3 });
    expect(await b).toMatchObject({ id: 'auc-1', version: 3 });
  });

  it('isolates channels — a publish never leaks to another auction', async () => {
    const gw = new AuctionRealtimeGateway();
    const other = firstValueFrom(gw.subscribe('auc-2').pipe(take(1)));
    let leaked = false;
    void other.then(() => (leaked = true));

    gw.publish('auc-1', { id: 'auc-1', version: 1 });
    await new Promise((r) => setTimeout(r, 10));
    expect(leaked).toBe(false);
  });

  it('delivers frames in publish order with their version sequence', async () => {
    const gw = new AuctionRealtimeGateway();
    const frames = firstValueFrom(gw.subscribe('auc-3').pipe(take(2), toArray()));
    gw.publish('auc-3', { id: 'auc-3', version: 1 });
    gw.publish('auc-3', { id: 'auc-3', version: 2 });
    expect((await frames).map((f) => f.version)).toEqual([1, 2]);
  });

  it('publishing to an auction with no subscribers is a no-op (no error)', () => {
    const gw = new AuctionRealtimeGateway();
    expect(() => gw.publish('nobody', { id: 'nobody' })).not.toThrow();
  });
});
