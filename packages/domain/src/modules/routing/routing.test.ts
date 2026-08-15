import { describe, expect, it } from 'vitest';
import { type RoutingRuleView, resolveRouting } from './routing';

const rule = (over: Partial<RoutingRuleView>): RoutingRuleView => ({
  code: 'R',
  version: 1,
  priority: 0,
  saleMethodCode: null,
  category: null,
  marketCode: null,
  jurisdiction: null,
  operatorCode: null,
  originNodeCode: null,
  destinationCountry: null,
  transactionOperatorCode: 'OP_DEFAULT',
  paymentRouteCode: 'PAY_DEFAULT',
  termsCode: 'TERMS_DEFAULT',
  disclosure: null,
  requiresKyc: false,
  requiresLicence: false,
  verification: 'verified',
  ...over,
});

describe('transaction routing engine (deterministic, explainable — pack 07)', () => {
  it('MANUAL_REVIEW when no rule matches', () => {
    const out = resolveRouting({ saleMethodCode: 'TIMED_AUCTION' }, []);
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(out.matchedRuleCode).toBeNull();
    expect(out.reason).toMatch(/no routing rule matched/);
  });

  it('resolves a verified matching rule and returns its operator/route/terms', () => {
    const out = resolveRouting({ saleMethodCode: 'MAKE_OFFER', marketCode: 'LK' }, [
      rule({ code: 'LK_OFFERS', saleMethodCode: 'MAKE_OFFER', marketCode: 'LK' }),
    ]);
    expect(out.status).toBe('RESOLVED');
    expect(out.transactionOperatorCode).toBe('OP_DEFAULT');
    expect(out.paymentRouteCode).toBe('PAY_DEFAULT');
    expect(out.termsCode).toBe('TERMS_DEFAULT');
    expect(out.matchedRuleCode).toBe('LK_OFFERS');
  });

  it('picks the MOST SPECIFIC matching rule (a wildcard loses to a constrained rule)', () => {
    const wildcard = rule({ code: 'ANY', transactionOperatorCode: 'OP_ANY' });
    const specific = rule({
      code: 'LK_AU',
      saleMethodCode: 'MAKE_OFFER',
      marketCode: 'LK',
      destinationCountry: 'AU',
      transactionOperatorCode: 'OP_LK_AU',
    });
    const out = resolveRouting(
      { saleMethodCode: 'MAKE_OFFER', marketCode: 'LK', destinationCountry: 'AU' },
      [wildcard, specific],
    );
    expect(out.matchedRuleCode).toBe('LK_AU');
    expect(out.transactionOperatorCode).toBe('OP_LK_AU');
  });

  it('is deterministic on ties — priority, then code, then version (order-independent)', () => {
    const a = rule({ code: 'B_RULE', saleMethodCode: 'BUY_NOW', priority: 5 });
    const b = rule({ code: 'A_RULE', saleMethodCode: 'BUY_NOW', priority: 5 });
    const input = { saleMethodCode: 'BUY_NOW' };
    // Same specificity + priority → lexicographically smallest code wins, regardless of input order.
    expect(resolveRouting(input, [a, b]).matchedRuleCode).toBe('A_RULE');
    expect(resolveRouting(input, [b, a]).matchedRuleCode).toBe('A_RULE');
    // Higher priority beats a lexicographically smaller code.
    const hi = rule({ code: 'Z_RULE', saleMethodCode: 'BUY_NOW', priority: 9 });
    expect(resolveRouting(input, [a, b, hi]).matchedRuleCode).toBe('Z_RULE');
  });

  it('a matched but UNVERIFIED rule is a non-binding preview (D7)', () => {
    const out = resolveRouting({ saleMethodCode: 'MAKE_OFFER' }, [
      rule({ code: 'DRAFT_RULE', saleMethodCode: 'MAKE_OFFER', verification: 'draft' }),
    ]);
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    // The would-be resolution is still surfaced as a preview.
    expect(out.transactionOperatorCode).toBe('OP_DEFAULT');
    expect(out.matchedRuleCode).toBe('DRAFT_RULE');
    expect(out.reason).toMatch(/draft/);
  });

  it('holds for required verification the party has not satisfied (KYC / LICENCE)', () => {
    const r = rule({ code: 'REG', saleMethodCode: 'SEALED_TENDER', requiresKyc: true });
    const missing = resolveRouting({ saleMethodCode: 'SEALED_TENDER', kycVerified: false }, [r]);
    expect(missing.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(missing.requiredVerification).toContain('KYC');

    const satisfied = resolveRouting({ saleMethodCode: 'SEALED_TENDER', kycVerified: true }, [r]);
    expect(satisfied.status).toBe('RESOLVED');
    expect(satisfied.requiredVerification).toEqual([]);
  });

  it('carries the rule disclosure and an explainable trace', () => {
    const out = resolveRouting({ saleMethodCode: 'BUY_NOW', marketCode: 'AU' }, [
      rule({
        code: 'AU_BN',
        saleMethodCode: 'BUY_NOW',
        marketCode: 'AU',
        disclosure: 'AU consumer terms apply',
      }),
    ]);
    expect(out.disclosures).toEqual(['AU consumer terms apply']);
    expect(out.trace.some((t) => t.includes('matched rule AU_BN'))).toBe(true);
    expect(out.trace.some((t) => t.includes('marketCode=AU'))).toBe(true);
  });
});
