import { describe, expect, it } from 'vitest';
import { type TermsDocumentView, resolveTerms } from './terms';

const doc = (over: Partial<TermsDocumentView>): TermsDocumentView => ({
  code: 'T',
  version: 1,
  layer: 'TRANSACTION',
  operatorCode: null,
  jurisdiction: null,
  category: null,
  saleMethodCode: null,
  bodyRef: 'ref://terms',
  verification: 'verified',
  active: true,
  ...over,
});

describe('two-layer terms resolution (pack 07)', () => {
  it('MANUAL_REVIEW when a layer is missing', () => {
    const platformOnly = resolveTerms({ saleMethodCode: 'MAKE_OFFER' }, [
      doc({ code: 'PLAT', layer: 'PLATFORM' }),
    ]);
    expect(platformOnly.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(platformOnly.platform?.code).toBe('PLAT');
    expect(platformOnly.transaction).toBeNull();
    expect(platformOnly.reason).toMatch(/transaction/);
  });

  it('resolves platform (highest version) + the most-specific transaction terms', () => {
    const out = resolveTerms({ saleMethodCode: 'MAKE_OFFER', operatorCode: 'OP_LK' }, [
      doc({ code: 'PLAT', layer: 'PLATFORM', version: 1 }),
      doc({ code: 'PLAT', layer: 'PLATFORM', version: 3 }), // newer platform wins
      doc({ code: 'TX_ANY', layer: 'TRANSACTION' }), // wildcard
      doc({ code: 'TX_LK', layer: 'TRANSACTION', operatorCode: 'OP_LK' }), // more specific
    ]);
    expect(out.status).toBe('RESOLVED');
    expect(out.platform?.version).toBe(3);
    expect(out.transaction?.code).toBe('TX_LK');
  });

  it('is MANUAL_REVIEW when terms exist but are not owner-verified (D7)', () => {
    const out = resolveTerms({ saleMethodCode: 'BUY_NOW' }, [
      doc({ code: 'PLAT', layer: 'PLATFORM', verification: 'verified' }),
      doc({ code: 'TX', layer: 'TRANSACTION', verification: 'draft' }),
    ]);
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(out.transaction?.code).toBe('TX');
    expect(out.reason).toMatch(/verified/);
  });

  it('ignores inactive documents', () => {
    const out = resolveTerms({ saleMethodCode: 'MAKE_OFFER' }, [
      doc({ code: 'PLAT', layer: 'PLATFORM' }),
      doc({ code: 'TX_OLD', layer: 'TRANSACTION', active: false }),
    ]);
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED'); // no active transaction terms
    expect(out.transaction).toBeNull();
  });
});
