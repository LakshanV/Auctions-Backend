import { Logger } from '@nestjs/common';

/** Result of sending an outbound message through a channel provider. */
export interface SendResult {
  providerMessageId: string;
  accepted: boolean;
}

/**
 * Channel provider adapter (docs/08 principle: external providers behind
 * adapters). Real WhatsApp/Meta/SMS/email adapters implement this when their
 * credentials arrive; provider windows/templates are adapter config.
 */
export interface MessageChannelProvider {
  readonly name: string;
  send(channel: string, to: string, text: string): Promise<SendResult>;
}

export const CHANNEL_PROVIDER = Symbol('CHANNEL_PROVIDER');

/**
 * Mock adapter used until real provider credentials are supplied. It records the
 * outbound send (so the flow is fully exercised) and returns a synthetic id.
 * Swapping in a real provider requires no change to ConnectService.
 */
export class MockChannelProvider implements MessageChannelProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockChannelProvider');

  async send(channel: string, to: string, text: string): Promise<SendResult> {
    const providerMessageId = `mock-${channel}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.logger.debug(`[${channel}] -> ${to}: ${text.slice(0, 80)} (${providerMessageId})`);
    return { providerMessageId, accepted: true };
  }
}
