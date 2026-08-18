import { Controller, Get, NotFoundException } from '@nestjs/common';
import { PlatformConfigService } from './platform-config.service';
import { AppConfigService } from '../../config/config.service';

/**
 * Public, read-only platform configuration (Evolution E2). Reference data the frontend needs
 * to render the neutral catalogue/listing surfaces. Each endpoint is gated by its own
 * default-OFF flag and 404s until enabled (same pattern as the other V3/Evolution surfaces),
 * so nothing is exposed before its feature is ready. No RBAC — these are non-sensitive
 * reference reads (operator legal identity is never included, D7).
 */
@Controller('platform')
export class PlatformConfigController {
  constructor(
    private readonly platform: PlatformConfigService,
    private readonly config: AppConfigService,
  ) {}

  private ensure(flag: 'saleMethodConfig' | 'quantityUnits' | 'multiOperator'): void {
    if (!this.config.get().features[flag]) throw new NotFoundException('Not found');
  }

  // Ungated: category field schemas are non-sensitive core taxonomy the seller Listing Studio
  // always needs to render a config-driven form (directive §2/§3) — no rollout risk, no operator
  // identity. The frontend must consume this instead of hard-coding a private category universe.
  @Get('category-schemas')
  categorySchemas() {
    return { categories: this.platform.categorySchemas() };
  }

  @Get('sale-methods')
  saleMethods() {
    this.ensure('saleMethodConfig');
    return { saleMethods: this.platform.saleMethods() };
  }

  @Get('units')
  units() {
    this.ensure('quantityUnits');
    return { units: this.platform.units() };
  }

  @Get('markets')
  async markets() {
    this.ensure('multiOperator');
    return { markets: await this.platform.markets() };
  }

  @Get('operators')
  async operators() {
    this.ensure('multiOperator');
    return { operators: await this.platform.operators() };
  }

  @Get('nodes')
  async nodes() {
    this.ensure('multiOperator');
    return { nodes: await this.platform.marketNodes() };
  }
}
