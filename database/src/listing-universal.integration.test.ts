import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { newId } from '@singha/contracts';

/**
 * Evolution E3 universal-listing integration (real Postgres via `pnpm test:db`; skipped when no
 * DATABASE_URL). Verifies the additive `Listing` columns persist: the configurable sale-method
 * code, Decimal quantity, pricing basis, the structured-location role FKs, and operator /
 * origin-node attribution (Addendum A — attribution on the one central record).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite('Evolution E3 universal listing (integration)', () => {
  const prisma = new PrismaClient();
  const id = {
    asset: newId(),
    listing: newId(),
    location: newId(),
    market: newId(),
    operator: newId(),
    node: newId(),
  };

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { id: id.listing } });
    await prisma.asset.deleteMany({ where: { id: id.asset } });
    await prisma.marketNode.deleteMany({ where: { id: id.node } });
    await prisma.operator.deleteMany({ where: { id: id.operator } });
    await prisma.market.deleteMany({ where: { id: id.market } });
    await prisma.location.deleteMany({ where: { id: id.location } });
    await prisma.$disconnect();
  });

  it('persists quantity/unit, structured-location roles and operator/node attribution', async () => {
    await prisma.location.create({
      data: { id: id.location, countryCode: 'LK', city: 'Colombo' },
    });
    await prisma.market.create({
      data: {
        id: id.market,
        code: `e3-${id.market}`,
        name: 'M',
        countryCode: 'LK',
        defaultCurrency: 'LKR',
      },
    });
    await prisma.operator.create({
      data: { id: id.operator, code: `e3-op-${id.operator}`, publicName: 'Op' },
    });
    await prisma.marketNode.create({
      data: { id: id.node, code: `e3-node-${id.node}`, name: 'N', primaryMarketId: id.market },
    });
    await prisma.asset.create({ data: { id: id.asset, category: 'vehicles' } });

    const listing = await prisma.listing.create({
      data: {
        id: id.listing,
        assetId: id.asset,
        saleMethod: 'BUY_NOW',
        saleMethodCode: 'BUY_NOW',
        publicRef: `e3-${id.listing}`,
        quantityAvailable: '25.5',
        minOrderQuantity: '5',
        quantityUnitCode: 'tonne',
        pricingBasis: 'per_unit',
        unitPriceMinor: 39000n,
        assetLocationId: id.location,
        pickupLocationId: id.location,
        operatorId: id.operator,
        originNodeId: id.node,
      },
    });
    expect(listing.saleMethodCode).toBe('BUY_NOW');
    expect(Number(listing.quantityAvailable)).toBe(25.5); // Decimal, not float
    expect(listing.pricingBasis).toBe('per_unit');
    expect(listing.unitPriceMinor).toBe(39000n);

    const readBack = await prisma.listing.findUnique({
      where: { id: id.listing },
      include: { assetLocation: true, pickupLocation: true, operator: true, originNode: true },
    });
    expect(readBack?.assetLocation?.city).toBe('Colombo');
    expect(readBack?.pickupLocation?.id).toBe(id.location); // roles resolve independently
    expect(readBack?.operator?.code).toContain('e3-op-');
    expect(readBack?.originNode?.mode).toBe('DISCOVERY');
  });
});
