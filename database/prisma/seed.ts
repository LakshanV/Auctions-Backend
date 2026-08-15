import { newId, SALE_METHOD_DEFINITIONS, UNIT_DEFINITIONS } from '@singha/contracts';
import { disconnectPrisma, getPrisma } from '../src/client';

/**
 * Safe, idempotent seed (docs/20). Seeds ONLY platform configuration — feature
 * flags and business-config placeholders. No customer/asset/bid/financial data.
 * Business values are placeholders flagged approvalRequired until the product
 * owner confirms them.
 */
const FLAGS: { key: string; enabled: boolean; description: string }[] = [
  { key: 'TIMED_AUCTIONS', enabled: true, description: 'Timed online auctions' },
  { key: 'EOI', enabled: true, description: 'Expression of Interest' },
  { key: 'CUBE_CATALOGUE', enabled: true, description: 'AuctionFlow Cube catalogue view' },
  { key: 'BUY_NOW', enabled: false, description: 'Buy Now (feature-flagged initially)' },
  { key: 'MAKE_OFFER', enabled: false, description: 'Make Offer (feature-flagged initially)' },
  {
    key: 'SEALED_TENDER',
    enabled: false,
    description: 'Sealed Tender (feature-flagged initially)',
  },
  { key: 'LIVE_AUCTIONS', enabled: false, description: 'Live/Hybrid (until acceptance passes)' },
  { key: 'AI_LISTING', enabled: false, description: 'AI listing drafts for staff' },
  {
    key: 'AI_MEDIA_ENHANCE',
    enabled: false,
    description: 'AI media enhancement (derivative only)',
  },
  {
    key: 'SOCIAL_AUTO_PUBLISH',
    enabled: false,
    description: 'Social auto-publish (off until enabled)',
  },
  { key: 'WHATSAPP_BID_INTENT', enabled: false, description: 'WhatsApp bid-intent flow' },
  // Singha Evolution (E2) — config foundations. All OFF until their surfaces land.
  {
    key: 'MULTI_OPERATOR',
    enabled: false,
    description: 'Operator/Market/Node config (Evolution E2)',
  },
  {
    key: 'STRUCTURED_LOCATIONS',
    enabled: false,
    description: 'First-class structured Location (Evolution E2/E3)',
  },
  {
    key: 'QUANTITY_UNITS',
    enabled: false,
    description: 'Quantity + unit engine (Evolution E2/E3)',
  },
  {
    key: 'SALE_METHOD_CONFIG',
    enabled: false,
    description: 'Configurable sale-method taxonomy (Evolution E2/E3)',
  },
  // Singha Evolution (E4) — Commercial Offer Engine V2. OFF until its surface lands.
  {
    key: 'COMMERCIAL_OFFERS_V2',
    enabled: false,
    description: 'Full-terms offer negotiation + immutable revisions (Evolution E4)',
  },
  {
    key: 'SEALED_OFFERS',
    enabled: false,
    description:
      'Confidential sealed offers: controlled reveal + explicit award, D4 (Evolution E4)',
  },
  // Singha Evolution (E5) — Currency / FX. OFF until their surfaces land.
  {
    key: 'MULTI_CURRENCY',
    enabled: false,
    description: 'Multi-currency support + supported-currency list (Evolution E5)',
  },
  {
    key: 'FX_DISPLAY',
    enabled: false,
    description: 'Informational display-currency conversion, non-binding, D5 (Evolution E5)',
  },
  // Singha Evolution (E6) — Transaction Routing + two-layer Terms. OFF until surfaces land.
  {
    key: 'TRANSACTION_ROUTING',
    enabled: false,
    description: 'Deterministic transaction routing engine + two-layer terms (Evolution E6)',
  },
  // Singha Evolution (E7) — Logistics / Ports / Incoterms. OFF until surfaces land.
  {
    key: 'LOGISTICS',
    enabled: false,
    description: 'Logistics surface + deterministic instant freight estimates (Evolution E7)',
  },
  {
    key: 'LOGISTICS_QUOTES',
    enabled: false,
    description: 'Live logistics provider quotes, owner O6 (Evolution E7)',
  },
  // Singha Evolution (E8) — Fees / Tax / Rules engine. OFF until surfaces land.
  {
    key: 'FEES_ENGINE',
    enabled: false,
    description: 'Versioned deterministic fee/tax charge-breakdown engine (Evolution E8)',
  },
  {
    key: 'OPERATOR_PAYMENTS',
    enabled: false,
    description: 'Regulated payment-route resolver + signed idempotent webhooks, O4 (Evolution E8)',
  },
  // Singha Evolution (E9) — Procurement / two-sided market. OFF until surfaces land.
  {
    key: 'PROCUREMENT',
    enabled: false,
    description: 'Buyer-initiated RFQ / Request-Supply / reverse-tender + supplier proposals (E9)',
  },
];

// Sale-method + unit taxonomies are the canonical, versioned constants from
// @singha/contracts (SALE_METHOD_DEFINITIONS / UNIT_DEFINITIONS) so seed, domain
// logic and contracts never drift (Evolution E2, DECISIONS D3/D4; pack doc 13).

const CONFIG: { key: string; value: string; approvalRequired: boolean }[] = [
  { key: 'buyer_premium_pct', value: '0', approvalRequired: true },
  { key: 'seller_commission_pct', value: '0', approvalRequired: true },
  { key: 'tax_pct', value: '0', approvalRequired: true },
  { key: 'payment_deadline_hours', value: '72', approvalRequired: true },
  { key: 'collection_deadline_days', value: '14', approvalRequired: true },
  { key: 'reserve_visibility', value: 'hidden', approvalRequired: true },
  { key: 'public_bid_history', value: 'anonymized', approvalRequired: true },
  { key: 'default_currency', value: 'LKR', approvalRequired: false },
];

async function main(): Promise<void> {
  const prisma = getPrisma();

  for (const flag of FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: { enabled: flag.enabled, description: flag.description },
      create: { id: newId(), ...flag },
    });
  }

  for (const cfg of CONFIG) {
    await prisma.businessConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value, approvalRequired: cfg.approvalRequired },
      create: { id: newId(), ...cfg },
    });
  }

  for (const m of SALE_METHOD_DEFINITIONS) {
    await prisma.saleMethodDefinition.upsert({
      where: { code: m.code },
      update: {
        label: m.label,
        family: m.family,
        isAuction: m.isAuction,
        bindsAutomatically: m.bindsAutomatically,
        requiresEligibility: m.requiresEligibility,
        legacyEnum: m.legacyEnum,
        active: m.active,
        sortOrder: m.sortOrder,
      },
      create: { id: newId(), ...m },
    });
  }

  for (const u of UNIT_DEFINITIONS) {
    await prisma.unitDefinition.upsert({
      where: { code: u.code },
      update: {
        label: u.label,
        plural: u.plural,
        kind: u.kind,
        active: u.active,
        sortOrder: u.sortOrder,
      },
      create: { id: newId(), ...u },
    });
  }

  console.log(
    `Seeded ${FLAGS.length} feature flags, ${CONFIG.length} business-config rows, ` +
      `${SALE_METHOD_DEFINITIONS.length} sale methods and ${UNIT_DEFINITIONS.length} units.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
