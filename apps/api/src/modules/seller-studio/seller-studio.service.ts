import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type SellerAuctionPreferenceInput,
  type SellerDraftUpsertInput,
  newId,
} from '@singha/contracts';
import type { Prisma, SellerAuctionPreference, SellerListingDraft } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';

/**
 * Seller Studio persistence (directive §25 / §7). Server-authoritative, owner-scoped:
 * - resumable Listing Studio drafts that follow the seller across devices, with
 *   optimistic-concurrency conflict handling; and
 * - a seller's requested auction settings for a listing, persisted structurally as a
 *   staff-approvable request — never the authoritative auction itself (rule 2).
 */
@Injectable()
export class SellerStudioService {
  constructor(private readonly prisma: PrismaService) {}

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated seller required');
    return principal.customerId;
  }

  private toDraft(d: SellerListingDraft) {
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      schemaVersion: d.schemaVersion,
      version: d.version,
      payload: d.payload,
      mediaState: d.mediaState,
      aiProvenance: d.aiProvenance,
      updatedAt: d.updatedAt,
      createdAt: d.createdAt,
    };
  }

  async listDrafts(principal: Principal) {
    const ownerId = this.customer(principal);
    const rows = await this.prisma.sellerListingDraft.findMany({
      where: { ownerId, status: { not: 'archived' } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        schemaVersion: true,
        version: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    return { drafts: rows };
  }

  async getDraft(principal: Principal, id: string) {
    const ownerId = this.customer(principal);
    const d = await this.prisma.sellerListingDraft.findFirst({ where: { id, ownerId } });
    if (!d) throw new NotFoundException('Draft not found');
    return this.toDraft(d);
  }

  async createDraft(principal: Principal, input: SellerDraftUpsertInput) {
    const ownerId = this.customer(principal);
    const d = await this.prisma.sellerListingDraft.create({
      data: {
        id: newId(),
        ownerId,
        title: input.title ?? null,
        payload: input.payload as Prisma.InputJsonValue,
        mediaState: (input.mediaState ?? undefined) as Prisma.InputJsonValue | undefined,
        aiProvenance: (input.aiProvenance ?? undefined) as Prisma.InputJsonValue | undefined,
        schemaVersion: input.schemaVersion,
      },
    });
    return this.toDraft(d);
  }

  async saveDraft(principal: Principal, id: string, input: SellerDraftUpsertInput) {
    const ownerId = this.customer(principal);
    const existing = await this.prisma.sellerListingDraft.findFirst({ where: { id, ownerId } });
    if (!existing) throw new NotFoundException('Draft not found');
    if (existing.status === 'archived') throw new ConflictException('Draft is archived');
    // Optimistic concurrency: reject a save based on a stale version (another device saved first).
    if (input.expectedVersion != null && input.expectedVersion !== existing.version) {
      throw new ConflictException(
        `Draft version conflict: server is at v${existing.version}, you have v${input.expectedVersion}. Reload before saving.`,
      );
    }
    const d = await this.prisma.sellerListingDraft.update({
      where: { id },
      data: {
        title: input.title ?? existing.title,
        payload: input.payload as Prisma.InputJsonValue,
        mediaState: (input.mediaState ?? undefined) as Prisma.InputJsonValue | undefined,
        aiProvenance: (input.aiProvenance ?? undefined) as Prisma.InputJsonValue | undefined,
        schemaVersion: input.schemaVersion,
        version: { increment: 1 },
      },
    });
    return this.toDraft(d);
  }

  async archiveDraft(principal: Principal, id: string) {
    const ownerId = this.customer(principal);
    const existing = await this.prisma.sellerListingDraft.findFirst({ where: { id, ownerId } });
    if (!existing) throw new NotFoundException('Draft not found');
    await this.prisma.sellerListingDraft.update({ where: { id }, data: { status: 'archived' } });
    return { id, status: 'archived' as const };
  }

  private toPref(p: SellerAuctionPreference) {
    return {
      listingId: p.listingId,
      openingBidMinor: p.openingBidMinor != null ? Number(p.openingBidMinor) : null,
      reserveMinor: p.reserveMinor != null ? Number(p.reserveMinor) : null,
      incrementMinor: p.incrementMinor != null ? Number(p.incrementMinor) : null,
      currency: p.currency,
      preferredOpenAt: p.preferredOpenAt,
      preferredCloseAt: p.preferredCloseAt,
      notes: p.notes,
      status: p.status,
      updatedAt: p.updatedAt,
    };
  }

  private async ownListing(principal: Principal, listingId: string) {
    const ownerId = this.customer(principal);
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { asset: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.asset.ownerCustomerId !== ownerId) {
      throw new ForbiddenException('You can only set preferences on your own listing');
    }
    return { ownerId, listing };
  }

  async setAuctionPreference(
    principal: Principal,
    listingId: string,
    input: SellerAuctionPreferenceInput,
  ) {
    const { ownerId } = await this.ownListing(principal, listingId);
    const data = {
      openingBidMinor: input.openingBidMinor != null ? BigInt(input.openingBidMinor) : null,
      reserveMinor: input.reserveMinor != null ? BigInt(input.reserveMinor) : null,
      incrementMinor: input.incrementMinor != null ? BigInt(input.incrementMinor) : null,
      currency: input.currency ?? null,
      preferredOpenAt: input.preferredOpenAt ? new Date(input.preferredOpenAt) : null,
      preferredCloseAt: input.preferredCloseAt ? new Date(input.preferredCloseAt) : null,
      notes: input.notes ?? null,
      status: 'requested' as const,
    };
    const pref = await this.prisma.sellerAuctionPreference.upsert({
      where: { listingId },
      update: data,
      create: { id: newId(), listingId, ownerId, ...data },
    });
    return this.toPref(pref);
  }

  async getAuctionPreference(principal: Principal, listingId: string) {
    await this.ownListing(principal, listingId);
    const pref = await this.prisma.sellerAuctionPreference.findUnique({ where: { listingId } });
    return pref ? this.toPref(pref) : null;
  }
}
