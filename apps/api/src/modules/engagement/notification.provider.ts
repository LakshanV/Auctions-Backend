import { Logger } from '@nestjs/common';

/** A single outbound notification on one channel. */
export interface NotificationDispatch {
  channel: string;
  to: string;
  title: string;
  body: string;
}

export interface DeliveryResult {
  providerMessageId: string | null;
  delivered: boolean;
  error?: string;
}

/**
 * Notification transport adapter (pack doc 05/08 — providers behind adapters). Real
 * WhatsApp/SMS/email/push adapters implement this when their credentials arrive; the
 * EngagementService neither knows nor cares which one is bound.
 */
export interface NotificationProvider {
  readonly name: string;
  deliver(msg: NotificationDispatch): Promise<DeliveryResult>;
}

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

/**
 * Credential-free fake used until real providers are configured. It "delivers"
 * everything except recipients whose address contains `fail` — a deterministic hook
 * that lets the acceptance suite exercise the retry → dead-letter path without any
 * real provider. `in_app` always succeeds (it is a stored record, not an egress).
 */
export class FakeNotificationProvider implements NotificationProvider {
  readonly name = 'fake';
  private readonly logger = new Logger('FakeNotificationProvider');

  async deliver(msg: NotificationDispatch): Promise<DeliveryResult> {
    if (msg.channel !== 'in_app' && msg.to.toLowerCase().includes('fail')) {
      return { providerMessageId: null, delivered: false, error: 'simulated provider failure' };
    }
    const providerMessageId = `fake-${msg.channel}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.logger.debug(`[${msg.channel}] -> ${msg.to}: ${msg.title}`);
    return { providerMessageId, delivered: true };
  }
}
