import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  type AddDerivativeInput,
  type CreateUploadUrlInput,
  Permission,
  type RegisterMediaInput,
  addDerivativeSchema,
  createUploadUrlSchema,
  registerMediaSchema,
} from '@singha/contracts';
import { MediaService } from './media.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Direct-to-Supabase upload grant for large media (docs/06 upload pipeline). */
  @Post('assets/:assetId/media/upload-url')
  @RequirePermissions(Permission.MediaManage)
  uploadUrl(
    @Param('assetId') assetId: string,
    @Body(new ZodBody(createUploadUrlSchema)) input: CreateUploadUrlInput,
  ) {
    return this.media.createUploadUrl(assetId, input);
  }

  @Post('assets/:assetId/media')
  @RequirePermissions(Permission.MediaManage)
  register(
    @CurrentActor() principal: Principal,
    @Param('assetId') assetId: string,
    @Body(new ZodBody(registerMediaSchema)) input: RegisterMediaInput,
  ) {
    return this.media.registerMedia(principal, assetId, input);
  }

  @Post('media/:mediaId/derivatives')
  @RequirePermissions(Permission.MediaManage)
  addDerivative(
    @CurrentActor() principal: Principal,
    @Param('mediaId') mediaId: string,
    @Body(new ZodBody(addDerivativeSchema)) input: AddDerivativeInput,
  ) {
    return this.media.addDerivative(principal, mediaId, input);
  }
}
