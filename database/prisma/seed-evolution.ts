import { newId } from '@singha/contracts';
import { disconnectPrisma, getPrisma } from '../src/client';

/**
 * Singha Evolution PREVIEW demo data (non-binding). Idempotent: guarded on Market 'LK'.
 * Adds a Sri Lanka market + operator + satellite node (lk-colombo), logistics reference
 * nodes, and listings across all six categories (vehicles, gems, machinery, property,
 * produce, scrap) — several attributed to the node so its local site has inventory.
 * No Sale/Settlement/Payment rows are ever created.
 */
const LKR = (rupees: number) => rupees * 100; // integer minor units

type Lot = {
  ref: string;
  category: string;
  title: string;
  attrs: Record<string, unknown>;
  open: number;
  inc: number;
  reserve?: number | null;
  days: number;
  onNode?: boolean;
};

const LOTS: Lot[] = [
  // vehicles
  {
    ref: 'EVO-VEH-1',
    category: 'vehicles',
    title: '2021 Toyota Hilux Rocco 4x4',
    attrs: { make: 'Toyota', model: 'Hilux Rocco', year: 2021, fuel: 'diesel' },
    open: LKR(18_500_000),
    inc: LKR(200_000),
    reserve: LKR(20_000_000),
    days: 4,
    onNode: true,
  },
  {
    ref: 'EVO-VEH-2',
    category: 'vehicles',
    title: '2018 Nissan Caravan GX',
    attrs: { make: 'Nissan', model: 'Caravan GX', year: 2018, fuel: 'diesel' },
    open: LKR(9_800_000),
    inc: LKR(120_000),
    days: 6,
  },
  // gems
  {
    ref: 'EVO-GEM-1',
    category: 'gems',
    title: 'Padparadscha Sapphire · 3.1ct',
    attrs: {
      type: 'Padparadscha Sapphire',
      caratWeight: 3.1,
      origin: 'Ratnapura',
      certified: true,
    },
    open: LKR(6_200_000),
    inc: LKR(150_000),
    reserve: LKR(7_000_000),
    days: 8,
    onNode: true,
  },
  {
    ref: 'EVO-GEM-2',
    category: 'gems',
    title: "Cat's Eye Chrysoberyl · 5.4ct",
    attrs: { type: "Cat's Eye", caratWeight: 5.4, origin: 'Sri Lanka', certified: true },
    open: LKR(4_100_000),
    inc: LKR(100_000),
    days: 9,
  },
  // machinery
  {
    ref: 'EVO-MAC-1',
    category: 'machinery',
    title: 'Komatsu PC200-8 Excavator',
    attrs: { make: 'Komatsu', model: 'PC200-8', year: 2017, condition: 'used' },
    open: LKR(11_500_000),
    inc: LKR(250_000),
    reserve: LKR(12_500_000),
    days: 5,
    onNode: true,
  },
  {
    ref: 'EVO-MAC-2',
    category: 'machinery',
    title: 'JCB 3DX Backhoe Loader',
    attrs: { make: 'JCB', model: '3DX', year: 2019, condition: 'used' },
    open: LKR(9_200_000),
    inc: LKR(150_000),
    days: 7,
  },
  // property
  {
    ref: 'EVO-PROP-1',
    category: 'property',
    title: 'Beachfront Land · 80 perches, Galle',
    attrs: { propertyType: 'land', extentPerches: 80, district: 'Galle' },
    open: LKR(240_000_000),
    inc: LKR(2_000_000),
    reserve: LKR(250_000_000),
    days: 12,
    onNode: true,
  },
  {
    ref: 'EVO-PROP-2',
    category: 'property',
    title: 'Warehouse · 22,000 sqft, Biyagama',
    attrs: { propertyType: 'commercial', extentSqft: 22000, district: 'Gampaha' },
    open: LKR(160_000_000),
    inc: LKR(1_500_000),
    days: 14,
  },
  // produce (free-text category)
  {
    ref: 'EVO-PRD-1',
    category: 'produce',
    title: 'Ceylon Cinnamon (Alba) · 5 MT lot',
    attrs: { commodity: 'cinnamon', grade: 'Alba', quantity: 5, unit: 'MT', perishable: true },
    open: LKR(7_500_000),
    inc: LKR(100_000),
    days: 6,
    onNode: true,
  },
  {
    ref: 'EVO-PRD-2',
    category: 'produce',
    title: 'Red Onion · 40 MT, Dambulla',
    attrs: { commodity: 'red onion', quantity: 40, unit: 'MT', perishable: true },
    open: LKR(6_000_000),
    inc: LKR(80_000),
    days: 3,
  },
  // scrap (free-text category)
  {
    ref: 'EVO-SCR-1',
    category: 'scrap',
    title: 'Heavy Melting Steel Scrap · 120 MT',
    attrs: { material: 'HMS 1&2', quantity: 120, unit: 'MT', source: 'industrial' },
    open: LKR(9_600_000),
    inc: LKR(120_000),
    days: 5,
    onNode: true,
  },
  {
    ref: 'EVO-SCR-2',
    category: 'scrap',
    title: 'Copper Cable Scrap · 8 MT (Millberry)',
    attrs: { material: 'copper millberry', quantity: 8, unit: 'MT', purity: '99%' },
    open: LKR(24_000_000),
    inc: LKR(250_000),
    days: 7,
  },
];

