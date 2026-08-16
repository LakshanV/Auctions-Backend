import { disconnectPrisma, getPrisma } from '../src/client';

/**
 * Singha Evolution PREVIEW — reset / teardown.
 *
 * Idempotently removes EVERY demo record created by `seed-evolution.ts` and
 * `seed-evolution-transactions.ts`, in FK-safe order (children before parents).
 * Safe to run whether or not the data exists (all deletes are `deleteMany`).
 *
 * Matched by stable keys only (never hardcoded ids):
 *   - customers with email ending '@demo.singha.lk'
 *     (evo-seller + evo-buyer-1/-2/-3 + evo-supplier-1/-2)
 *   - listings with publicRef starting 'EVO-' (+ their assets / auctions)
 *   - market 'LK', operator 'SINGHA-LK', node 'lk-colombo'
 *   - logistics_node codes LKCMB / LKCMB-AIR (a.k.a. CMBAIR) / LKHIP / AEJEA
 *   - logistics quote/booking/shipment chain marked provider 'SINGHA-DEMO'
 *   - all offers / revisions / events / procurement / supply / perishable /
 *     singha-id / watch / bid rows referencing the above.
 *
 * PRESERVED (belong to seed-demo.ts): demo-seller@singha.lk and LOT-DEMO-*
 * listings/assets/auctions. Only the offer/bid/watch rows evo-seller made
 * AGAINST LOT-DEMO listings are removed (the rows, never the LOT-DEMO listings).
 */

