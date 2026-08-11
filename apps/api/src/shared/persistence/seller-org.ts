import { type Prisma } from '@singha/database';

/**
 * The durable seller-organization attribution to copy onto a Sale at award time
 * (pack 01 doc 09). Read from the listing's asset — the attribution captured at
 * consignment — so the Sale's financial record stays attributed to the selling
 * organization even if the consigning employee later leaves it. Returns
 * undefined when the asset has no organization attribution.
 */
export async function sellerOrgForListing(
  tx: Prisma.TransactionClient,
  listingId: string,
): Promise<string | undefined> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: { asset: { select: { sellerOrganizationId: true } } },
  });
  return listing?.asset.sellerOrganizationId ?? undefined;
}
