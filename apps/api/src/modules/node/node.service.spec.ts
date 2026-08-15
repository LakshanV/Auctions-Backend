import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { NodeService } from './node.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const actor: Principal = { customerId: 'cust_1', roles: [], permissions: new Set(), aal: 'aal1' };

function makeService(features: Features): NodeService {
  const prisma = {} as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new NodeService(prisma, config);
}

describe('NodeService (E13 flag gating)', () => {
  it('404s the whole surface when satelliteNodes is OFF', async () => {
    const s = makeService({ satelliteNodes: false });
    await expect(s.getNode('LK')).rejects.toThrow(NotFoundException);
    await expect(s.discovery('LK')).rejects.toThrow(NotFoundException);
    await expect(s.originate(actor, 'LK', { capability: 'listings' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(s.seoCanonical({ baseUrl: 'https://x.example', path: '/a' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      s.seoListing({ baseUrl: 'https://x.example', path: '/a', publicRef: 'r', title: 't' }),
    ).rejects.toThrow(NotFoundException);
  });
});
