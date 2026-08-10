/**
 * Declared domain-module boundary graph (docs/03). Modules communicate through
 * commands and events, not by reaching into each other's internals. `dependsOn`
 * lists the modules whose PUBLISHED contracts a module may import at compile
 * time; the graph must stay acyclic. Code-level enforcement (dependency-cruiser
 * / eslint import boundaries) is a later hardening step — see DECISIONS D-0011.
 */
export type ModuleName =
  | 'identity'
  | 'seller'
  | 'inventory'
  | 'media'
  | 'marketplace'
  | 'auction'
  | 'exchange'
  | 'commerce'
  | 'payments'
  | 'fulfilment'
  | 'settlement'
  | 'notifications'
  | 'conversations'
  | 'social'
  | 'live'
  | 'ai'
  | 'analytics'
  | 'audit'
  | 'search';

export interface ModuleManifest {
  name: ModuleName;
  title: string;
  description: string;
  dependsOn: ModuleName[];
}

export const MODULES: Record<ModuleName, ModuleManifest> = {
  identity: {
    name: 'identity',
    title: 'Identity & Customer',
    description: 'One customer across channels; verified facts separate from AI intelligence.',
    dependsOn: [],
  },
  seller: {
    name: 'seller',
    title: 'Seller / Vendor',
    description: 'Seller onboarding, organizations and staff.',
    dependsOn: ['identity'],
  },
  inventory: {
    name: 'inventory',
    title: 'Inventory / Asset',
    description: 'Enduring Asset records and category schemas.',
    dependsOn: ['identity', 'seller'],
  },
  media: {
    name: 'media',
    title: 'Media / Documents',
    description: 'Immutable originals + derived media/documents with provenance.',
    dependsOn: ['inventory'],
  },
  marketplace: {
    name: 'marketplace',
    title: 'Marketplace / Listing',
    description: 'A Listing is one sale attempt for an Asset.',
    dependsOn: ['inventory', 'media', 'seller'],
  },
  auction: {
    name: 'auction',
    title: 'Auction',
    description: 'Server-authoritative timed auction engine and append-only bid ledger.',
    dependsOn: ['marketplace', 'identity'],
  },
  exchange: {
    name: 'exchange',
    title: 'EOI / Offer / Tender',
    description: 'Private sale modes: EOI, Make Offer, Sealed Tender, Buy Now.',
    dependsOn: ['marketplace', 'identity'],
  },
  commerce: {
    name: 'commerce',
    title: 'Commerce',
    description: 'Sale confirmation, invoices and the append-only financial ledger.',
    dependsOn: ['auction', 'exchange', 'marketplace', 'identity'],
  },
  payments: {
    name: 'payments',
    title: 'Payments',
    description: 'Payment intake, proofs and reconciliation behind a provider adapter.',
    dependsOn: ['commerce', 'identity'],
  },
  fulfilment: {
    name: 'fulfilment',
    title: 'Fulfilment',
    description: 'Release, pickup and delivery from authoritative server state.',
    dependsOn: ['commerce', 'inventory'],
  },
  settlement: {
    name: 'settlement',
    title: 'Settlement',
    description: 'Seller settlement calculation and disbursement.',
    dependsOn: ['commerce', 'payments', 'seller'],
  },
  notifications: {
    name: 'notifications',
    title: 'Notifications',
    description: 'Deterministic transactional alerts + optional ranked marketing.',
    dependsOn: ['identity'],
  },
  conversations: {
    name: 'conversations',
    title: 'Conversations',
    description: 'Omnichannel conversation core; bid intents, never direct bids.',
    dependsOn: ['identity'],
  },
  social: {
    name: 'social',
    title: 'Social Publisher',
    description: 'Approved listings -> optional derivative social publications.',
    dependsOn: ['marketplace'],
  },
  live: {
    name: 'live',
    title: 'Live Auction',
    description: 'Live/hybrid auction OS; video providers never own auction state.',
    dependsOn: ['auction', 'marketplace'],
  },
  ai: {
    name: 'ai',
    title: 'AI / Intelligence',
    description: 'Replaceable derived intelligence; never a source of truth.',
    dependsOn: [],
  },
  analytics: {
    name: 'analytics',
    title: 'Analytics',
    description: 'Rebuildable projections: comparables, Market Pulse, metrics.',
    dependsOn: [],
  },
  audit: {
    name: 'audit',
    title: 'Audit',
    description: 'Append-only business evidence. Nobody deletes audit history.',
    dependsOn: [],
  },
  search: {
    name: 'search',
    title: 'Search',
    description: 'Rebuildable, never-authoritative search index behind an adapter.',
    dependsOn: [],
  },
};

/** Throws if the declared dependency graph contains a cycle. */
export function assertAcyclic(modules: Record<ModuleName, ModuleManifest> = MODULES): void {
  const visiting = new Set<ModuleName>();
  const done = new Set<ModuleName>();

  const visit = (name: ModuleName, trail: ModuleName[]): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Module dependency cycle detected: ${[...trail, name].join(' -> ')}`);
    }
    visiting.add(name);
    for (const dep of modules[name].dependsOn) {
      visit(dep, [...trail, name]);
    }
    visiting.delete(name);
    done.add(name);
  };

  for (const name of Object.keys(modules) as ModuleName[]) {
    visit(name, []);
  }
}

/** Topological build order (dependencies before dependents). */
export function moduleOrder(modules: Record<ModuleName, ModuleManifest> = MODULES): ModuleName[] {
  assertAcyclic(modules);
  const order: ModuleName[] = [];
  const placed = new Set<ModuleName>();

  const place = (name: ModuleName): void => {
    if (placed.has(name)) return;
    for (const dep of modules[name].dependsOn) place(dep);
    placed.add(name);
    order.push(name);
  };

  for (const name of Object.keys(modules) as ModuleName[]) place(name);
  return order;
}
