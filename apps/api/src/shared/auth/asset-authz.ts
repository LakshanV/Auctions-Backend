import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@singha/contracts';
import { type Principal } from './principal';

/** The minimal asset shape needed for an object-level media authorization check. */
export interface AssetScope {
  ownerCustomerId: string | null;
}

/**
 * Central object-level authorization for asset media (pack FIX-03 / doc 03).
 * `@RequirePermissions(MediaManage)` only proves the caller *may* manage media in
 * general; it does NOT prove they may manage media on THIS asset. This is the
 * object check that closes the IDOR:
 *
 *   - platform staff/admin holding `asset:manage` may manage any asset's media;
 *   - a seller / seller_staff may manage media only for an asset their own
 *     customer scope controls (asset.ownerCustomerId === principal.customerId);
 *   - everyone else (unrelated seller, plain customer, anonymous) is denied.
 *
 * Mirrors the ownership rule already enforced in InventoryService.updateAttributes
 * so asset and asset-media authorization stay consistent.
 */
export function canManageAssetMedia(principal: Principal, asset: AssetScope): boolean {
  if (principal.permissions.has(Permission.AssetManage)) return true;
  return principal.customerId != null && asset.ownerCustomerId === principal.customerId;
}

export function assertCanManageAssetMedia(principal: Principal, asset: AssetScope): void {
  if (!canManageAssetMedia(principal, asset)) {
    throw new ForbiddenException('Not permitted to manage media for this asset');
  }
}
