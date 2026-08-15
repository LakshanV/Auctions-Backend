import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';

type Features = Record<string, boolean>;

const RULE = {
  code: 'LK_OFFERS',
  version: 1,
  priority: 0,
  saleMethodCode: 'MAKE_OFFER',
  category: null,
  marketCode: 'LK',
  jurisdiction: null,
  operatorCode: null,
  originNodeCode: null,
  destinationCountry: null,
  transactionOperatorCode: 'OP_LK',
  paymentRouteCode: 'PAY_LK',
  termsCode: 'TERMS_LK',
  disclosure: null,
  requiresKyc: false,
  requiresLicence: false,
  verification: 'verified',
};

function makeService(features: Features, rules: unknown[] = [RULE]): RoutingService {
  const prisma = {
    routingRule: { findMany: async () => rules },
    routingDecision: { create: async () => ({}) },
    termsDocument: { findMany: async () => [] },
  } as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new RoutingService(prisma, config);
}

describe('RoutingService (E6 flag gating + resolution)', () => {
  it('404s when transactionRouting is OFF', async () => {
    const s = makeService({ transactionRouting: false });
    await expect(s.resolve({ saleMethodCode: 'MAKE_OFFER' })).rejects.toThrow(NotFoundException);
    await expect(s.terms({ saleMethodCode: 'MAKE_OFFER' })).rejects.toThrow(NotFoundException);
  });

  it('resolves a verified matching rule and persists a decision', async () => {
    const s = makeService({ transactionRouting: true });
    const out = await s.resolve({ saleMethodCode: 'MAKE_OFFER', marketCode: 'LK' });
    expect(out.status).toBe('RESOLVED');
    expect(out.transactionOperatorCode).toBe('OP_LK');
    expect(out.decisionId).toBeTruthy();
  });

  it('returns MANUAL_REVIEW_REQUIRED when no rule matches', async () => {
    const s = makeService({ transactionRouting: true }, []);
    const out = await s.resolve({ saleMethodCode: 'TIMED_AUCTION' });
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(out.matchedRuleCode).toBeNull();
  });
});
