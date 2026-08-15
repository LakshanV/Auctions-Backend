import { describe, expect, it } from 'vitest';
import {
  activityRequiresCapability,
  assertCapabilityDecidable,
  effectiveCapabilityStatus,
  evaluateCapability,
  type CapabilityGrant,
} from './capability';

const NOW = new Date('2026-06-15T00:00:00.000Z');
const grant = (over: Partial<CapabilityGrant> = {}): CapabilityGrant => ({
  capability: 'place_bid',
  status: 'verified',
  expiresAt: null,
  ...over,
});

describe('activityRequiresCapability', () => {
  it('treats browse-class activities as open and maps gated activities to their capability', () => {
    expect(activityRequiresCapability('browse')).toBeNull();
    expect(activityRequiresCapability('search')).toBeNull();
    expect(activityRequiresCapability('place_bid')).toBe('place_bid');
    expect(activityRequiresCapability('export')).toBe('export');
    expect(activityRequiresCapability('something_unknown')).toBeNull();
  });
});

describe('effectiveCapabilityStatus', () => {
  it('reads a verified-but-expired grant as expired and no grant as none', () => {
    expect(effectiveCapabilityStatus(null, NOW)).toBe('none');
    expect(effectiveCapabilityStatus(grant(), NOW)).toBe('verified');
    expect(
      effectiveCapabilityStatus(grant({ expiresAt: new Date('2026-06-01T00:00:00Z') }), NOW),
    ).toBe('expired');
    expect(effectiveCapabilityStatus(grant({ status: 'pending' }), NOW)).toBe('pending');
  });
});

describe('evaluateCapability (capability-based verification)', () => {
  it('permits open activities without any grant', () => {
    const d = evaluateCapability('browse', null, NOW);
    expect(d.permitted).toBe(true);
    expect(d.reason).toBe('OPEN');
  });

  it('requires verification for a gated activity with no grant', () => {
    const d = evaluateCapability('place_bid', null, NOW);
    expect(d.permitted).toBe(false);
    expect(d.reason).toBe('VERIFICATION_REQUIRED');
    expect(d.requiredCapability).toBe('place_bid');
  });

  it('permits a gated activity only with a verified, unexpired grant', () => {
    expect(evaluateCapability('place_bid', grant(), NOW).permitted).toBe(true);
    expect(evaluateCapability('place_bid', grant({ status: 'pending' }), NOW).reason).toBe(
      'VERIFICATION_PENDING',
    );
    expect(evaluateCapability('place_bid', grant({ status: 'rejected' }), NOW).reason).toBe(
      'VERIFICATION_REJECTED',
    );
    expect(
      evaluateCapability('place_bid', grant({ expiresAt: new Date('2026-06-01T00:00:00Z') }), NOW)
        .permitted,
    ).toBe(false);
    expect(
      evaluateCapability('place_bid', grant({ expiresAt: new Date('2026-06-01T00:00:00Z') }), NOW)
        .reason,
    ).toBe('VERIFICATION_EXPIRED');
  });
});

describe('assertCapabilityDecidable', () => {
  it('only a pending capability can be decided', () => {
    expect(() => assertCapabilityDecidable('pending')).not.toThrow();
    expect(() => assertCapabilityDecidable('verified')).toThrow();
    expect(() => assertCapabilityDecidable('rejected')).toThrow();
  });
});
