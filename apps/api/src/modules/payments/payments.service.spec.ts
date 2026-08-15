import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';

type Features = Record<string, boolean>;

const routeRow = (over: Record<string, unknown>) => ({
  code: 'R',
  version: 1,
  priority: 0,
  provider: 'AcmePay',
  providerKind: 'operator_gateway',
  instructionsRef: null,
  operatorCode: 'OP_LK',
  currency: null,
  jurisdiction: null,
  saleMethodCode: null,
  purpose: null,
  verification: 'verified',
  active: true,
  ...over,
});

function makeService(
  features: Features,
  opts: { routes?: unknown[]; webhookSecret?: string; webhookThrows?: unknown } = {},
): PaymentsService {
  const prisma = {
    paymentRoute: { findMany: async () => opts.routes ?? [] },
    paymentIntent: { create: async () => ({}) },
    paymentWebhookEvent: {
      create: async () => {
        if (opts.webhookThrows) throw opts.webhookThrows;
        return {};
      },
    },
  } as unknown as PrismaService;
  const config = {
    get: () => ({ features, payments: { webhookSecret: opts.webhookSecret ?? '' } }),
  } as unknown as AppConfigService;
  return new PaymentsService(prisma, config);
}

const sign = (secret: string, provider: string, eventId: string, type: string) =>
  createHmac('sha256', secret).update(`${provider}:${eventId}:${type}`).digest('hex');

describe('PaymentsService (E8b flag gating + regulated routing + webhooks)', () => {
  it('404s when operatorPayments is OFF', async () => {
    const s = makeService({ operatorPayments: false });
    await expect(
      s.resolveRoute({ operatorCode: 'OP_LK', currency: 'LKR', purpose: 'buyer_settlement' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('resolves a verified operator route and persists an intent', async () => {
    const s = makeService({ operatorPayments: true }, { routes: [routeRow({ currency: 'LKR' })] });
    const out = await s.resolveRoute({
      operatorCode: 'OP_LK',
      currency: 'LKR',
      purpose: 'buyer_settlement',
    });
    expect(out.status).toBe('RESOLVED');
    expect(out.provider).toBe('AcmePay');
    expect(out.intentId).toBeTruthy();
  });

  it('rejects a webhook with a bad or missing signature', async () => {
    const s = makeService({ operatorPayments: true }, { webhookSecret: 'shh' });
    await expect(
      s.handleWebhook({
        provider: 'acme',
        eventId: 'e1',
        type: 'paid',
        signature: 'nope',
        payload: {},
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a correctly-signed webhook, and is idempotent on replay', async () => {
    const secret = 'shh';
    const signature = sign(secret, 'acme', 'e1', 'paid');
    const ok = await makeService(
      { operatorPayments: true },
      { webhookSecret: secret },
    ).handleWebhook({
      provider: 'acme',
      eventId: 'e1',
      type: 'paid',
      signature,
      payload: {},
    });
    expect(ok).toEqual({ received: true, duplicate: false });

    const replay = await makeService(
      { operatorPayments: true },
      { webhookSecret: secret, webhookThrows: { code: 'P2002' } },
    ).handleWebhook({ provider: 'acme', eventId: 'e1', type: 'paid', signature, payload: {} });
    expect(replay).toEqual({ received: true, duplicate: true });
  });
});
