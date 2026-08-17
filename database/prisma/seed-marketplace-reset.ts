/**
 * SINGHA — Realistic Synthetic Marketplace reset / teardown.
 *
 * Idempotently removes every record created by `seed-marketplace.ts`, in FK-safe order
 * (children before parents), matched by STABLE keys only:
 *   - listings with publicRef starting 'SMKT-' (+ their assets, auctions, media)
 *   - customers with email ending '@mkt.singha.local'
 *   - any offer / sealed-tender / EOI / watch / discovery / event-lot rows a test created
 *     AGAINST those SIM listings or BY those SIM customers.
 *
 * Append-only safety (rule 5): the bid ledger has a DB trigger that REJECTS DELETE, so this
 * never touches `bid`. The browsable SIM dataset is seeded bid-free; auction STRESS bids live in
 * ISOLATED test auctions (a different prefix) precisely so immutable history is never entangled
 * here. If a SIM auction unexpectedly has bids, it is SKIPPED (left in place) rather than deleted.
 *
 * PRESERVED: EVO-* and LOT-DEMO data, the shared LK market/operator/lk-colombo node, and the
 * generic city Location rows (reused, never SIM-specific).
 */
import { disconnectPrisma, getPrisma } from '../src/client';

async function main(): Promise<void> {
  const prisma = getPrisma();
  const del: Record<string, number> = {};

  const simCustomers = await prisma.customer.findMany({
    where: { email: { endsWith: '@mkt.singha.local' } },
    select: { id: true },
  });
  const simCustomerIds = simCustomers.map((c) => c.id);

  const simListings = await prisma.listing.findMany({
    where: { publicRef: { startsWith: 'SMKT-' } },
    select: { id: true, assetId: true },
  });
  const simListingIds = simListings.map((l) => l.id);
  const simAssetIds = simListings.map((l) => l.assetId);

  const simAuctions = await prisma.auction.findMany({
    where: { listingId: { in: simListingIds } },
    select: { id: true },
  });
  const simAuctionIds = simAuctions.map((a) => a.id);

  // 1. Offers (+ immutable revisions + append-only events) any test created on SIM listings.
  const offers = await prisma.offer.findMany({
    where: { OR: [{ listingId: { in: simListingIds } }, { customerId: { in: simCustomerIds } }] },
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

  // 2. Sealed tenders / EOIs / watches / discovery / event-lots on SIM listings.
  del.tenderBids = (
    await prisma.tenderBid.deleteMany({
      where: { OR: [{ listingId: { in: simListingIds } }, { customerId: { in: simCustomerIds } }] },
    })
  ).count;
  del.eois = (
    await prisma.eoi.deleteMany({
      where: { OR: [{ listingId: { in: simListingIds } }, { customerId: { in: simCustomerIds } }] },
    })
  ).count;
  del.watches = (
    await prisma.watch.deleteMany({
      where: { OR: [{ listingId: { in: simListingIds } }, { customerId: { in: simCustomerIds } }] },
    })
  ).count;
  del.discoveryEvents = (
    await prisma.discoveryEvent.deleteMany({ where: { listingId: { in: simListingIds } } })
  ).count;
  del.eventLots = (
    await prisma.auctionEventLot.deleteMany({ where: { listingId: { in: simListingIds } } })
  ).count;
  del.bidderMaxes = (
    await prisma.bidderMax.deleteMany({
      where: { OR: [{ auctionId: { in: simAuctionIds } }, { bidderId: { in: simCustomerIds } }] },
    })
  ).count;

  // 3. Commerce artefacts (none expected on the non-binding dataset; deleteMany is safe).
  del.sales = (await prisma.sale.deleteMany({ where: { listingId: { in: simListingIds } } })).count;

  // 4. Media (derivatives before originals).
  const media = await prisma.mediaObject.findMany({
    where: { assetId: { in: simAssetIds } },
    select: { id: true },
  });
  const mediaIds = media.map((m) => m.id);
  del.mediaDerivatives = (
    await prisma.mediaDerivative.deleteMany({ where: { sourceMediaId: { in: mediaIds } } })
  ).count;
  del.media = (await prisma.mediaObject.deleteMany({ where: { id: { in: mediaIds } } })).count;

  // 5. Auctions — but NEVER an auction that has bids (append-only ledger; leave it in place).
  let deletedAuctions = 0;
  let skippedAuctions = 0;
  for (const id of simAuctionIds) {
    const bidCount = await prisma.bid.count({ where: { auctionId: id } });
    if (bidCount > 0) {
      skippedAuctions += 1;
      continue;
    }
    await prisma.auction.delete({ where: { id } });
    deletedAuctions += 1;
  }
  del.auctions = deletedAuctions;
  if (skippedAuctions > 0) {
    console.warn(
      `  ⚠ skipped ${skippedAuctions} SIM auction(s) that carry immutable bids (left in place).`,
    );
  }

  // 6. Listings — skip any whose auction was skipped (still referenced).
  const skippedListingIds = new Set<string>();
  if (skippedAuctions > 0) {
    const stillThere = await prisma.auction.findMany({
      where: { id: { in: simAuctionIds } },
      select: { listingId: true },
    });
    for (const a of stillThere) skippedListingIds.add(a.listingId);
  }
  const deletableListingIds = simListingIds.filter((id) => !skippedListingIds.has(id));
  del.listings = (
    await prisma.listing.deleteMany({ where: { id: { in: deletableListingIds } } })
  ).count;

  // 7. Assets (SIM assets + anything owned by a SIM customer), then the SIM customers.
  const deletableAssetIds = simListings
    .filter((l) => !skippedListingIds.has(l.id))
    .map((l) => l.assetId);
  del.assets = (
    await prisma.asset.deleteMany({
      where: {
        AND: [
          { OR: [{ id: { in: deletableAssetIds } }, { ownerCustomerId: { in: simCustomerIds } }] },
          { listings: { none: {} } }, // never orphan a still-present listing
        ],
      },
    })
  ).count;
  const anyAssetsLeft = await prisma.asset.count({
    where: { ownerCustomerId: { in: simCustomerIds } },
  });
  if (anyAssetsLeft === 0) {
    del.customers = (
      await prisma.customer.deleteMany({ where: { id: { in: simCustomerIds } } })
    ).count;
  } else {
    del.customers = 0;
    console.warn(
      `  ⚠ kept ${simCustomerIds.length} SIM customer(s): ${anyAssetsLeft} of their assets remain (bid-bearing auctions).`,
    );
  }

  console.log('Marketplace SIM reset complete:', JSON.stringify(del));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
