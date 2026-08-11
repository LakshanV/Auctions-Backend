import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { UnitOfWork } from './persistence/unit-of-work';
import { PermissionsGuard } from './auth/permissions.guard';
import { AssuranceGuard } from './auth/assurance.guard';
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
    // Order matters: permission authorize, then require AAL2 (pack doc 04).
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: AssuranceGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [UnitOfWork],
})
export class SharedModule {}
