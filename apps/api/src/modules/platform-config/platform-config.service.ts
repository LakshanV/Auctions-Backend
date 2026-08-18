import { Injectable } from '@nestjs/common';
import {
  CATEGORY_FIELD_SCHEMAS,
  CATEGORY_SUBCATEGORIES,
  UNIT_DEFINITIONS,
} from '@singha/contracts';
import { activeSaleMethods } from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read model for the Evolution config foundations (E2). Static taxonomy (sale methods,
 * units) is served from the canonical `@singha/contracts` constants — no seed dependency,
 * always correct; when admin editing lands (E11) these switch to a DB read. Instance config
 * (markets/operators/nodes) comes from the ONE central authoritative datastore (Addendum A —
 * never a per-country ledger). Operator legal identity is owner-gated (D7) and never returned
 * on the public read.
 */
@Injectable()
export class PlatformConfigService {
  constructor(private readonly prisma: PrismaService) {}

  saleMethods() {
    return activeSaleMethods();
  }

  /**
   * Customer-safe category field descriptors (directive §2/§3) — the presentation contract the
   * seller Listing Studio renders as a dynamic form. Authoritative validation still happens
   * server-side against the versioned Zod `CATEGORY_SCHEMAS`. Non-sensitive reference data.
   */
  categorySchemas() {
    // §3 — fold each category's subcategory taxonomy into the served descriptor so the seller UI
    // renders a subcategory selector (and the catalogue/search consume the same source of truth).
    return Object.values(CATEGORY_FIELD_SCHEMAS).map((schema) => ({
      ...schema,
      subcategories: CATEGORY_SUBCATEGORIES[schema.key] ?? [],
    }));
  }

  units() {
    return UNIT_DEFINITIONS.filter((u) => u.active).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  markets() {
    return this.prisma.market.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        code: true,
        name: true,
        countryCode: true,
        defaultCurrency: true,
        defaultLanguage: true,
        defaultTimezone: true,
      },
    });
  }

  operators() {
    // Public-safe projection: legalName is owner-gated (D7) and deliberately omitted.
    return this.prisma.operator.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { code: true, publicName: true, type: true, verification: true, disclosure: true },
    });
  }

  marketNodes() {
    return this.prisma.marketNode.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: {
        code: true,
        name: true,
        mode: true,
        defaultCurrency: true,
        defaultLanguage: true,
        defaultLocationCountry: true,
        canOriginateListings: true,
        canTakeOffers: true,
        canRunAuctions: true,
        canAcceptPayments: true,
        verification: true,
      },
    });
  }
}
