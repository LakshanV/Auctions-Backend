import type { RoutingInput, RoutingResolution } from '@singha/contracts';

/**
 * Transaction Routing Engine (Evolution E6, pack doc 07). PURE, deterministic and explainable:
 * given a transaction's shape and the configured `RoutingRule` rows it resolves the transaction
 * operator, payment route, terms and required verification — or `MANUAL_REVIEW_REQUIRED`. There is
 * NO country `if/else` forest; resolution is a table-driven, specificity-scored match, so new
 * markets/operators are configuration, not code. DECISIONS D7: unverified config yields a
 * non-binding PREVIEW (the resolved fields are still returned so staff can see what *would* bind),
 * never an automatic binding route.
 */

export type ConfigVerification = 'draft' | 'unverified' | 'verified';

/** A DB-agnostic view of a routing rule (the service loads these from `routing_rule`). */
export interface RoutingRuleView {
  code: string;
  version: number;
  /** Operator-set tie-break weight; higher wins when specificity ties. */
  priority: number;
  // Match conditions — null = wildcard (matches any input value).
  saleMethodCode: string | null;
  category: string | null;
  marketCode: string | null;
  jurisdiction: string | null;
  operatorCode: string | null;
  originNodeCode: string | null;
  destinationCountry: string | null;
  // Resolution outputs.
  transactionOperatorCode: string | null;
  paymentRouteCode: string | null;
  termsCode: string | null;
  disclosure: string | null;
  requiresKyc: boolean;
  requiresLicence: boolean;
  verification: ConfigVerification;
}

/** The rule's condition fields paired with the input field they constrain. */
const CONDITION_KEYS: {
  rule: keyof RoutingRuleView;
  input: keyof RoutingInput;
}[] = [
  { rule: 'saleMethodCode', input: 'saleMethodCode' },
  { rule: 'category', input: 'category' },
  { rule: 'marketCode', input: 'marketCode' },
  { rule: 'jurisdiction', input: 'jurisdiction' },
  { rule: 'operatorCode', input: 'operatorCode' },
  { rule: 'originNodeCode', input: 'originNodeCode' },
  { rule: 'destinationCountry', input: 'destinationCountry' },
];

interface Match {
  rule: RoutingRuleView;
  specificity: number;
  trace: string[];
}

/** A rule matches when every NON-null condition equals the corresponding input value. */
function matchRule(rule: RoutingRuleView, input: RoutingInput): Match | null {
  let specificity = 0;
  const trace: string[] = [];
  for (const { rule: rk, input: ik } of CONDITION_KEYS) {
    const condition = rule[rk] as string | null;
    if (condition == null) continue; // wildcard
    if (input[ik] !== condition) return null; // a constrained condition failed → no match
    specificity += 1;
    trace.push(`${String(rk)}=${condition}`);
  }
  return { rule, specificity, trace };
}

/**
 * Deterministic total ordering of matches: most specific first, then higher priority, then
 * lexicographically smallest code, then highest version. Guarantees the same input + same rule
 * set always resolves identically.
 */
function compareMatches(a: Match, b: Match): number {
  if (a.specificity !== b.specificity) return b.specificity - a.specificity;
  if (a.rule.priority !== b.rule.priority) return b.rule.priority - a.rule.priority;
  if (a.rule.code !== b.rule.code) return a.rule.code < b.rule.code ? -1 : 1;
  return b.rule.version - a.rule.version;
}

const manualReview = (
  reason: string,
  trace: string[],
  preview?: Partial<RoutingResolution>,
): RoutingResolution => ({
  status: 'MANUAL_REVIEW_REQUIRED',
  transactionOperatorCode: preview?.transactionOperatorCode ?? null,
  paymentRouteCode: preview?.paymentRouteCode ?? null,
  termsCode: preview?.termsCode ?? null,
  disclosures: preview?.disclosures ?? [],
  requiredVerification: preview?.requiredVerification ?? [],
  matchedRuleCode: preview?.matchedRuleCode ?? null,
  matchedRuleVersion: preview?.matchedRuleVersion ?? null,
  reason,
  trace,
});

/**
 * Resolve the routing for a transaction. Returns RESOLVED only when a matched rule is `verified`
 * AND the party satisfies every verification the rule demands; otherwise MANUAL_REVIEW_REQUIRED
 * with the would-be resolution as a preview and an explainable reason.
 */
export function resolveRouting(
  input: RoutingInput,
  rules: readonly RoutingRuleView[],
): RoutingResolution {
  const matches = rules
    .map((r) => matchRule(r, input))
    .filter((m): m is Match => m !== null)
    .sort(compareMatches);

  if (matches.length === 0) {
    return manualReview('no routing rule matched this transaction shape', [
      `no match for saleMethod=${input.saleMethodCode}`,
    ]);
  }

  const winner = matches[0]!;
  const rule = winner.rule;
  const trace = [
    `matched rule ${rule.code} v${rule.version} (specificity ${winner.specificity}, priority ${rule.priority})`,
    ...winner.trace,
  ];

  const disclosures = rule.disclosure ? [rule.disclosure] : [];

  // Verification the rule demands but the party has not satisfied.
  const requiredVerification: string[] = [];
  if (rule.requiresKyc && input.kycVerified !== true) requiredVerification.push('KYC');
  if (rule.requiresLicence && input.licenceHeld !== true) requiredVerification.push('LICENCE');

  const preview: Partial<RoutingResolution> = {
    transactionOperatorCode: rule.transactionOperatorCode,
    paymentRouteCode: rule.paymentRouteCode,
    termsCode: rule.termsCode,
    disclosures,
    requiredVerification,
    matchedRuleCode: rule.code,
    matchedRuleVersion: rule.version,
  };

  // D7: an unverified rule is a preview, never a binding route.
  if (rule.verification !== 'verified') {
    trace.push(`rule verification is ${rule.verification} → not binding (owner action)`);
    return manualReview(
      `matched rule ${rule.code} v${rule.version} is ${rule.verification}; binding requires verified operator/terms config`,
      trace,
      preview,
    );
  }

  // Verified rule, but the party still owes verification → hold for it.
  if (requiredVerification.length > 0) {
    trace.push(`party is missing required verification: ${requiredVerification.join(', ')}`);
    return manualReview(
      `route requires ${requiredVerification.join(', ')} before it can bind`,
      trace,
      preview,
    );
  }

  trace.push('verified rule, all required verification satisfied → RESOLVED');
  return {
    status: 'RESOLVED',
    transactionOperatorCode: rule.transactionOperatorCode,
    paymentRouteCode: rule.paymentRouteCode,
    termsCode: rule.termsCode,
    disclosures,
    requiredVerification: [],
    matchedRuleCode: rule.code,
    matchedRuleVersion: rule.version,
    reason: `resolved to operator ${rule.transactionOperatorCode ?? '(none)'} via rule ${rule.code} v${rule.version}`,
    trace,
  };
}
