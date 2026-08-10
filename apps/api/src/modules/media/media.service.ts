import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  type AddDerivativeInput,
  type CreateUploadUrlInput,
  type RegisterMediaInput,
  newId,
} from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { STORAGE_PROVIDER, type StorageProvider } from '../../shared/storage/storage.provider';

/**
 * Media module (docs/06): originals are IMMUTABLE; enhanced/processed media are
 * separate derivative rows that record their source for provenance.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Issue a direct-to-storage upload grant (client uploads to Supabase, docs/06). */
  async createUploadUrl(assetId: string, input: CreateUploadUrlInput) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (!this.storage.configured) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    const safe = input.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    const path = `assets/${assetId}/${newId()}-${safe}`;
    const upload = await this.storage.createSignedUploadUrl(path);
    return {
      path: upload.path,
      signedUrl: upload.signedUrl,
      token: upload.token,
      kind: input.kind,
    };
  }

  async registerMedia(principal: Principal, assetId: string, input: RegisterMediaInput) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const media = await ctx.tx.mediaObject.create({
        data: {
          id,
          assetId,
          kind: input.kind,
          storageKey: input.storageKey,
          status: 'ready',
          isOriginal: true,
        },
      });
      ctx.audit({ action: 'MEDIA_REGISTERED', targetType: 'Asset', targetId: assetId });
      return media;
    });
  }

  async addDerivative(principal: Principal, mediaId: string, input: AddDerivativeInput) {
    const source = await this.prisma.mediaObject.findUnique({ where: { id: mediaId } });
    if (!source) throw new NotFoundException('Source media not found');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const derivative = await ctx.tx.mediaDerivative.create({
        data: { id, sourceMediaId: mediaId, method: input.method, storageKey: input.storageKey },
      });
      ctx.audit({
        action: 'MEDIA_DERIVATIVE_ADDED',
        targetType: 'MediaObject',
        targetId: mediaId,
        after: { method: input.method },
      });
      return derivative;
    });
  }
}
