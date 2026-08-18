import { Injectable, NotFoundException } from '@nestjs/common';
import { CATEGORY_FIELD_SCHEMAS, isCategoryKey, type QualityCheckInput } from '@singha/contracts';
import {
  assessListingQuality,
  type ListingQualityAssessment,
  type ListingQualityInput,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';

/** Commodity categories whose lots are divisible → a quantity + unit is expected. */
const DIVISIBLE_CATEGORIES = new Set(['bulk', 'scrap']);

/**
 * §6/§7 — the pre-publish quality-control assessor. Deterministic + advisory (pack rule 3/11):
 * it scores a listing's readiness and lists fixable issues; it never mutates the listing and never
 * blocks a human decision. The set of REQUIRED category attributes and whether a category is a
 * divisible commodity are always derived from the authoritative category schema here (never trusted
 * from the client), then merged into the pure `assessListingQuality` domain function.
 */
@Injectable()
export class ListingQualityService {
  constructor(private readonly prisma: PrismaService) {}

  private requiredKeysFor(category: string): string[] {
    if (!isCategoryKey(category)) return [];
    return CATEGORY_FIELD_SCHEMAS[category].fields.filter((f) => f.required).map((f) => f.key);
  }

  /** Stateless assessment from seller-supplied draft facts (pre-submit preview). */
  fromInput(input: QualityCheckInput): ListingQualityAssessment {
    const domainInput: ListingQualityInput = {
      saleMethod: input.saleMethod,
      category: input.category,
      title: input.title,
      shortDescription: input.shortDescription,
      fullDescription: input.fullDescription,
      requiredAttributeKeys: this.requiredKeysFor(input.category),
      presentAttributeKeys: input.presentAttributeKeys,
      photoCount: input.photoCount,
      hasCover: input.hasCover,
      videoAvailable: input.videoAvailable,
      guidePriceMinor: input.guidePriceMinor ?? null,
      buyNowPriceMinor: input.buyNowPriceMinor ?? null,
      quantityAvailable: input.quantityAvailable ?? null,
      quantityUnitCode: input.quantityUnitCode ?? null,
      isDivisible: DIVISIBLE_CATEGORIES.has(input.category),
      hasLocation: input.hasLocation,
    };
    return assessListingQuality(domainInput);
  }

  /** Assessment recomputed from the persisted listing (staff review + post-submit record). */
  async forListing(listingId: string): Promise<ListingQualityAssessment> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { asset: { include: { media: true } } },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const attrs = (listing.asset.attributes ?? {}) as Record<string, unknown>;
    const presentAttributeKeys = Object.entries(attrs)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k]) => k);
    const images = (listing.asset.media ?? []).filter((m) => m.kind === 'image');
    const category = listing.asset.category;

    const domainInput: ListingQualityInput = {
      saleMethod: listing.saleMethod,
      category,
      title: listing.title,
      shortDescription: listing.shortDescription,
      fullDescription: listing.fullDescription,
      requiredAttributeKeys: this.requiredKeysFor(category),
      presentAttributeKeys,
      photoCount: images.length,
      hasCover: images.some((m) => m.isCover),
      videoAvailable: (listing.asset.media ?? []).some((m) => m.kind === 'video'),
      guidePriceMinor: listing.guidePriceMinor == null ? null : Number(listing.guidePriceMinor),
      buyNowPriceMinor: listing.buyNowPriceMinor == null ? null : Number(listing.buyNowPriceMinor),
      quantityAvailable:
        listing.quantityAvailable == null ? null : Number(listing.quantityAvailable),
      quantityUnitCode: listing.quantityUnitCode,
      isDivisible: DIVISIBLE_CATEGORIES.has(category),
      hasLocation: Boolean(listing.locationCity || listing.locationRegion),
    };
    return assessListingQuality(domainInput);
  }
}