async function main(): Promise<void> {
  const prisma = getPrisma();
  const del: Record<string, number> = {};

  // --- Resolve the stable-key id sets first ----------------------------------
  const evoCustomers = await prisma.customer.findMany({
    where: { email: { endsWith: '@demo.singha.lk' } },
    select: { id: true },
  });
  const evoCustomerIds = evoCustomers.map((c) => c.id);

  const evoListings = await prisma.listing.findMany({
    where: { publicRef: { startsWith: 'EVO-' } },
    select: { id: true, assetId: true },
  });
  const evoListingIds = evoListings.map((l) => l.id);
  const evoAssetIds = evoListings.map((l) => l.assetId);

  const evoAuctions = await prisma.auction.findMany({
    where: { listingId: { in: evoListingIds } },
    select: { id: true },
  });
  const evoAuctionIds = evoAuctions.map((a) => a.id);

  // ---------------------------------------------------------------------------
  // 1. Offers (+ immutable revisions + append-only events). Includes evo-seller's
  //    offers on LOT-DEMO (matched by customerId) and sealed offers on EVO
  //    listings (matched by listingId) — but never the LOT-DEMO listings.
  // ---------------------------------------------------------------------------
  const offers = await prisma.offer.findMany({
    where: {
      OR: [{ customerId: { in: evoCustomerIds } }, { listingId: { in: evoListingIds } }],
    },
    select: { id: true },
  });
  const offerIds = offers.map((o) => o.id);
  del.offerEvents = (
    await prisma.offerEvent.deleteMany({ where: { offerId: { in: offerIds } } })
  ).count;
  del.offerRevisions = (
    await prisma.offerRevision.deleteMany({ where: { offerId: { in: offerIds } } })
  ).count;
  del.offers = (await prisma.offer.deleteMany({ where: { id: { in: offerIds } } })).count;

  // ---------------------------------------------------------------------------
  // 2. Logistics chain (event -> shipment -> booking -> quote). Rooted on the
  //    demo provider marker + evo bookings.
  // ---------------------------------------------------------------------------
  const quotes = await prisma.logisticsQuote.findMany({
    where: { provider: 'SINGHA-DEMO' },
    select: { id: true },
  });
  const quoteIds = quotes.map((q) => q.id);
  const bookings = await prisma.logisticsBooking.findMany({
    where: {
      OR: [
        { quoteId: { in: quoteIds } },
        { bookedByCustomerId: { in: evoCustomerIds } },
        { provider: 'SINGHA-DEMO' },
      ],
    },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  const shipments = await prisma.logisticsShipment.findMany({
    where: { bookingId: { in: bookingIds } },
    select: { id: true },
  });
  const shipmentIds = shipments.map((s) => s.id);
  del.shipmentEvents = (
    await prisma.logisticsShipmentEvent.deleteMany({ where: { shipmentId: { in: shipmentIds } } })
  ).count;
  del.shipments = (
    await prisma.logisticsShipment.deleteMany({ where: { id: { in: shipmentIds } } })
  ).count;
  del.bookings = (
    await prisma.logisticsBooking.deleteMany({ where: { id: { in: bookingIds } } })
  ).count;
  del.quotes = (await prisma.logisticsQuote.deleteMany({ where: { id: { in: quoteIds } } })).count;

  // ---------------------------------------------------------------------------
  // 3. Procurement (proposal -> request).
  // ---------------------------------------------------------------------------
  const requests = await prisma.procurementRequest.findMany({
    where: { buyerCustomerId: { in: evoCustomerIds } },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);
  del.procurementProposals = (
    await prisma.procurementProposal.deleteMany({
      where: {
        OR: [{ requestId: { in: requestIds } }, { supplierCustomerId: { in: evoCustomerIds } }],
      },
    })
  ).count;
  del.procurementRequests = (
    await prisma.procurementRequest.deleteMany({ where: { id: { in: requestIds } } })
  ).count;

  // ---------------------------------------------------------------------------
  // 4. Supply programmes (+ perishable metadata attached to them or EVO listings).
  // ---------------------------------------------------------------------------
  const programmes = await prisma.supplyProgramme.findMany({
    where: { supplierCustomerId: { in: evoCustomerIds } },
    select: { id: true },
  });
  const programmeIds = programmes.map((p) => p.id);
  del.perishable = (
    await prisma.perishableMetadata.deleteMany({
      where: {
        OR: [
          { subjectType: 'supply_programme', subjectId: { in: programmeIds } },
          { subjectType: 'listing', subjectId: { in: evoListingIds } },
        ],
      },
    })
  ).count;
  del.supplyProgrammes = (
    await prisma.supplyProgramme.deleteMany({ where: { id: { in: programmeIds } } })
  ).count;

  // ---------------------------------------------------------------------------
  // 5. Singha ID (capabilities + profiles).
  // ---------------------------------------------------------------------------
  del.capabilities = (
    await prisma.customerCapability.deleteMany({
      where: {
        OR: [
          { customerId: { in: evoCustomerIds } },
          { decidedByCustomerId: { in: evoCustomerIds } },
        ],
      },
    })
  ).count;
  del.profiles = (
    await prisma.customerProfile.deleteMany({ where: { customerId: { in: evoCustomerIds } } })
  ).count;

  // ---------------------------------------------------------------------------
  // 6. Watchlist / tender bids / auction bids (children of listing / auction).
  //    evo-seller's rows against LOT-DEMO are matched by customer/bidder id.
  // ---------------------------------------------------------------------------
  del.watches = (
    await prisma.watch.deleteMany({
      where: {
        OR: [{ customerId: { in: evoCustomerIds } }, { listingId: { in: evoListingIds } }],
      },
    })
  ).count;
  del.tenderBids = (
    await prisma.tenderBid.deleteMany({
      where: {
        OR: [{ customerId: { in: evoCustomerIds } }, { listingId: { in: evoListingIds } }],
      },
    })
  ).count;
  del.bidderMaxes = (
    await prisma.bidderMax.deleteMany({
      where: {
        OR: [{ bidderId: { in: evoCustomerIds } }, { auctionId: { in: evoAuctionIds } }],
      },
    })
  ).count;
  // Bid ledger is append-only (DB trigger rejects DELETE — rule #5), so the seed
  // no longer creates demo bids and there is nothing to remove here. If a legacy
  // run created bids, they are immutable by design and must be cleared out-of-band.
  del.bids = 0;

  // ---------------------------------------------------------------------------
  // 7. EVO auctions -> listings -> assets (LOT-DEMO left untouched).
  // ---------------------------------------------------------------------------
  del.auctions = (await prisma.auction.deleteMany({ where: { id: { in: evoAuctionIds } } })).count;
  del.listings = (await prisma.listing.deleteMany({ where: { id: { in: evoListingIds } } })).count;
  del.assets = (
    await prisma.asset.deleteMany({
      where: { OR: [{ id: { in: evoAssetIds } }, { ownerCustomerId: { in: evoCustomerIds } }] },
    })
  ).count;

  // ---------------------------------------------------------------------------
  // 8. Market topology (link tables first) + logistics reference nodes.
  // ---------------------------------------------------------------------------
  const node = await prisma.marketNode.findUnique({
    where: { code: 'lk-colombo' },
    select: { id: true },
  });
  const operator = await prisma.operator.findUnique({
    where: { code: 'SINGHA-LK' },
    select: { id: true },
  });
  const market = await prisma.market.findUnique({ where: { code: 'LK' }, select: { id: true } });
  const nodeIds = node ? [node.id] : [];
  const operatorIds = operator ? [operator.id] : [];
  const marketIds = market ? [market.id] : [];

  del.marketNodeOperators = (
    await prisma.marketNodeOperator.deleteMany({
      where: { OR: [{ nodeId: { in: nodeIds } }, { operatorId: { in: operatorIds } }] },
    })
  ).count;
  del.operatorMarkets = (
    await prisma.operatorMarket.deleteMany({
      where: { OR: [{ operatorId: { in: operatorIds } }, { marketId: { in: marketIds } }] },
    })
  ).count;
  del.marketNodes = (await prisma.marketNode.deleteMany({ where: { id: { in: nodeIds } } })).count;
  del.operators = (await prisma.operator.deleteMany({ where: { id: { in: operatorIds } } })).count;
  del.markets = (await prisma.market.deleteMany({ where: { id: { in: marketIds } } })).count;
  del.logisticsNodes = (
    await prisma.logisticsNode.deleteMany({
      where: { code: { in: ['LKCMB', 'LKCMB-AIR', 'CMBAIR', 'LKHIP', 'AEJEA'] } },
    })
  ).count;

  // ---------------------------------------------------------------------------
  // 9. Demo customers LAST (assets already gone). demo-seller@singha.lk is NOT
  //    matched by the '@demo.singha.lk' suffix and is preserved.
  // ---------------------------------------------------------------------------
  del.customers = (
    await prisma.customer.deleteMany({ where: { email: { endsWith: '@demo.singha.lk' } } })
  ).count;

  const total = Object.values(del).reduce((a, b) => a + b, 0);
  console.log(
    'Reset Evolution preview data (idempotent; LOT-DEMO-* + demo-seller preserved):\n' +
      Object.entries(del)
        .map(([k, v]) => `  ${k.padEnd(22)} ${v}`)
        .join('\n') +
      `\n  ${'TOTAL rows deleted'.padEnd(22)} ${total}`,
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
