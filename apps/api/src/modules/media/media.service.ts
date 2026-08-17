import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  type AddDerivativeInput,
  type CreateUploadUrlInput,
  type MediaVisibility,
  type RegisterMediaInput,
  newId,
} from '@singha/contracts';
import { type UploadCheck, checkUploadAllowed, kindRequiresMalwareScan } from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { assertCanManageAssetMedia } from '../../shared/auth/asset-authz';
import { STORAGE_PROVIDER, type StorageProvider } from '../../shared/storage/storage.provider';
import { MALWARE_SCANNER, type MalwareScanner } from '../../shared/security/malware-scanner';

/**
 * Media module (docs/06 + pack FIX-03..07): originals are IMMUTABLE; enhanced/
 * processed media are separate derivative rows recording provenance.
 *
 * Security invariants enforced here (never in the UI):
 *   - object-level authorization on every write (owner / authorized staff only);
 *   - the caller may only register a backend-issued, asset-scoped storage path —
 *     arbitrary caller-supplied keys are rejected;
 *   - media is only marked ready once the object is verified to exist in storage
 *     (no fake READY rows, no filename fallback);
 *   - documents default to private visibility and never leak to the public gallery.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  /** Map an upload-policy rejection to the right HTTP status (415 unsupported type / 413 too large). */
  private denyUpload(check: UploadCheck): never {
    if (check.code === 'too_large') throw new PayloadTooLargeException(check.reason);
    throw new UnsupportedMediaTypeException(check.reason ?? 'unsupported media');
  }

  /** Issue a direct-to-storage upload grant (client uploads to Supabase, docs/06). */
  async createUploadUrl(principal: Principal, assetId: string, input: CreateUploadUrlInput) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    assertCanManageAssetMedia(principal, asset);
    // RW3 — reject a disallowed content type / oversize BEFORE issuing an upload grant, so a bad
    // file is never uploaded in the first place. Re-verified at registration against storage.
    const declared = checkUploadAllowed({
      kind: input.kind,
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    if (!declared.allowed) this.denyUpload(declared);
    if (!this.storage.configured) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    const safe = input.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    // Backend-issued, opaque, asset-scoped path (pack FIX-04). registerMedia
    // re-validates this exact namespace before accepting any object.
    const path = `${this.assetPrefix(assetId)}${newId()}-${safe}`;
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
    assertCanManageAssetMedia(principal, asset);

    // FIX-04 — reject arbitrary/foreign storage keys. Only a backend-issued,
    // asset-scoped path may be registered. (External-URL media would be a
    // distinct source type; it is not accepted through this pipeline.)
    const prefix = this.assetPrefix(assetId);
    if (!input.storageKey.startsWith(prefix) || input.storageKey.includes('..')) {
      throw new BadRequestException('storageKey is not a backend-issued path for this asset');
    }

    // RW3 — enforce the per-kind MIME allowlist + size cap on the client-declared metadata up
    // front (a disallowed type/size is refused even when storage is unavailable). Re-checked
    // against the storage-verified metadata below (defense in depth).
    const declared = checkUploadAllowed({
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
    if (!declared.allowed) this.denyUpload(declared);

    // S23 — finalize is idempotent: the same object registered twice returns the
    // existing row rather than creating a duplicate, and does NOT re-hit storage.
    const existing = await this.prisma.mediaObject.findFirst({
      where: { assetId, storageKey: input.storageKey },
    });
    if (existing) return existing;

    // FIX-05 — never mark media ready for an object that was never uploaded.
    if (!this.storage.configured) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    const stat = await this.storage.statObject(input.storageKey);
    if (!stat.exists) {
      throw new BadRequestException('Uploaded object not found in storage');
    }

    // RW3 — re-verify the policy against the storage-observed type/size (a client can declare one
    // content type and upload another). The stored object is the source of truth.
    const effMime = input.mimeType ?? stat.mimeType ?? null;
    const effSize = input.sizeBytes ?? stat.sizeBytes ?? null;
    const verified = checkUploadAllowed({
      kind: input.kind,
      mimeType: effMime,
      sizeBytes: effSize,
    });
    if (!verified.allowed) this.denyUpload(verified);

    // RW3 — screen untrusted document/video for malware BEFORE it is ever marked ready. An
    // infected object is refused (422) and the rejection is audited; it never becomes a media row.
    let scanStatus = 'skipped';
    if (kindRequiresMalwareScan(input.kind)) {
      const verdict = await this.scanner.scan({
        storageKey: input.storageKey,
        mimeType: effMime,
        sizeBytes: effSize,
        checksum: input.checksum ?? null,
      });
      scanStatus = verdict.status;
      if (verdict.status === 'infected') {
        const rejActor = toActor(principal);
        await this.uow.execute(rejActor, async (ctx) => {
          ctx.audit({
            action: 'MEDIA_SCAN_REJECTED',
            targetType: 'Asset',
            targetId: assetId,
            after: {
              storageKey: input.storageKey,
              kind: input.kind,
              scanner: this.scanner.name,
              signature: verdict.signature ?? null,
            },
          });
        });
        throw new UnprocessableEntityException('Uploaded file failed malware screening');
      }
    }

    const visibility: MediaVisibility =
      input.visibility ?? (input.kind === 'document' ? 'private' : 'public');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      // Enforce a single cover transactionally (pack doc 03/media integrity).
      if (input.isCover) {
        await ctx.tx.mediaObject.updateMany({
          where: { assetId, isCover: true },
          data: { isCover: false },
        });
      }
      const media = await ctx.tx.mediaObject.create({
        data: {
          id,
          assetId,
          kind: input.kind,
          storageKey: input.storageKey,
          status: 'ready',
          isOriginal: true,
          visibility,
          isCover: input.isCover ?? false,
          caption: input.caption ?? null,
          sortOrder: input.sortOrder ?? 0,
          mimeType: input.mimeType ?? stat.mimeType ?? null,
          sizeBytes: input.sizeBytes ?? stat.sizeBytes ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          durationMs: input.durationMs ?? null,
          checksum: input.checksum ?? null,
        },
      });
      ctx.audit({
        action: 'MEDIA_REGISTERED',
        targetType: 'Asset',
        targetId: assetId,
        after: { mediaId: id, kind: input.kind, visibility, scanStatus },
      });
      return media;
    });
  }

  /**
   * RW3 — issue a time-limited, authorized download URL for a media object (wires the previously
   * dead `getSignedDownloadUrl`). PRIVATE/INTERNAL objects (documents, evidence) require
   * object-level authorization — only the asset owner / authorized staff — so a signed link is
   * never mintable for someone else's private document (media IDOR). PUBLIC objects are already
   * openly viewable, so any authenticated caller with media access may fetch a link. The TTL is
   * clamped server-side so a caller can never request a long-lived URL.
   */
  async getDownloadUrl(principal: Principal, mediaId: string, expiresInSec?: number) {
    const media = await this.prisma.mediaObject.findUnique({
      where: { id: mediaId },
      include: { asset: true },
    });
    if (!media) throw new NotFoundException('Media not found');

    if (media.visibility !== 'public') {
      // Object-level authorization — throws ForbiddenException for a non-owner (media IDOR guard).
      assertCanManageAssetMedia(principal, media.asset);
    }
    if (!this.storage.configured) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    const ttl = Math.min(Math.max(Math.trunc(expiresInSec ?? 300), 60), 3600);
    const url = await this.storage.getSignedDownloadUrl(media.storageKey, ttl);
    return { mediaId: media.id, url, visibility: media.visibility, expiresInSec: ttl };
  }

  async addDerivative(principal: Principal, mediaId: string, input: AddDerivativeInput) {
    const source = await this.prisma.mediaObject.findUnique({
      where: { id: mediaId },
      include: { asset: true },
    });
    if (!source) throw new NotFoundException('Source media not found');
    assertCanManageAssetMedia(principal, source.asset);

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

  private assetPrefix(assetId: string): string {
    return `assets/${assetId}/`;
  }
}
