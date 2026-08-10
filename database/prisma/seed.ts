import { newId } from '@singha/contracts';
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
];

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

  console.log(`Seeded ${FLAGS.length} feature flags and ${CONFIG.length} business-config rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
