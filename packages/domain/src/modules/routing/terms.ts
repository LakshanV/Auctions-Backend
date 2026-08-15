import type { RoutingInput, TermsRef, TermsResolution } from '@singha/contracts';
import type { ConfigVerification } from './routing';

/**
 * Two-layer Terms resolution (Evolution E6, pack doc 07). Platform Terms apply to every
 * transaction; Transaction Terms resolve from operator / jurisdiction / category / sale-method
 * config, most-specific first. Legal wording stays owner/legal-reviewed content referenced by
 * `bodyRef` — Claude never invents law (DECISIONS D7). Binding requires BOTH layers present and
 * `verified`; otherwise the resolution is a non-binding preview (MANUAL_REVIEW_REQUIRED).
 */

/** A DB-agnostic view of a terms document (the service loads these from `terms_document`). */
export interface TermsDocumentView {
  code: string;
  version: number;
  layer: 'PLATFORM' | 'TRANSACTION';
  operatorCode: string | null;
  jurisdiction: string | null;
  category: string | null;
  saleMethodCode: string | null;
  bodyRef: string | null;
  verification: ConfigVerification;
  active: boolean;
}

const TRANSACTION_CONDITIONS: {
  doc: keyof TermsDocumentView;
  input: keyof RoutingInput;
}[] = [
  { doc: 'operatorCode', input: 'operatorCode' },
  { doc: 'jurisdiction', input: 'jurisdiction' },
  { doc: 'category', input: 'category' },
  { doc: 'saleMethodCode', input: 'saleMethodCode' },
];

const toRef = (d: TermsDocumentView): TermsRef => ({
  code: d.code,
  version: d.version,
  layer: d.layer,
  verification: d.verification,
  bodyRef: d.bodyRef,
});

/** The current platform terms = the highest-version active PLATFORM document. */
function resolvePlatform(docs: readonly TermsDocumentView[]): TermsDocumentView | null {
  return (
    docs
      .filter((d) => d.active && d.layer === 'PLATFORM')
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** The most-specific active TRANSACTION document matching the input (highest version breaks ties). */
function resolveTransaction(
  input: RoutingInput,
  docs: readonly TermsDocumentView[],
): TermsDocumentView | null {
  const scored = docs
    .filter((d) => d.active && d.layer === 'TRANSACTION')
    .map((d) => {
      let specificity = 0;
      for (const { doc, input: ik } of TRANSACTION_CONDITIONS) {
        const cond = d[doc] as string | null;
        if (cond == null) continue;
        if (input[ik] !== cond) return null;
        specificity += 1;
      }
      return { doc: d, specificity };
    })
    .filter((x): x is { doc: TermsDocumentView; specificity: number } => x !== null)
    .sort((a, b) => b.specificity - a.specificity || b.doc.version - a.doc.version);
  return scored[0]?.doc ?? null;
}

/** Resolve both terms layers for a transaction shape. */
export function resolveTerms(
  input: RoutingInput,
  docs: readonly TermsDocumentView[],
): TermsResolution {
  const platform = resolvePlatform(docs);
  const transaction = resolveTransaction(input, docs);

  if (!platform || !transaction) {
    const missing = [!platform && 'platform', !transaction && 'transaction']
      .filter(Boolean)
      .join(' + ');
    return {
      platform: platform ? toRef(platform) : null,
      transaction: transaction ? toRef(transaction) : null,
      status: 'MANUAL_REVIEW_REQUIRED',
      reason: `missing ${missing} terms for this transaction`,
    };
  }

  const bothVerified =
    platform.verification === 'verified' && transaction.verification === 'verified';
  return {
    platform: toRef(platform),
    transaction: toRef(transaction),
    status: bothVerified ? 'RESOLVED' : 'MANUAL_REVIEW_REQUIRED',
    reason: bothVerified
      ? `platform ${platform.code} v${platform.version} + transaction ${transaction.code} v${transaction.version}`
      : 'terms present but not owner-verified — binding requires verified terms (owner action)',
  };
}
