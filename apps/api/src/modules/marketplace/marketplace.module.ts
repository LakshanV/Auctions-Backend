import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { ListingQualityService } from './listing-quality.service';

@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService, ListingQualityService],
})
export class MarketplaceModule {}
