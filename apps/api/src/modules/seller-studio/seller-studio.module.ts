import { Module } from '@nestjs/common';
import {
  SellerAuctionPreferenceController,
  SellerDraftController,
} from './seller-studio.controller';
import { SellerStudioService } from './seller-studio.service';

@Module({
  controllers: [SellerDraftController, SellerAuctionPreferenceController],
  providers: [SellerStudioService],
})
export class SellerStudioModule {}
