import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateAssetInput,
  Permission,
  type UpdateAssetAttributesInput,
  createAssetSchema,
  updateAssetAttributesSchema,
} from '@singha/contracts';
import { InventoryService } from './inventory.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('assets')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  @RequirePermissions(Permission.AssetCreate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createAssetSchema)) input: CreateAssetInput,
  ) {
    return this.inventory.createAsset(principal, input);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.inventory.getAsset(id);
  }

  /** Ownership- or AssetManage-authorized in the service. */
  @Patch(':id/attributes')
  updateAttributes(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(updateAssetAttributesSchema)) input: UpdateAssetAttributesInput,
  ) {
    return this.inventory.updateAttributes(principal, id, input);
  }
}
