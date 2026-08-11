import { Logger, Module } from '@nestjs/common';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';
import { AuctionRealtimeGateway } from './auction-realtime.gateway';
import { REALTIME_TRANSPORT, RedisRealtimeTransport } from './auction-realtime.transport';
import { AppConfigService } from '../../config/config.service';

@Module({
  controllers: [AuctionController],
  providers: [
    AuctionService,
    AuctionRealtimeGateway,
    {
      // Cross-instance realtime transport (pack 01 doc 07). Redis pub/sub when
      // REDIS_URL is configured, else null → the gateway stays in-process. A
      // Redis connection failure degrades to in-process rather than crashing;
      // the DB is always authoritative and reconnect/snapshot self-heals.
      provide: REALTIME_TRANSPORT,
      inject: [AppConfigService],
      useFactory: async (config: AppConfigService) => {
        const { redis } = config.get();
        if (!redis.enabled) return null;
        try {
          return await RedisRealtimeTransport.create(redis.url);
        } catch (err) {
          new Logger('AuctionRealtime').warn(
            `Redis realtime transport unavailable (${(err as Error).message}) — using in-process fan-out.`,
          );
          return null;
        }
      },
    },
  ],
  exports: [AuctionService],
})
export class AuctionModule {}
