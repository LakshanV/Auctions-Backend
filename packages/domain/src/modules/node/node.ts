/**
 * Satellite Market Node engine (Evolution E13, pack Addendum A). PURE logic for the two node modes
 * and the **non-negotiable invariant**: a node is a presentation / origination / local-routing
 * surface, **never a system of record**. There is no per-country ledger — every binding record lives
 * in the one central authoritative domain. A node can never self-assert operator/terms/payment;
 * origination is attribution, and routing (E6) still decides the binding facts.
 */

export type NodeMode = 'DISCOVERY' | 'LOCAL_COMMERCE';
export type NodeCapability = 'listings' | 'offers' | 'auctions' | 'payments';

export interface NodeConfig {
  code: string;
  mode: NodeMode;
  canOriginateListings: boolean;
  canTakeOffers: boolean;
  canRunAuctions: boolean;
  canAcceptPayments: boolean;
  verification: 'draft' | 'unverified' | 'verified';
}

export type OriginationOutcome =
  'ALLOWED' | 'DISCOVERY_ONLY' | 'CAPABILITY_DISABLED' | 'MANUAL_REVIEW_REQUIRED';

export interface OriginationDecision {
  allowed: boolean;
  outcome: OriginationOutcome;
  reason: string;
}

function capabilityEnabled(node: NodeConfig, capability: NodeCapability): boolean {
  switch (capability) {
    case 'listings':
      return node.canOriginateListings;
    case 'offers':
      return node.canTakeOffers;
    case 'auctions':
      return node.canRunAuctions;
    case 'payments':
      return node.canAcceptPayments;
  }
}

/** Normalized capability view for presentation (Discovery browse is always available). */
export function resolveNodeCapabilities(node: NodeConfig) {
  return {
    mode: node.mode,
    verification: node.verification,
    capabilities: {
      browse: true,
      originateListings: node.canOriginateListings,
      takeOffers: node.canTakeOffers,
      runAuctions: node.canRunAuctions,
      acceptPayments: node.canAcceptPayments,
    },
  };
}

/**
 * Decide whether a node may originate a binding record of `capability`. Discovery nodes may only
 * browse; a Local Commerce node needs the capability enabled AND verified owner config, otherwise the
 * binding path is a non-binding `MANUAL_REVIEW_REQUIRED` preview (D7). Even when ALLOWED, the record
 * is created centrally with origin-node attribution — the node never owns it.
 */
export function assessOrigination(
  node: NodeConfig,
  capability: NodeCapability,
): OriginationDecision {
  if (node.mode === 'DISCOVERY') {
    return {
      allowed: false,
      outcome: 'DISCOVERY_ONLY',
      reason: 'node is in Discovery mode — it routes into central inventory but originates nothing',
    };
  }
  if (!capabilityEnabled(node, capability)) {
    return {
      allowed: false,
      outcome: 'CAPABILITY_DISABLED',
      reason: `node is not enabled to originate ${capability}`,
    };
  }
  if (node.verification !== 'verified') {
    return {
      allowed: false,
      outcome: 'MANUAL_REVIEW_REQUIRED',
      reason: 'node operator/terms/payment config is not verified (O1/O4) — no binding origination',
    };
  }
  return {
    allowed: true,
    outcome: 'ALLOWED',
    reason:
      'node may originate; the canonical record is created centrally with origin-node attribution',
  };
}
