import { Logger } from '@nestjs/common';

export interface LiveChannel {
  ingestUrl: string;
  playbackUrl: string;
}

/**
 * Live streaming adapter (docs/08, docs/21 — Amazon IVS / YouTube behind an
 * adapter). A mock stands in until IVS/YouTube credentials arrive so the whole
 * broadcast lifecycle (channel → start → simulcast → stop → recording) runs
 * without external calls. Swapping in the real adapter changes nothing else.
 */
export interface LiveStreamProvider {
  readonly name: string;
  createChannel(title: string): Promise<LiveChannel>;
  startBroadcast(channelId: string): Promise<void>;
  startSimulcast(channelId: string): Promise<{ simulcastUrl: string }>;
  stopBroadcast(channelId: string): Promise<{ recordingUrl: string }>;
}

export const LIVE_PROVIDER = Symbol('LIVE_PROVIDER');

/** FNV-1a — a small deterministic hash so the fake channel key is reproducible (no clock/random,
 *  matching the codebase's other credential-free fakes; the real IVS/YouTube adapter issues its
 *  own keys). */
function stableKey(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class MockLiveStreamProvider implements LiveStreamProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockLiveStreamProvider');

  async createChannel(title: string): Promise<LiveChannel> {
    // Deterministic key derived from the title (RW6): no `Date.now()` / `Math.random()`, so the
    // whole broadcast fake is reproducible in tests and resumable workflows.
    const key = `mock-${stableKey(title)}`;
    this.logger.debug(`create channel for "${title}" (${key})`);
    return {
      ingestUrl: `rtmps://mock-ingest.singha.local/live/${key}`,
      playbackUrl: `https://mock-playback.singha.local/${key}.m3u8`,
    };
  }

  async startBroadcast(channelId: string): Promise<void> {
    this.logger.debug(`start broadcast ${channelId}`);
  }

  async startSimulcast(channelId: string): Promise<{ simulcastUrl: string }> {
    return { simulcastUrl: `https://youtube.local/watch?v=mock-${channelId.slice(-8)}` };
  }

  async stopBroadcast(channelId: string): Promise<{ recordingUrl: string }> {
    this.logger.debug(`stop broadcast ${channelId}`);
    return { recordingUrl: `https://mock-recordings.singha.local/${channelId.slice(-8)}.mp4` };
  }
}