const LOGISTICS_NODES = [
  { code: 'LKCMB', name: 'Port of Colombo', kind: 'seaport', countryCode: 'LK', city: 'Colombo' },
  {
    code: 'LKCMB-AIR',
    name: 'Bandaranaike International Airport',
    kind: 'airport',
    countryCode: 'LK',
    city: 'Katunayake',
  },
  {
    code: 'LKHIP',
    name: 'Hambantota Port',
    kind: 'seaport',
    countryCode: 'LK',
    city: 'Hambantota',
  },
  { code: 'AEJEA', name: 'Jebel Ali Port', kind: 'seaport', countryCode: 'AE', city: 'Dubai' },
];

async function main(): Promise<void> {
  const prisma = getPrisma();

  if (await prisma.market.findUnique({ where: { code: 'LK' } })) {
    console.log('Evolution preview data already present — skipping.');
    return;
  }

  // Market + operator + satellite node -----------------------------------------
  const marketId = newId();
  await prisma.market.create({
    data: {
      id: marketId,
      code: 'LK',
      name: 'Sri Lanka',
      countryCode: 'LK',
      defaultCurrency: 'LKR',
      defaultLanguage: 'en',
      defaultTimezone: 'Asia/Colombo',
      sortOrder: 1,
    },
  });
  const operatorId = newId();
  await prisma.operator.create({
    data: {
      id: operatorId,
      code: 'SINGHA-LK',
      publicName: 'Singha Auctions (Sri Lanka)',
      legalName: 'Singha Auctions Lanka (Pvt) Ltd',
      verification: 'verified',
      disclosure: 'Marketplace operator for the Sri Lanka market.',
    },
  });
  await prisma.operatorMarket.create({
    data: { id: newId(), operatorId, marketId },
  });
  const nodeId = newId();
  await prisma.marketNode.create({
    data: {
      id: nodeId,
      code: 'lk-colombo',
      name: 'Singha Colombo',
      mode: 'LOCAL_COMMERCE',
      primaryMarketId: marketId,
      defaultCurrency: 'LKR',
      defaultLanguage: 'en',
      defaultLocationCountry: 'LK',
      canOriginateListings: true,
      canTakeOffers: true,
      canRunAuctions: true,
      canAcceptPayments: false, // non-binding preview
      verification: 'verified',
    },
  });
  await prisma.marketNodeOperator.create({
    data: { id: newId(), nodeId, operatorId },
  });

  // Logistics reference nodes ---------------------------------------------------
  for (const n of LOGISTICS_NODES) {
    await prisma.logisticsNode.create({ data: { id: newId(), ...n } });
  }

  // Seller + listings across six categories ------------------------------------
  const sellerId = newId();
  await prisma.customer.create({
    data: {
      id: sellerId,
      email: 'evo-seller@demo.singha.lk',
      legalName: 'Evolution Demo Consignments',
      status: 'active',
      kycStatus: 'verified',
    },
  });

  const now = Date.now();
  for (const lot of LOTS) {
    const assetId = newId();
    await prisma.asset.create({
      data: {
        id: assetId,
        category: lot.category,
        schemaVersion: 1,
        attributes: lot.attrs,
        ownerCustomerId: sellerId,
        lifecycle: 'available',
      },
    });
    const listingId = newId();
    await prisma.listing.create({
      data: {
        id: listingId,
        assetId,
        saleMethod: 'TIMED_AUCTION',
        status: 'scheduled',
        publicRef: lot.ref,
        title: lot.title,
        operatorId,
        originNodeId: lot.onNode ? nodeId : undefined,
      },
    });
    await prisma.auction.create({
      data: {
        id: newId(),
        listingId,
        status: 'open',
        currency: 'LKR',
        startsAt: new Date(now - 3_600_000),
        endsAt: new Date(now + lot.days * 86_400_000),
        openingBidMinor: lot.open,
        incrementMinor: lot.inc,
        reserveMinor: lot.reserve ?? undefined,
        reserveVisible: false,
        softCloseTriggerSec: 60,
        softCloseExtendSec: 120,
      },
    });
  }

  console.log(
    `Seeded Evolution preview: 1 market, 1 operator, node lk-colombo, ` +
      `${LOGISTICS_NODES.length} logistics nodes, ${LOTS.length} listings ` +
      `(${LOTS.filter((l) => l.onNode).length} on node) across 6 categories.`,
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
