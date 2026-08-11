import { Logger } from '@nestjs/common';

export interface PublishResult {
  externalPostId: string;
  published: boolean;
}

/**
 * Social publishing adapter (docs/11 — real Meta adapters after access). Until
 * then a mock stands in so campaigns/drafts/publishing are fully exercised
 * without external calls. Swapping in the Meta Graph adapter changes nothing else.
 */
export interface SocialPublisherProvider {
  readonly name: string;
  publish(platform: string, caption: string, creativeRef?: string): Promise<PublishResult>;
}

export const SOCIAL_PROVIDER = Symbol('SOCIAL_PROVIDER');

export class MockSocialPublisher implements SocialPublisherProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockSocialPublisher');

  async publish(platform: string, caption: string, _creativeRef?: string): Promise<PublishResult> {
    const externalPostId = `mock-${platform}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.logger.debug(`[${platform}] publish: ${caption.slice(0, 60)} -> ${externalPostId}`);
    return { externalPostId, published: true };
  }
}
