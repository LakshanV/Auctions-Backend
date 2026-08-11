import { describe, expect, it } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuctionRealtimeGateway, type AuctionStateFrame } from './auction-realtime.gateway';
import { type RealtimeTransport } from './auction-realtime.transport';

/**
 * In-memory transport shared by several gateways — simulates a Redis bus across
 * multiple API instances. A publish on any gateway is delivered (once) to the
 * local subscribers of every gateway on the bus.
 */
class FakeBus {
  private sinks: ((id: string, frame: AuctionStateFrame) => void)[] = [];
  transport(): RealtimeTransport {
    const bus = this;
    return {
      publish: (id, frame) => bus.sinks.forEach((s) => s(id, frame)),
      subscribe: (deliver) => bus.sinks.push(deliver),
      close: async () => {},
    };
  }
}

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

  it('fans out ACROSS instances via a shared transport (multi-instance)', async () => {
    // Two gateways = two API instances on the same bus.
    const bus = new FakeBus();
    const instanceA = new AuctionRealtimeGateway(bus.transport());
    const instanceB = new AuctionRealtimeGateway(bus.transport());

    const onA = firstValueFrom(instanceA.subscribe('auc-x'));
    const onB = firstValueFrom(instanceB.subscribe('auc-x'));

    // A bid committed on instance A must reach a viewer connected to instance B.
    instanceA.publish('auc-x', { id: 'auc-x', version: 7, currentBidMinor: 500 });

    expect(await onA).toMatchObject({ version: 7 });
    expect(await onB).toMatchObject({ version: 7 });
  });

  it('with a transport, each frame is delivered exactly once (no double delivery)', async () => {
    const bus = new FakeBus();
    const gw = new AuctionRealtimeGateway(bus.transport());
    const frames = firstValueFrom(gw.subscribe('auc-y').pipe(take(2), toArray()));
    gw.publish('auc-y', { id: 'auc-y', version: 1 });
    gw.publish('auc-y', { id: 'auc-y', version: 2 });
    expect((await frames).map((f) => f.version)).toEqual([1, 2]);
  });
});
