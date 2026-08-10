import { newId } from '@singha/contracts';
import { disconnectPrisma, getPrisma } from '../src/client';

/**
 * Demo catalogue data so a hosted deployment isn't empty. Idempotent: if the
 * demo set already exists it does nothing. Creates one seller + a handful of
 * open auctions across categories. No bids (fresh at opening price).
 */
const LKR = (rupees: number) => rupees * 100; // minor units

const LOTS = [
  {
    ref: 'LOT-DEMO-1',
    category: 'vehicles',
    title: '2019 Toyota Land Cruiser Prado',
    attrs: { make: 'Toyota', model: 'Land Cruiser Prado', year: 2019, fuel: 'diesel' },
    open: LKR(20_000_000),
    inc: LKR(250_000),
    reserve: LKR(24_000_000),
    days: 5,
  },
  {
    ref: 'LOT-DEMO-2',
    category: 'gems',
    title: 'Ceylon Blue Sapphire · 4.2ct',
    attrs: { type: 'Blue Sapphire', caratWeight: 4.2, origin: 'Ratnapura', certified: true },
    open: LKR(3_500_000),
    inc: LKR(100_000),
    reserve: LKR(4_000_000),
    days: 7,
  },
  {
    ref: 'LOT-DEMO-3',
    category: 'machinery',
    title: 'CAT 320D Hydraulic Excavator',
    attrs: { make: 'Caterpillar', model: '320D', year: 2016, condition: 'used' },
    open: LKR(8_000_000),
    inc: LKR(200_000),
    reserve: LKR(9_000_000),
    days: 4,
  },
  {
    ref: 'LOT-DEMO-4',
    category: 'property',
    title: 'Commercial Land · 42 perches, Kandy',
    attrs: { propertyType: 'commercial', extentPerches: 42, district: 'Kandy' },
    open: LKR(90_000_000),
    inc: LKR(1_000_000),
    reserve: LKR(96_000_000),
    days: 10,
  },
  {
    ref: 'LOT-DEMO-5',
    category: 'vehicles',
    title: '2020 Toyota Hiace GL',
    attrs: { make: 'Toyota', model: 'Hiace GL', year: 2020, fuel: 'diesel' },
    open: LKR(12_000_000),
    inc: LKR(150_000),
    reserve: LKR(13_000_000),
    days: 3,
  },
  {
    ref: 'LOT-DEMO-6',
    category: 'general',
    title: 'Corporate Office Furniture Lot',
    attrs: { description: 'Bulk clearance — desks, chairs, cabinets' },
    open: LKR(200_000),
    inc: LKR(10_000),
    reserve: null,
    days: 6,
  },
];

async function main(): Promise<void> {
  const prisma = getPrisma();

  const existing = await prisma.listing.findUnique({ where: { publicRef: 'LOT-DEMO-1' } });
  if (existing) {
    console.log('Demo data already present — skipping.');
    return;
  }

  const sellerId = newId();
  await prisma.customer.create({
    data: {
      id: sellerId,
      email: 'demo-seller@singha.lk',
      legalName: 'Singha Demo Consignments',
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

  console.log(`Seeded ${LOTS.length} demo lots (open auctions).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
