import { type AuctionStateFrame } from './auction-realtime.gateway';

export const REALTIME_TRANSPORT = Symbol('REALTIME_TRANSPORT');

/**
 * Cross-instance transport for auction realtime frames (pack 01 doc 07). The
 * in-process gateway fans out to subscribers on the SAME API instance; a
 * transport carries frames BETWEEN instances so a bid on instance A reaches
 * viewers connected to instance B. Deliberately thin so Redis pub/sub, Postgres
 * LISTEN/NOTIFY or a managed bus are interchangeable behind it.
 */
export interface RealtimeTransport {
  /** Broadcast a post-commit frame to every instance (including this one). */
  publish(auctionId: string, frame: AuctionStateFrame): void;
  /** Register the sink that delivers inbound frames to local subscribers. */
  subscribe(deliver: (auctionId: string, frame: AuctionStateFrame) => void): void;
  close(): Promise<void>;
}

const CHANNEL_PREFIX = 'auction:realtime:';

/**
 * Redis pub/sub transport. Uses two connections (ioredis requires a dedicated
 * subscriber connection): every `publish` PUBLISHes to `auction:realtime:<id>`,
 * and a single psubscribe delivers ALL instances' frames — including this
 * instance's own — through one path, so there is exactly one delivery per frame
 * (no local short-circuit, no double delivery). ioredis is loaded lazily so the
 * API has no hard runtime dependency when Redis is disabled.
 */
export class RedisRealtimeTransport implements RealtimeTransport {
  private pub!: { publish(channel: string, message: string): unknown; quit(): Promise<unknown> };
  private sub!: {
    psubscribe(pattern: string): unknown;
    on(event: string, handler: (...args: string[]) => void): unknown;
    quit(): Promise<unknown>;
  };
  private deliver?: (auctionId: string, frame: AuctionStateFrame) => void;

  static async create(url: string): Promise<RedisRealtimeTransport> {
    const IORedis = (await import('ioredis')).default;
    const t = new RedisRealtimeTransport();
    t.pub = new IORedis(url) as never;
    t.sub = new IORedis(url) as never;
    t.sub.psubscribe(`${CHANNEL_PREFIX}*`);
    t.sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      if (!t.deliver) return;
      try {
        t.deliver(channel.slice(CHANNEL_PREFIX.length), JSON.parse(message) as AuctionStateFrame);
      } catch {
        /* ignore malformed frames — the DB remains authoritative */
      }
    });
    return t;
  }

  publish(auctionId: string, frame: AuctionStateFrame): void {
    this.pub.publish(`${CHANNEL_PREFIX}${auctionId}`, JSON.stringify(frame));
  }

  subscribe(deliver: (auctionId: string, frame: AuctionStateFrame) => void): void {
    this.deliver = deliver;
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}
