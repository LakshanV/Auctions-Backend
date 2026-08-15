import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type OriginateInput,
  type SeoCanonicalInput,
  type SeoListingInput,
  newId,
} from '@singha/contracts';
import {
  type NodeConfig,
  assessOrigination,
  canonicalUrl,
  hreflangAlternates,
  listingJsonLd,
  resolveNodeCapabilities,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { type Principal } from '../../shared/auth/principal';

/**
 * Satellite Market Node + SEO service (Evolution E13, Addendum A). A node is a presentation /
 * origination / routing surface over the **one central** authoritative domain. Discovery routes into
 * central inventory; Local Commerce origination is gated (mode/capability/verification) and, even
 * when allowed, the canonical record lives centrally with origin-node attribution — never a
 * per-country ledger. Flag-gated by `satelliteNodes`.
 */
@Injectable()
export class NodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.satelliteNodes) {
      throw new NotFoundException('Satellite Market Nodes are not enabled');
    }
  }

  private async loadNode(code: string) {
    const row = await this.prisma.marketNode.findUnique({ where: { code } });
    if (!row) throw new NotFoundException('Market node not found');
    return row;
  }

  private toConfig(row: {
    code: string;
    mode: string;
    canOriginateListings: boolean;
    canTakeOffers: boolean;
    canRunAuctions: boolean;
    canAcceptPayments: boolean;
    verification: string;
  }): NodeConfig {
    return {
      code: row.code,
      mode: row.mode as NodeConfig['mode'],
      canOriginateListings: row.canOriginateListings,
      canTakeOffers: row.canTakeOffers,
      canRunAuctions: row.canRunAuctions,
      canAcceptPayments: row.canAcceptPayments,
      verification: row.verification as NodeConfig['verification'],
    };
  }

  /** Resolve a node's presentation (mode / presets / capabilities). Public marketing surface. */
  async getNode(code: string) {
    this.requireFeature();
    const row = await this.loadNode(code);
    return {
      code: row.code,
      name: row.name,
      presets: {
        currency: row.defaultCurrency,
        language: row.defaultLanguage,
        country: row.defaultLocationCountry,
        marketId: row.primaryMarketId,
      },
      ...resolveNodeCapabilities(this.toConfig(row)),
    };
  }

  /**
   * Discovery routing: the node's presets + central inventory attributed to it. The listings are read
   * from the ONE central `Listing` table (there is no node-local store) — proving a node-originated
   * record is the same canonical record centrally.
   */
  async discovery(code: string) {
    this.requireFeature();
    const row = await this.loadNode(code);
    const listings = await this.prisma.listing.findMany({
      where: { originNodeId: row.id },
      select: { id: true, publicRef: true, title: true },
      take: 50,
    });
    return {
      nodeCode: row.code,
      mode: row.mode,
      presets: {
        currency: row.defaultCurrency,
        language: row.defaultLanguage,
        country: row.defaultLocationCountry,
      },
      source: 'central' as const,
      count: listings.length,
      listings,
    };
  }

  /** Local Commerce origination gating — persists an attribution/audit snapshot (never a ledger). */
  async originate(principal: Principal, code: string, input: OriginateInput) {
    this.requireFeature();
    const row = await this.loadNode(code);
    const decision = assessOrigination(this.toConfig(row), input.capability);
    await this.prisma.nodeOrigination.create({
      data: {
        id: newId(),
        nodeCode: row.code,
        capability: input.capability,
        outcome: decision.outcome,
        subjectRef: input.subjectRef,
        requestedBy: principal.customerId ?? null,
      },
    });
    return {
      nodeCode: row.code,
      originNode: row.code,
      capability: input.capability,
      ...decision,
    };
  }

  /** Deterministic canonical + hreflang (display currency never forks a URL). Public. */
  async seoCanonical(input: SeoCanonicalInput) {
    this.requireFeature();
    return {
      canonical: canonicalUrl(input.baseUrl, input.path, input.params ?? {}),
      alternates: input.locales ? hreflangAlternates(input.baseUrl, input.path, input.locales) : [],
    };
  }

  /** Deterministic schema.org Product/Offer JSON-LD for a listing landing page. Public. */
  async seoListing(input: SeoListingInput) {
    this.requireFeature();
    const url = canonicalUrl(input.baseUrl, input.path);
    return {
      url,
      jsonLd: listingJsonLd({
        publicRef: input.publicRef,
        title: input.title,
        category: input.category ?? null,
        priceMinor: input.priceMinor ?? null,
        currency: input.currency ?? null,
        url,
        available: input.available,
      }),
    };
  }
}
