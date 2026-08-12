import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REQUIRED_SECURITY_BPS,
  calculatedBaseLimitMinor,
  computeCreditAvailability,
  eligibleSecurityValueMinor,
  fitsWithinCapacity,
  theoreticalCreditLimitMinor,
  totalEligibleSecurityMinor,
} from './credit';
import { BUYER_RULESET_V1, SELLER_RULESET_V1, computePerformanceSnapshot } from './performance';

// LKR minor units (cents). 500,000.00 = 50_000_000 minor.
const LKR = (major: number) => BigInt(major) * 100n;

describe('credit / bid-capacity engine', () => {
  it('configurable 5% rule: LKR 500,000 security → LKR 10,000,000 limit at 5%', () => {
    const limit = theoreticalCreditLimitMinor(LKR(500_000), DEFAULT_REQUIRED_SECURITY_BPS);
    expect(limit).toBe(LKR(10_000_000));
  });

  it('configurable rule: same security → LKR 5,000,000 at 10%', () => {
    const limit = theoreticalCreditLimitMinor(LKR(500_000), 1000);
    expect(limit).toBe(LKR(5_000_000));
  });

  it('pending/unverified/expired security is 0 eligible; verified contributes with factor', () => {
    expect(
      eligibleSecurityValueMinor({
        faceAmountMinor: LKR(500_000),
        eligibilityBps: 10000,
        countsTowardCredit: false,
      }),
    ).toBe(0n);
    // 80% haircut on a verified guarantee.
    expect(
      eligibleSecurityValueMinor({
        faceAmountMinor: LKR(1_000_000),
        eligibilityBps: 8000,
        countsTowardCredit: true,
      }),
    ).toBe(LKR(800_000));
  });

  it('sums eligible security across instruments', () => {
    const total = totalEligibleSecurityMinor([
      { faceAmountMinor: LKR(500_000), eligibilityBps: 10000, countsTowardCredit: true },
      { faceAmountMinor: LKR(1_000_000), eligibilityBps: 8000, countsTowardCredit: true },
      { faceAmountMinor: LKR(999_999), eligibilityBps: 10000, countsTowardCredit: false },
    ]);
    expect(total).toBe(LKR(1_300_000));
  });

  it('manual cap is respected over the calculated theoretical limit', () => {
    const base = calculatedBaseLimitMinor({
      eligibleSecurityMinor: LKR(500_000),
      requiredSecurityBps: DEFAULT_REQUIRED_SECURITY_BPS,
      caps: { customerCapMinor: LKR(7_500_000) },
    });
    expect(base).toBe(LKR(7_500_000));
  });

  it('available = approved + uplift − committed, floored at 0', () => {
    const a = computeCreditAvailability({
      approvedLimitMinor: LKR(10_000_000),
      temporaryUpliftMinor: LKR(500_000),
      committedExposureMinor: LKR(3_000_000),
    });
    expect(a.effectiveApprovedLimitMinor).toBe(LKR(10_500_000));
    expect(a.availableMinor).toBe(LKR(7_500_000));

    const over = computeCreditAvailability({
      approvedLimitMinor: LKR(1_000_000),
      committedExposureMinor: LKR(3_000_000),
    });
    expect(over.availableMinor).toBe(0n);
  });

  it('capacity gate: one of two equal bids that each need the whole line does not fit twice', () => {
    const approved = LKR(1_000_000);
    // First bid reserves the whole line.
    expect(
      fitsWithinCapacity({
        approvedLimitMinor: approved,
        committedExposureMinor: 0n,
        requestedMinor: LKR(1_000_000),
      }),
    ).toBe(true);
    // Second concurrent bid, after the first committed, must NOT fit.
    expect(
      fitsWithinCapacity({
        approvedLimitMinor: approved,
        committedExposureMinor: LKR(1_000_000),
        requestedMinor: LKR(1_000_000),
      }),
    ).toBe(false);
  });
});

describe('performance rule engine', () => {
  it('is deterministic / rebuildable: same events + version → same score, order-independent', () => {
    const events = [
      { eventType: 'PAYMENT_ON_TIME', dimension: 'paymentReliability', value: 1 },
      { eventType: 'PAYMENT_ON_TIME', dimension: 'paymentReliability', value: 1 },
      { eventType: 'COLLECTED_ON_TIME', dimension: 'collection', value: 1 },
      { eventType: 'PURCHASE_COMPLETED', dimension: 'settlementCompletion', value: 1 },
    ];
    const a = computePerformanceSnapshot(BUYER_RULESET_V1, events);
    const b = computePerformanceSnapshot(BUYER_RULESET_V1, [...events].reverse());
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
    expect(a.score).not.toBeNull();
  });

  it('reports INSUFFICIENT_HISTORY (score null) below the minimum event count', () => {
    const snap = computePerformanceSnapshot(BUYER_RULESET_V1, [
      { eventType: 'PAYMENT_ON_TIME', dimension: 'paymentReliability', value: 1 },
    ]);
    expect(snap.band).toBe('INSUFFICIENT_HISTORY');
    expect(snap.score).toBeNull();
  });

  it('separates buyer and seller contexts', () => {
    expect(BUYER_RULESET_V1.context).toBe('buyer');
    expect(SELLER_RULESET_V1.context).toBe('seller');
  });

  it('penalises defaults: an unpaid default lowers the score below a clean record', () => {
    const clean = computePerformanceSnapshot(BUYER_RULESET_V1, [
      { eventType: 'PAYMENT_ON_TIME', dimension: 'paymentReliability', value: 1 },
      { eventType: 'PAYMENT_ON_TIME', dimension: 'paymentReliability', value: 1 },
      { eventType: 'PURCHASE_COMPLETED', dimension: 'settlementCompletion', value: 1 },
    ]);
    const bad = computePerformanceSnapshot(BUYER_RULESET_V1, [
      { eventType: 'UNPAID_DEFAULT', dimension: 'paymentReliability', value: 1 },
      { eventType: 'BUYER_CANCELLED', dimension: 'settlementCompletion', value: 1 },
      { eventType: 'NO_SHOW', dimension: 'collection', value: 1 },
    ]);
    expect(bad.score!).toBeLessThan(clean.score!);
  });
});
