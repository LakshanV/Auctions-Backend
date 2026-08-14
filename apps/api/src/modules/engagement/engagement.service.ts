import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type NotificationChannel,
  type NotificationDeliveryView,
  type NotificationPreferencesView,
  type UpdateNotificationPreferencesInput,
  newId,
} from '@singha/contracts';
import {
  NOTIFICATION_CHANNELS,
  type NotificationClass,
  type NotificationPreferences,
  decideNotification,
  defaultPreferences,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from './notification.provider';

const MAX_ATTEMPTS = 3;
const RECENT_WINDOW_MS = 24 * 3_600_000;

type PrefRow = {
  customerId: string;
  channels: unknown;
  engagementOptIn: boolean;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  timezoneOffsetMinutes: number;
  frequencyCapPerDay: number;
  mutedCategories: string[];
};

/** A dispatch request (would originate from an outbox auction/commerce event). */
export interface DispatchInput {
  eventType: string;
  classification: NotificationClass;
  subjectId: string;
  category?: string | null;
  title: string;
  body: string;
}

/**
 * Engagement engine (pack doc 05). Owns notification PREFERENCES + the append-only
 * delivery ledger, and dispatches an event through the Tier-A policy engine
 * (consent / quiet hours / frequency cap / dedup) to the provider adapters with
 * retry → dead-letter. Provider transport is behind an adapter (fakes until creds).
 */
@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  private requireCustomer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  private channelsFromJson(json: unknown): Record<NotificationChannel, boolean> {
    const base = defaultPreferences().channels;
    const obj = (json ?? {}) as Partial<Record<NotificationChannel, boolean>>;
    return NOTIFICATION_CHANNELS.reduce(
      (acc, c) => ({ ...acc, [c]: typeof obj[c] === 'boolean' ? (obj[c] as boolean) : base[c] }),
      {} as Record<NotificationChannel, boolean>,
    );
  }

  private toDomainPrefs(row: PrefRow | null): NotificationPreferences {
    if (!row) return defaultPreferences();
    return {
      channels: this.channelsFromJson(row.channels),
      engagementOptIn: row.engagementOptIn,
      quietHours:
        row.quietStartMinute != null && row.quietEndMinute != null
          ? { startMinute: row.quietStartMinute, endMinute: row.quietEndMinute }
          : null,
      timezoneOffsetMinutes: row.timezoneOffsetMinutes,
      frequencyCapPerDay: row.frequencyCapPerDay,
      mutedCategories: row.mutedCategories,
    };
  }

  private toView(row: PrefRow | null): NotificationPreferencesView {
    const p = this.toDomainPrefs(row);
    return {
      channels: p.channels,
      engagementOptIn: p.engagementOptIn,
      quietHours: p.quietHours
        ? { start: fmt(p.quietHours.startMinute), end: fmt(p.quietHours.endMinute) }
        : null,
      timezoneOffsetMinutes: p.timezoneOffsetMinutes,
      frequencyCapPerDay: p.frequencyCapPerDay,
      mutedCategories: p.mutedCategories,
    };
  }

  async getPreferences(principal: Principal): Promise<NotificationPreferencesView> {
    const customerId = this.requireCustomer(principal);
    const row = (await this.prisma.notificationPreference.findUnique({
      where: { customerId },
    })) as PrefRow | null;
    return this.toView(row);
  }

  async updatePreferences(
    principal: Principal,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferencesView> {
    const customerId = this.requireCustomer(principal);
    const existing = (await this.prisma.notificationPreference.findUnique({
      where: { customerId },
    })) as PrefRow | null;
    const current = this.toView(existing);

    const channels = { ...current.channels, ...(input.channels ?? {}) };
    const quiet =
      input.quietHours === undefined
        ? existing
          ? { start: existing.quietStartMinute, end: existing.quietEndMinute }
          : { start: null, end: null }
        : input.quietHours === null
          ? { start: null, end: null }
          : { start: parse(input.quietHours.start), end: parse(input.quietHours.end) };

    const data = {
      channels,
      engagementOptIn: input.engagementOptIn ?? current.engagementOptIn,
      quietStartMinute: quiet.start,
      quietEndMinute: quiet.end,
      timezoneOffsetMinutes: input.timezoneOffsetMinutes ?? current.timezoneOffsetMinutes,
      frequencyCapPerDay: input.frequencyCapPerDay ?? current.frequencyCapPerDay,
      mutedCategories: input.mutedCategories ?? current.mutedCategories,
    };

    const row = (await this.prisma.notificationPreference.upsert({
      where: { customerId },
      create: { customerId, ...data },
      update: data,
    })) as PrefRow;
    return this.toView(row);
  }

  async listDeliveries(principal: Principal, limit = 30): Promise<NotificationDeliveryView[]> {
    const customerId = this.requireCustomer(principal);
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      classification: r.classification as 'transactional' | 'engagement',
      channel: (r.channel as NotificationChannel | null) ?? null,
      status: r.status as NotificationDeliveryView['status'],
      suppressedReason: r.suppressedReason,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Resolve the recipient address for a channel, or null when the customer has none. */
  private async contactFor(
    customerId: string,
    channel: NotificationChannel,
  ): Promise<string | null> {
    if (channel === 'in_app' || channel === 'push') return customerId; // stored / device-token stand-in
    const c = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (channel === 'email') return c?.email ?? null;
    return c?.phone ?? null; // sms / whatsapp
  }

  /**
   * Dispatch one event to a customer: apply the policy, then deliver on each chosen
   * channel with retry → dead-letter, appending to the delivery ledger throughout.
   * Returns the decision summary. Idempotent per (event,subject) via the policy dedup.
   */
  async dispatch(customerId: string, input: DispatchInput, now: Date = new Date()) {
    const prefRow = (await this.prisma.notificationPreference.findUnique({
      where: { customerId },
    })) as PrefRow | null;
    const prefs = this.toDomainPrefs(prefRow);

    // Only SENT deliveries feed dedup + frequency caps — a message that was suppressed
    // (or dead-lettered) was never delivered, so it must not block a later real send.
    const recentRows = await this.prisma.notificationDelivery.findMany({
      where: {
        customerId,
        status: 'sent',
        createdAt: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) },
      },
      select: { dedupeKey: true, classification: true, createdAt: true },
    });
    const recent = recentRows.map((r) => ({
      dedupeKey: r.dedupeKey,
      classification: r.classification as NotificationClass,
      createdAtEpochMs: r.createdAt.getTime(),
    }));

    const decision = decideNotification(
      {
        eventType: input.eventType,
        classification: input.classification,
        category: input.category,
        subjectId: input.subjectId,
      },
      prefs,
      recent,
      now,
    );

    if (!decision.send) {
      await this.record({
        customerId,
        input,
        channel: null,
        status: 'suppressed',
        suppressedReason: decision.suppressedReason,
        dedupeKey: decision.dedupeKey,
      });
      return {
        sent: 0,
        suppressed: true,
        reason: decision.suppressedReason,
        channels: [] as string[],
      };
    }

    const delivered: string[] = [];
    for (const channel of decision.channels) {
      const to = await this.contactFor(customerId, channel);
      if (!to) {
        await this.record({
          customerId,
          input,
          channel,
          status: 'dead',
          dedupeKey: decision.dedupeKey,
          attempts: 0,
          lastError: 'no_contact',
        });
        continue;
      }
      let attempts = 0;
      let ok = false;
      let providerMessageId: string | null = null;
      let lastError: string | undefined;
      while (attempts < MAX_ATTEMPTS && !ok) {
        attempts += 1;
        const res = await this.provider.deliver({
          channel,
          to,
          title: input.title,
          body: input.body,
        });
        ok = res.delivered;
        providerMessageId = res.providerMessageId;
        lastError = res.error;
      }
      await this.record({
        customerId,
        input,
        channel,
        status: ok ? 'sent' : 'dead', // exhausted retries → dead-letter
        dedupeKey: decision.dedupeKey,
        attempts,
        providerMessageId: ok ? providerMessageId : null,
        lastError: ok ? undefined : lastError,
      });
      if (ok) delivered.push(channel);
    }
    return { sent: delivered.length, suppressed: false, reason: null, channels: delivered };
  }

  private async record(r: {
    customerId: string;
    input: DispatchInput;
    channel: NotificationChannel | null;
    status: string;
    dedupeKey: string;
    suppressedReason?: string | null;
    attempts?: number;
    providerMessageId?: string | null;
    lastError?: string;
  }) {
    await this.prisma.notificationDelivery.create({
      data: {
        id: newId(),
        customerId: r.customerId,
        eventType: r.input.eventType,
        classification: r.input.classification,
        channel: r.channel,
        status: r.status,
        suppressedReason: r.suppressedReason ?? null,
        dedupeKey: r.dedupeKey,
        title: r.input.title,
        body: r.input.body,
        providerMessageId: r.providerMessageId ?? null,
        attempts: r.attempts ?? 0,
        lastError: r.lastError ?? null,
      },
    });
  }

  /** Self-service simulate for acceptance/testing: dispatch an event to the caller. */
  async simulateToSelf(principal: Principal, input: DispatchInput) {
    const customerId = this.requireCustomer(principal);
    const exists = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!exists) throw new NotFoundException('Customer not found');
    return this.dispatch(customerId, input);
  }
}

const fmt = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const parse = (hhmm: string): number => {
  const parts = hhmm.split(':');
  return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
};
