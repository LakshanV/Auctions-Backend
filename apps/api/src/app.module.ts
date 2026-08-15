import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SecurityThrottlerGuard } from './shared/security/security-throttler.guard';
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
import { EoiModule } from './modules/eoi/eoi.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { OffersModule } from './modules/offers/offers.module';
import { FxModule } from './modules/fx/fx.module';
import { RoutingModule } from './modules/routing/routing.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { FeesModule } from './modules/fees/fees.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { ConnectModule } from './modules/connect/connect.module';
import { AiModule } from './modules/ai/ai.module';
import { SocialModule } from './modules/social/social.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { LiveModule } from './modules/live/live.module';
import { WatchModule } from './modules/watch/watch.module';
import { MeModule } from './modules/me/me.module';
import { EventsModule } from './modules/events/events.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { AuthModule } from './modules/auth/auth.module';
import { MediaModule } from './modules/media/media.module';
import { DevModule } from './modules/dev/dev.module';
import { MemberModule } from './modules/member/member.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { PrincipalMiddleware } from './shared/auth/principal.middleware';

/**
 * Root module. Phase 0 foundations (config/prisma/health/flags) + Phase 1 stable
 * data-core domain modules, all behind the strict boundaries in @singha/domain
 * and the global permission guard in SharedModule.
 */
@Module({
  imports: [
    // Route-aware rate limiting (anti-clone retrofit). Generous default so normal
    // browsing/bidding is never harmed; sensitive routes tighten this per-route.
    // Active only in production (or an opt-in test) via SecurityThrottlerGuard.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
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
    EoiModule,
    ExchangeModule,
    OffersModule,
    FxModule,
    RoutingModule,
    LogisticsModule,
    FeesModule,
    CommerceModule,
    ConnectModule,
    AiModule,
    SocialModule,
    IntelligenceModule,
    LiveModule,
    WatchModule,
    MeModule,
    EventsModule,
    CatalogueModule,
    AuthModule,
    MediaModule,
    DevModule,
    MemberModule,
    DiscoveryModule,
    EngagementModule,
    PlatformConfigModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SecurityThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Resolve the Principal from the Bearer token on every request.
    consumer.apply(PrincipalMiddleware).forRoutes('*');
  }
}
