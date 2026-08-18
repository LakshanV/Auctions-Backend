import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PlatformConfigController } from './platform-config.controller';
import { type PlatformConfigService } from './platform-config.service';
import { type AppConfigService } from '../../config/config.service';

type Features = Record<string, boolean>;

function makeController(features: Features): PlatformConfigController {
  const platform = {
    saleMethods: () => [{ code: 'TIMED_AUCTION' }],
    units: () => [{ code: 'kg' }],
    categorySchemas: () => [{ key: 'vehicles', version: 1, label: 'Vehicles', fields: [] }],
    markets: async () => [],
    operators: async () => [],
    marketNodes: async () => [],
  } as unknown as PlatformConfigService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new PlatformConfigController(platform, config);
}

describe('PlatformConfigController (Evolution E2 flag gating)', () => {
  it('404s every surface when its flag is OFF', async () => {
    const c = makeController({
      saleMethodConfig: false,
      quantityUnits: false,
      multiOperator: false,
    });
    expect(() => c.saleMethods()).toThrow(NotFoundException);
    expect(() => c.units()).toThrow(NotFoundException);
    await expect(c.markets()).rejects.toThrow(NotFoundException);
    await expect(c.operators()).rejects.toThrow(NotFoundException);
    await expect(c.nodes()).rejects.toThrow(NotFoundException);
  });

  it('serves reference data when the flag is ON', async () => {
    const c = makeController({ saleMethodConfig: true, quantityUnits: true, multiOperator: true });
    expect(c.saleMethods().saleMethods[0]?.code).toBe('TIMED_AUCTION');
    expect(c.units().units[0]?.code).toBe('kg');
    await expect(c.markets()).resolves.toEqual({ markets: [] });
    await expect(c.nodes()).resolves.toEqual({ nodes: [] });
  });

  it('serves category schemas UNGATED (always available to the seller Studio)', () => {
    const c = makeController({
      saleMethodConfig: false,
      quantityUnits: false,
      multiOperator: false,
    });
    // No flag turns this off — the config-driven seller form always needs it (directive §2/§3).
    expect(c.categorySchemas().categories[0]?.key).toBe('vehicles');
  });

  it('gates each surface independently (units on, others off)', async () => {
    const c = makeController({
      saleMethodConfig: false,
      quantityUnits: true,
      multiOperator: false,
    });
    expect(() => c.saleMethods()).toThrow(NotFoundException);
    expect(c.units().units).toHaveLength(1);
    await expect(c.markets()).rejects.toThrow(NotFoundException);
  });
});
