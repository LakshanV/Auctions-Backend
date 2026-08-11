import { Injectable } from '@nestjs/common';
import { type Observable, Subject } from 'rxjs';

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
export class AuctionRealtimeGateway {
  private readonly channels = new Map<string, Subject<AuctionStateFrame>>();

  private channel(auctionId: string): Subject<AuctionStateFrame> {
    let subject = this.channels.get(auctionId);
    if (!subject) {
      subject = new Subject<AuctionStateFrame>();
      this.channels.set(auctionId, subject);
    }
    return subject;
  }

  /** Publish an authoritative, post-commit state frame to all subscribers. */
  publish(auctionId: string, frame: AuctionStateFrame): void {
    // Only push if someone is listening; avoids materialising idle channels.
    this.channels.get(auctionId)?.next(frame);
  }

  /** Live stream of post-commit frames for one auction (no per-viewer DB read). */
  subscribe(auctionId: string): Observable<AuctionStateFrame> {
    return this.channel(auctionId).asObservable();
  }
}
