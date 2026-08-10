import { type AssetId, type ListingId, type SaleEventId, newId } from '@singha/contracts';

/**
 * Inventory module (docs/04, docs/06). The ASSET is the enduring object; a
 * LISTING is one presentation/sale attempt. One Asset can be auctioned, passed
 * in, converted to EOI, Buy Now, or re-listed WITHOUT recreating its identity.
 */
export type AssetLifecycle =
  'draft' | 'in_intake' | 'available' | 'reserved' | 'sold' | 'withdrawn' | 'archived';

export type SaleMethod =
  | 'TIMED_AUCTION'
  | 'EXPRESSION_OF_INTEREST'
  | 'BUY_NOW'
  | 'MAKE_OFFER'
  | 'SEALED_TENDER'
  | 'LIVE_HYBRID';

export type ListingStatus =
  | 'draft'
  | 'submitted'
  | 'review'
  | 'changes_required'
  | 'approved'
  | 'scheduled'
  | 'live'
  | 'ended'
  | 'sold'
  | 'unsold'
  | 'withdrawn';

export class Asset {
  private constructor(
    readonly id: AssetId,
    readonly category: string,
    /** Category schemas are versioned so new fields never break old assets. */
    readonly schemaVersion: number,
    private _lifecycle: AssetLifecycle,
  ) {}

  static create(category: string, schemaVersion = 1, id: AssetId = newId<'AssetId'>()): Asset {
    return new Asset(id, category, schemaVersion, 'draft');
  }

  get lifecycle(): AssetLifecycle {
    return this._lifecycle;
  }

  markAvailable(): void {
    this._lifecycle = 'available';
  }

  /**
   * Open a new sale attempt for this asset. Returns a Listing that references the
   * SAME assetId — the inventory identity is never recreated.
   */
  list(saleMethod: SaleMethod): Listing {
    return Listing.forAsset(this.id, saleMethod);
  }
}

export class Listing {
  private constructor(
    readonly id: ListingId,
    readonly assetId: AssetId,
    readonly saleMethod: SaleMethod,
    private _status: ListingStatus,
    readonly saleEventId: SaleEventId | null,
  ) {}

  static forAsset(assetId: AssetId, saleMethod: SaleMethod): Listing {
    return new Listing(newId<'ListingId'>(), assetId, saleMethod, 'draft', null);
  }

  get status(): ListingStatus {
    return this._status;
  }

  submit(): void {
    this._status = 'submitted';
  }
}
