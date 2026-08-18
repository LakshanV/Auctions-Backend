import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type RecordInspectionEvidenceInput, newId } from '@singha/contracts';
import type { AssetInspectionEvidence, MediaObject } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import {
  INSPECTION_PROVIDER,
  type InspectionKind,
  type InspectionProvider,
} from '../../shared/inspection/inspection.provider';

type EvidenceWithMedia = AssetInspectionEvidence & { mediaObject: MediaObject | null };

/**
 * §20 (RW9, PRV-3) — third-party inspection / certification EVIDENCE for an asset. Staff-recorded
 * (asset:manage — staff-only), provider-neutral: an outcome may be entered directly from an issued
 * certificate, or OPENED through the `InspectionProvider` port (the seam a real lab plugs into).
 *
 * Non-negotiables honoured here:
 * - Evidence is a DERIVED record; it never overwrites the asset's authoritative facts (rule 3) and
 *   never binds a sale.
 * - The certificate reference is stored verbatim, never fabricated (the mock port issues none).
 * - Only `public` evidence is ever projected to customers; a linked certificate DOCUMENT surfaces
 *   only when it is itself public + ready in the secure media pipeline (private docs stay gated).
 */
@Injectable()
export class InspectionEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    @Inject(INSPECTION_PROVIDER) private readonly inspection: InspectionProvider,
  ) {}

  /** Full projection for STAFF (includes visibility + the internal inspection/media ids). */
  private toStaff(e: EvidenceWithMedia) {
    return {
      id: e.id,
      assetId: e.assetId,
      kind: e.kind,
      provider: e.provider,
      status: e.status,
      certificateRef: e.certificateRef,
      inspectionId: e.inspectionId,
      summary: e.summary,
      inspectedAt: e.inspectedAt,
      visibility: e.visibility,
      mediaObjectId: e.mediaObjectId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  /**
   * Customer-safe projection: never exposes visibility, internal ids or a non-public document.
   * A `document` block appears only when the linked media is itself public AND ready.
   */
  private toPublic(e: EvidenceWithMedia) {
    const doc =
      e.mediaObject && e.mediaObject.visibility === 'public' && e.mediaObject.status === 'ready'
        ? { id: e.mediaObject.id, storageKey: e.mediaObject.storageKey, kind: e.mediaObject.kind }
        : undefined;
    return {
      id: e.id,
      kind: e.kind,
      provider: e.provider,
      status: e.status,
      certificateRef: e.certificateRef ?? undefined,
      summary: e.summary ?? undefined,
      inspectedAt: e.inspectedAt,
      document: doc,
    };
  }

  private async assetOrThrow(assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async record(principal: Principal, assetId: string, input: RecordInspectionEvidenceInput) {
    await this.assetOrThrow(assetId);

    // A linked certificate document must belong to THIS asset and be a document (never an
    // arbitrary media id — that would let staff attach another asset's file as "evidence").
    if (input.mediaObjectId) {
      const media = await this.prisma.mediaObject.findUnique({
        where: { id: input.mediaObjectId },
      });
      if (!media || media.assetId !== assetId) {
        throw new BadRequestException('mediaObjectId must be a media object of this asset');
      }
      if (media.kind !== 'document') {
        throw new BadRequestException('Inspection evidence media must be a document');
      }
    }

    // Provider-neutral seam: opening via the port yields an inspectionId + provider-reported
    // status (the mock returns `requested` and never a certificate). Otherwise the record is
    // entered directly — a present certificate implies `completed` unless the caller overrides.
    let inspectionId: string | undefined;
    let status = input.status;
    if (input.requestViaProvider) {
      const result = await this.inspection.requestInspection({
        subjectRef: assetId,
        kind: input.kind as InspectionKind,
        notes: input.summary,
      });
      inspectionId = result.inspectionId;
      status ??= result.status;
    }
    status ??= input.certificateRef ? 'completed' : 'requested';

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.assetInspectionEvidence.create({
        data: {
          id,
          assetId,
          kind: input.kind,
          provider: input.provider,
          status,
          certificateRef: input.certificateRef ?? null,
          inspectionId: inspectionId ?? null,
          summary: input.summary ?? null,
          inspectedAt: input.inspectedAt ? new Date(input.inspectedAt) : null,
          visibility: input.visibility ?? 'private',
          mediaObjectId: input.mediaObjectId ?? null,
          createdBy: principal.customerId ?? null,
        },
      });
      ctx.audit({
        action: 'INSPECTION_EVIDENCE_RECORDED',
        targetType: 'Asset',
        targetId: assetId,
        after: {
          evidenceId: id,
          kind: input.kind,
          provider: input.provider,
          status,
          visibility: input.visibility ?? 'private',
        },
      });
      const created = (await ctx.tx.assetInspectionEvidence.findUnique({
        where: { id },
        include: { mediaObject: true },
      })) as EvidenceWithMedia;
      return this.toStaff(created);
    });
  }

  /** STAFF read — every evidence row for the asset, newest first. */
  async listForAsset(_principal: Principal, assetId: string) {
    await this.assetOrThrow(assetId);
    const rows = (await this.prisma.assetInspectionEvidence.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      include: { mediaObject: true },
    })) as EvidenceWithMedia[];
    return { evidence: rows.map((e) => this.toStaff(e)) };
  }

  /**
   * CUSTOMER read — only PUBLIC evidence, customer-safe projection. Used by the catalogue lot
   * detail; returns `[]` (never throws) for an unknown asset so a detail read never 500s on it.
   */
  async publicForAsset(assetId: string) {
    const rows = (await this.prisma.assetInspectionEvidence.findMany({
      where: { assetId, visibility: 'public' },
      orderBy: [{ inspectedAt: 'desc' }, { createdAt: 'desc' }],
      include: { mediaObject: true },
    })) as EvidenceWithMedia[];
    return rows.map((e) => this.toPublic(e));
  }
}
