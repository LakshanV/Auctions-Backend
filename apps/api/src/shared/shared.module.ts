import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { UnitOfWork } from './persistence/unit-of-work';
import { PermissionsGuard } from './auth/permissions.guard';
import { DomainExceptionFilter } from './http/domain-exception.filter';

/**
 * Cross-cutting providers: the transactional unit of work, the global permission
 * guard and the domain-error → HTTP filter. PrismaService / AppConfigService
 * come from their own @Global modules.
 */
@Global()
@Module({
  providers: [
    UnitOfWork,
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [UnitOfWork],
})
export class SharedModule {}
