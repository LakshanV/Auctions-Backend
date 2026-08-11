import { Inject, Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';
import { type Observable, Subject } from 'rxjs';
import { REALTIME_TRANSPORT, type RealtimeTransport } from './auction-realtime.transport';

/** A privacy-safe auction state frame as distributed to realtime subscribers. */
export type AuctionStateFrame = Record<string, unknown> & { id: string; version?: number };

/**
 * Shared realtime fan-out for auction state (pack 01 doc 07 — Realtime Event
 * Architecture). One in-process pub/sub channel per auction: every viewer of an
 * auction subscribes to the SAME `Subject`, so a single post-commit state change
 * fans out to all of them — replacing the previous per-viewer 2s DB poll and its
 * N×DB amplification.
 *
 * Design rules honoured here:
 * - Realtime NEVER decides auction state; it only distributes the authoritative,
 *   already-committed projection produced by the engine.
 * - Publish happens AFTER a successful commit (the engine calls `publish` once
 *   `UnitOfWork.execute` has returned).
 * - Frames carry the auction `version` as a monotonic sequence so clients can
 *   order/dedupe; a reconnecting client still fetches a fresh snapshot first.
 *
 * Transport is deliberately hidden behind this thin service. A multi-instance
 * deployment can swap the in-process `Subject` for Redis pub/sub or Postgres
 * LISTEN/NOTIFY without touching the auction engine or the SSE endpoint. In-
 * process fan-out is correct for the current single-instance API; cross-instance
 * fan-out + a 1k-viewer load gate are the documented next step.
 */
@Injectable()
export class AuctionRealtimeGateway implements OnModuleDestroy {
  private readonly channels = new Map<string, Subject<AuctionStateFrame>>();

  /**
   * Optional cross-instance transport (Redis pub/sub etc.). When present, ALL
   * frames — local and remote — arrive via the transport's single delivery path,
   * so multi-instance deployments fan out correctly with no double delivery.
   * When absent, the gateway is a fast in-process bus (correct for one instance).
   */
  constructor(
    @Optional() @Inject(REALTIME_TRANSPORT) private readonly transport?: RealtimeTransport,
  ) {
    this.transport?.subscribe((auctionId, frame) => this.deliver(auctionId, frame));
  }

  private channel(auctionId: string): Subject<AuctionStateFrame> {
    let subject = this.channels.get(auctionId);
    if (!subject) {
      subject = new Subject<AuctionStateFrame>();
      this.channels.set(auctionId, subject);
    }
    return subject;
  }

  /** Deliver a frame to this instance's local subscribers. */
  private deliver(auctionId: string, frame: AuctionStateFrame): void {
    this.channels.get(auctionId)?.next(frame);
  }

  /**
   * Publish an authoritative, post-commit state frame. With a transport, it is
   * broadcast to every instance (which each deliver it once); without one, it is
   * delivered directly to local subscribers.
   */
  publish(auctionId: string, frame: AuctionStateFrame): void {
    if (this.transport) this.transport.publish(auctionId, frame);
    else this.deliver(auctionId, frame);
  }

  /** Live stream of post-commit frames for one auction (no per-viewer DB read). */
  subscribe(auctionId: string): Observable<AuctionStateFrame> {
    return this.channel(auctionId).asObservable();
  }

  async onModuleDestroy(): Promise<void> {
    await this.transport?.close();
  }
}
