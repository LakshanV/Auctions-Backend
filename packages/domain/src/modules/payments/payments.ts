import type {
  PaymentProviderKind,
  PaymentRouteResolution,
  ResolvePaymentRouteInput,
} from '@singha/contracts';
import type { ConfigVerification } from '../routing/routing';

/**
 * Payment-route resolver (Evolution E8b, pack doc 10). PURE + deterministic: resolves the regulated,
 * operator-specific route for a transaction from configured `PaymentRoute` rows. Singha never
 * creates unlicensed internal banking/escrow — a route ALWAYS references an external regulated
 * provider, and a route that is not owner-verified/licensed yields `MANUAL_REVIEW_REQUIRED` (owner
 * O4, D7). Same operator + shape + rule set always resolves identically.
 */

export interface PaymentRouteView {
  code: string;
  version: number;
  priority: number;
  provider: string;
  providerKind: PaymentProviderKind;
  instructionsRef: string | null;
  operatorCode: string;
  currency: string | null;
  jurisdiction: string | null;
  saleMethodCode: string | null;
  purpose: string | null;
  verification: ConfigVerification;
  active: boolean;
}

const CONDITION_KEYS: {
  route: keyof PaymentRouteView;
  input: keyof ResolvePaymentRouteInput;
}[] = [
  { route: 'currency', input: 'currency' },
  { route: 'jurisdiction', input: 'jurisdiction' },
  { route: 'saleMethodCode', input: 'saleMethodCode' },
  { route: 'purpose', input: 'purpose' },
];

/** A bank transfer or offline route always settles manually (there is no internal ledger). */
function isManualSettlement(kind: PaymentProviderKind): boolean {
  return kind === 'manual_offline' || kind === 'operator_bank_transfer';
}

const manualReview = (
  reason: string,
  preview?: Partial<PaymentRouteResolution>,
): PaymentRouteResolution => ({
  status: 'MANUAL_REVIEW_REQUIRED',
  routeCode: preview?.routeCode ?? null,
  provider: preview?.provider ?? null,
  providerKind: preview?.providerKind ?? null,
  instructionsRef: preview?.instructionsRef ?? null,
  requiresManualSettlement: preview?.requiresManualSettlement ?? true,
  matchedRuleCode: preview?.matchedRuleCode ?? null,
  matchedRuleVersion: preview?.matchedRuleVersion ?? null,
  reason,
});

/**
 * Resolve a regulated payment route. Routes are operator-scoped: the route's operator MUST equal
 * the input operator. The most-specific verified route wins; an unverified route is a non-binding
 * preview (O4); no matching route → `MANUAL_REVIEW_REQUIRED`.
 */
export function resolvePaymentRoute(
  input: ResolvePaymentRouteInput,
  routes: readonly PaymentRouteView[],
): PaymentRouteResolution {
  const matches: { route: PaymentRouteView; specificity: number }[] = [];
  for (const route of routes) {
    if (!route.active || route.operatorCode !== input.operatorCode) continue;
    let specificity = 0;
    let ok = true;
    for (const { route: rk, input: ik } of CONDITION_KEYS) {
      const cond = route[rk] as string | null;
      if (cond == null) continue;
      if (input[ik] !== cond) {
        ok = false;
        break;
      }
      specificity += 1;
    }
    if (ok) matches.push({ route, specificity });
  }
  matches.sort((a, b) => {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    if (a.route.priority !== b.route.priority) return b.route.priority - a.route.priority;
    if (a.route.code !== b.route.code) return a.route.code < b.route.code ? -1 : 1;
    return b.route.version - a.route.version;
  });

  const winner = matches[0]?.route;
  if (!winner) {
    return manualReview(
      `no regulated payment route configured for operator ${input.operatorCode} / ${input.currency}`,
    );
  }
  const preview: Partial<PaymentRouteResolution> = {
    routeCode: winner.code,
    provider: winner.provider,
    providerKind: winner.providerKind,
    instructionsRef: winner.instructionsRef,
    requiresManualSettlement: isManualSettlement(winner.providerKind),
    matchedRuleCode: winner.code,
    matchedRuleVersion: winner.version,
  };
  if (winner.verification !== 'verified') {
    return manualReview(
      `route ${winner.code} v${winner.version} is ${winner.verification}; a regulated route must be owner-verified/licensed (O4)`,
      preview,
    );
  }
  return {
    status: 'RESOLVED',
    routeCode: winner.code,
    provider: winner.provider,
    providerKind: winner.providerKind,
    instructionsRef: winner.instructionsRef,
    requiresManualSettlement: isManualSettlement(winner.providerKind),
    matchedRuleCode: winner.code,
    matchedRuleVersion: winner.version,
    reason: `resolved to ${winner.provider} (${winner.providerKind}) via route ${winner.code} v${winner.version}`,
  };
}
