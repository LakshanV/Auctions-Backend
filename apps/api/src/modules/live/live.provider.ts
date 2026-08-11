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

export class MockLiveStreamProvider implements LiveStreamProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockLiveStreamProvider');

  async createChannel(title: string): Promise<LiveChannel> {
    const key = `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
