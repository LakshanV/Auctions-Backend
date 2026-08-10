import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';
import { StorageModule } from './shared/storage/storage.module';
import { HealthModule } from './health/health.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { IdentityModule } from './modules/identity/identity.module';
import { SellerModule } from './modules/seller/seller.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { AuctionModule } from './modules/auction/auction.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { AuthModule } from './modules/auth/auth.module';
import { MediaModule } from './modules/media/media.module';
import { DevModule } from './modules/dev/dev.module';
import { PrincipalMiddleware } from './shared/auth/principal.middleware';

/**
 * Root module. Phase 0 foundations (config/prisma/health/flags) + Phase 1 stable
 * data-core domain modules, all behind the strict boundaries in @singha/domain
 * and the global permission guard in SharedModule.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    SharedModule,
    StorageModule,
    HealthModule,
    FeatureFlagsModule,
    IdentityModule,
    SellerModule,
    InventoryModule,
    MarketplaceModule,
    AuctionModule,
    CatalogueModule,
    AuthModule,
    MediaModule,
    DevModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Resolve the Principal from the Bearer token on every request.
    consumer.apply(PrincipalMiddleware).forRoutes('*');
  }
}
