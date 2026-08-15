import type {
  ChargeAppliesTo,
  ChargeBasis,
  ChargeComponent,
  ChargeSide,
  FeeRuleStatus,
} from '@singha/contracts';
import { IllegalTransition } from '../../kernel/errors';
import type { ConfigVerification } from '../routing/routing';

/**
 * Fees / Tax rules engine (Evolution E8, pack doc 10). PURE, deterministic, **float-free** money
 * math (D5/D6). Versioned config rules compute a transaction's charge breakdown; exactly one rule
 * applies per component (most-specific → priority → code → version), so charges never
 * double-count, and every line records the applied rule + rate so the result is **reproducible
 * after rules change**. An unverified applied rule (esp. tax, owner O3) makes the whole breakdown a
 * non-binding PREVIEW (`MANUAL_REVIEW_REQUIRED`, D7) — it never becomes an automatic binding
 * charge.
 */

const BPS = 10_000n;

/** Positive-value integer division rounded half-up (no float). */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new IllegalTransition('denominator must be positive');
  return (2n * numerator + denominator) / (2n * denominator);
}

/** A DB-agnostic view of a fee rule. */
export interface FeeRuleView {
  code: string;
  version: number;
  priority: number;
  component: ChargeComponent;
  side: ChargeSide;
  basis: ChargeBasis;
  rateBps: number | null;
  fixedMinor: bigint | null;
  appliesTo: ChargeAppliesTo;
  operatorCode: string | null;
  jurisdiction: string | null;
  category: string | null;
  saleMethodCode: string | null;
  minPrincipalMinor: bigint | null;
  maxPrincipalMinor: bigint | null;
  verification: ConfigVerification;
}

export interface ChargesInput {
  principalMinor: bigint;
  operatorCode?: string;
  jurisdiction?: string;
  category?: string;
  saleMethodCode?: string;
}

export interface ChargeLineValue {
  component: ChargeComponent;
  side: ChargeSide;
  basis: ChargeBasis;
  amountMinor: bigint;
  appliedRuleCode: string;
  appliedRuleVersion: number;
  rateBps: number | null;
  fixedMinor: bigint | null;
}

export interface ChargesResultValue {
  status: FeeRuleStatus;
  principalMinor: bigint;
  lines: ChargeLineValue[];
  buyerFeesMinor: bigint;
  taxMinor: bigint;
  buyerTotalMinor: bigint;
  sellerCommissionMinor: bigint;
  sellerProceedsMinor: bigint;
  reason: string;
}

const CONDITION_KEYS: { rule: keyof FeeRuleView; input: keyof ChargesInput }[] = [
  { rule: 'operatorCode', input: 'operatorCode' },
  { rule: 'jurisdiction', input: 'jurisdiction' },
  { rule: 'category', input: 'category' },
  { rule: 'saleMethodCode', input: 'saleMethodCode' },
];

/** A rule matches when every set condition equals the input AND the principal is within its band. */
function matchSpecificity(rule: FeeRuleView, input: ChargesInput): number | null {
  let specificity = 0;
  for (const { rule: rk, input: ik } of CONDITION_KEYS) {
    const cond = rule[rk] as string | null;
    if (cond == null) continue;
    if (input[ik] !== cond) return null;
    specificity += 1;
  }
  if (rule.minPrincipalMinor != null && input.principalMinor < rule.minPrincipalMinor) return null;
  if (rule.maxPrincipalMinor != null && input.principalMinor > rule.maxPrincipalMinor) return null;
  if (rule.minPrincipalMinor != null || rule.maxPrincipalMinor != null) specificity += 1;
  return specificity;
}

/** Deterministic ordering: most specific, then higher priority, then code asc, then version desc. */
function pickBest(candidates: { rule: FeeRuleView; specificity: number }[]): FeeRuleView | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    if (a.rule.priority !== b.rule.priority) return b.rule.priority - a.rule.priority;
    if (a.rule.code !== b.rule.code) return a.rule.code < b.rule.code ? -1 : 1;
    return b.rule.version - a.rule.version;
  })[0]!.rule;
}

