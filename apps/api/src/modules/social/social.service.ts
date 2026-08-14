import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateCampaignInput,
  type CreatePublicationInput,
  DomainEventName,
  newId,
} from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { SOCIAL_PROVIDER, type SocialPublisherProvider } from './social.provider';

/**
 * Singha Social Publisher (docs/11). Publication records are their own data;
 * publishing goes through the adapter (mock until Meta access) and NEVER mutates
 * auction/listing facts. Captions can be AI-assisted (derived) but a human owns
 * the publish action.
 */
@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    @Inject(SOCIAL_PROVIDER) private readonly publisher: SocialPublisherProvider,
  ) {}

  async createCampaign(principal: Principal, input: CreateCampaignInput) {
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const campaign = await ctx.tx.socialCampaign.create({
        data: { id, name: input.name, type: input.type },
      });
      ctx.audit({ action: 'SOCIAL_CAMPAIGN_CREATED', targetType: 'SocialCampaign', targetId: id });
      return { id: campaign.id, name: campaign.name, type: campaign.type };
    });
  }

  /** Draft a publication for a listing; a missing caption is AI-assisted (derived). */
  async createPublication(principal: Principal, input: CreatePublicationInput) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: input.listingId },
      include: { asset: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (input.campaignId) {
      const campaign = await this.prisma.socialCampaign.findUnique({
        where: { id: input.campaignId },
      });
      if (!campaign) throw new NotFoundException('Campaign not found');
    }

    const caption = input.caption ?? this.autoCaption(listing.title, listing.asset.category);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const pub = await ctx.tx.socialPublication.create({
        data: {
          id,
          listingId: input.listingId,
          campaignId: input.campaignId,
          platform: input.platform,
          status: input.scheduledAt ? 'scheduled' : 'draft',
          caption,
          creativeRef: input.creativeRef,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        },
      });
      ctx.emit({
        name: DomainEventName.SocialPublicationRequested,
        aggregateType: 'SocialPublication',
        aggregateId: id,
        payload: { publicationId: id, listingId: input.listingId, platform: input.platform },
      });
      ctx.audit({
        action: 'SOCIAL_PUBLICATION_DRAFTED',
        targetType: 'SocialPublication',
        targetId: id,
      });
      return this.pubView(pub);
    });
  }

  async publish(principal: Principal, id: string) {
    const pub = await this.prisma.socialPublication.findUnique({ where: { id } });
    if (!pub) throw new NotFoundException('Publication not found');
    if (pub.status === 'published') throw new ConflictException('Already published');
    // A human approval must gate every public post (docs/11) — nothing goes out
    // unless it has been through submitForApproval() -> approve().
    if (pub.status !== 'approved') {
      throw new ConflictException('Publication must be approved before it can be published');
    }

    const result = await this.publisher.publish(
      pub.platform,
      pub.caption,
      pub.creativeRef ?? undefined,
    );
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.socialPublication.update({
        where: { id },
        data: {
          status: result.published ? 'published' : 'failed',
          externalPostId: result.externalPostId,
          publishedAt: new Date(),
        },
      });
      ctx.emit({
        name: DomainEventName.SocialPublicationPublished,
        aggregateType: 'SocialPublication',
        aggregateId: id,
        payload: {
          publicationId: id,
          platform: pub.platform,
          externalPostId: result.externalPostId,
        },
      });
      ctx.audit({
        action: 'SOCIAL_PUBLICATION_PUBLISHED',
        targetType: 'SocialPublication',
        targetId: id,
      });
      return { ...this.pubView(updated), via: this.publisher.name };
    });
  }

  /** Publish every APPROVED publication in a group campaign (docs/11 gate). */
  async publishCampaign(principal: Principal, campaignId: string) {
    const campaign = await this.prisma.socialCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const pending = await this.prisma.socialPublication.findMany({
      where: { campaignId, status: 'approved' },
    });
    const results = [];
    for (const p of pending) results.push(await this.publish(principal, p.id));
    return { campaignId, published: results.length, publications: results };
  }

  /**
   * Draft (or pre-scheduled) -> pending_approval: hand the post to a reviewer.
   * Accepts 'scheduled' too — a scheduledAt was chosen at draft time but that is
   * a timing preference, not a substitute for the approval gate publish() now
   * enforces, so a scheduled post must still be able to reach 'approved'.
   */
  async submitForApproval(principal: Principal, id: string) {
    const pub = await this.prisma.socialPublication.findUnique({ where: { id } });
    if (!pub) throw new NotFoundException('Publication not found');
    if (pub.status !== 'draft' && pub.status !== 'scheduled') {
      throw new ConflictException('Only a draft or scheduled publication can be submitted');
    }

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.socialPublication.update({
        where: { id },
        data: { status: 'pending_approval' },
      });
      ctx.audit({
        action: 'SOCIAL_PUBLICATION_SUBMITTED',
        targetType: 'SocialPublication',
        targetId: id,
        before: { status: pub.status },
        after: { status: 'pending_approval' },
      });
      return this.pubView(updated);
    });
  }

  /** A human (`social:approve`) approves a pending post — publish()'s required gate. */
  async approve(principal: Principal, id: string) {
    const pub = await this.prisma.socialPublication.findUnique({ where: { id } });
    if (!pub) throw new NotFoundException('Publication not found');
    if (pub.status !== 'pending_approval') {
      throw new ConflictException('Only a publication pending approval can be approved');
    }

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.socialPublication.update({
        where: { id },
        data: { status: 'approved', approvedById: actor.id ?? undefined, approvedAt: new Date() },
      });
      ctx.audit({
        action: 'SOCIAL_PUBLICATION_APPROVED',
        targetType: 'SocialPublication',
        targetId: id,
        before: { status: pub.status },
        after: { status: 'approved' },
      });
      return this.pubView(updated);
    });
  }

  /** A human (`social:approve`) sends a pending post back to draft — no public effect. */
  async reject(principal: Principal, id: string) {
    const pub = await this.prisma.socialPublication.findUnique({ where: { id } });
    if (!pub) throw new NotFoundException('Publication not found');
    if (pub.status !== 'pending_approval') {
      throw new ConflictException('Only a publication pending approval can be rejected');
    }

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.socialPublication.update({
        where: { id },
        data: { status: 'draft' },
      });
      ctx.audit({
        action: 'SOCIAL_PUBLICATION_REJECTED',
        targetType: 'SocialPublication',
        targetId: id,
        before: { status: pub.status },
        after: { status: 'draft' },
      });
      return this.pubView(updated);
    });
  }

  async listForListing(listingId: string) {
    const rows = await this.prisma.socialPublication.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((p) => this.pubView(p));
  }

  private autoCaption(title: string | null, category: string): string {
    const lot = title ?? `${category} lot`;
    return `🔨 Now at Singha Auctions: ${lot}. Register to bid. #SinghaAuctions #${category}`;
  }

  private pubView(p: {
    id: string;
    listingId: string | null;
    campaignId: string | null;
    platform: string;
    status: string;
    caption: string;
    externalPostId: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    approvedById: string | null;
    approvedAt: Date | null;
  }) {
    return {
      id: p.id,
      listingId: p.listingId,
      campaignId: p.campaignId,
      platform: p.platform,
      status: p.status,
      caption: p.caption,
      externalPostId: p.externalPostId,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      approvedById: p.approvedById,
      approvedAt: p.approvedAt,
    };
  }
}