/** The single applicable rule per component (or none), deterministically chosen. */
function resolvePerComponent(
  rules: readonly FeeRuleView[],
  input: ChargesInput,
): Map<ChargeComponent, FeeRuleView> {
  const byComponent = new Map<ChargeComponent, { rule: FeeRuleView; specificity: number }[]>();
  for (const rule of rules) {
    const specificity = matchSpecificity(rule, input);
    if (specificity == null) continue;
    const list = byComponent.get(rule.component) ?? [];
    list.push({ rule, specificity });
    byComponent.set(rule.component, list);
  }
  const chosen = new Map<ChargeComponent, FeeRuleView>();
  for (const [component, candidates] of byComponent) {
    const best = pickBest(candidates);
    if (best) chosen.set(component, best);
  }
  return chosen;
}

/** Compute a single rule's amount against a base (float-free). */
function amountFor(rule: FeeRuleView, base: bigint): bigint {
  if (rule.basis === 'FIXED') {
    if (rule.fixedMinor == null)
      throw new IllegalTransition(`rule ${rule.code} FIXED without amount`);
    return rule.fixedMinor;
  }
  if (rule.rateBps == null) throw new IllegalTransition(`rule ${rule.code} PERCENT without rate`);
  if (rule.rateBps < 0) throw new IllegalTransition(`rule ${rule.code} negative rate`);
  return divRoundHalfUp(base * BigInt(rule.rateBps), BPS);
}

function toLine(rule: FeeRuleView, amountMinor: bigint): ChargeLineValue {
  return {
    component: rule.component,
    side: rule.side,
    basis: rule.basis,
    amountMinor,
    appliedRuleCode: rule.code,
    appliedRuleVersion: rule.version,
    rateBps: rule.basis === 'PERCENT' ? rule.rateBps : null,
    fixedMinor: rule.basis === 'FIXED' ? rule.fixedMinor : null,
  };
}

/**
 * Compute the full charge breakdown for a transaction. Buyer fees (non-tax) apply to the principal;
 * tax applies to the principal or the buyer subtotal per its `appliesTo`; seller commission is
 * deducted from the seller's proceeds. Exactly one rule per component. Deterministic + reproducible.
 */
export function computeCharges(
  input: ChargesInput,
  rules: readonly FeeRuleView[],
): ChargesResultValue {
  if (input.principalMinor < 0n) throw new IllegalTransition('principalMinor must be non-negative');
  const chosen = resolvePerComponent(rules, input);
  const lines: ChargeLineValue[] = [];
  const applied: FeeRuleView[] = [];

  // 1) Buyer-side non-tax fees, applied to the principal.
  let buyerFeesMinor = 0n;
  for (const [component, rule] of chosen) {
    if (rule.side !== 'BUYER' || component === 'tax') continue;
    const amount = amountFor(rule, input.principalMinor);
    buyerFeesMinor += amount;
    lines.push(toLine(rule, amount));
    applied.push(rule);
  }
  const buyerSubtotalMinor = input.principalMinor + buyerFeesMinor;

  // 2) Tax, on the principal or the buyer subtotal per the rule's appliesTo.
  let taxMinor = 0n;
  const taxRule = chosen.get('tax');
  if (taxRule) {
    const base = taxRule.appliesTo === 'BUYER_SUBTOTAL' ? buyerSubtotalMinor : input.principalMinor;
    taxMinor = amountFor(taxRule, base);
    lines.push(toLine(taxRule, taxMinor));
    applied.push(taxRule);
  }
  const buyerTotalMinor = buyerSubtotalMinor + taxMinor;

  // 3) Seller-side charges (commission), deducted from proceeds.
  let sellerCommissionMinor = 0n;
  for (const [component, rule] of chosen) {
    if (rule.side !== 'SELLER' || component === 'tax') continue;
    const amount = amountFor(rule, input.principalMinor);
    sellerCommissionMinor += amount;
    lines.push(toLine(rule, amount));
    applied.push(rule);
  }
  const sellerProceedsMinor = input.principalMinor - sellerCommissionMinor;

  const unverified = applied.some((r) => r.verification !== 'verified');
  return {
    status: unverified ? 'MANUAL_REVIEW_REQUIRED' : 'RESOLVED',
    principalMinor: input.principalMinor,
    lines,
    buyerFeesMinor,
    taxMinor,
    buyerTotalMinor,
    sellerCommissionMinor,
    sellerProceedsMinor,
    reason: unverified
      ? 'one or more applied rules are not owner-verified — breakdown is a non-binding preview (O3)'
      : `resolved ${applied.length} charge rule(s)`,
  };
}
