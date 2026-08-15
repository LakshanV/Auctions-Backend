import { describe, expect, it } from 'vitest';
import { loadConfig } from './index';
import type { FeatureFlagName } from './feature-flags';

/**
 * Evolution E14 hardening guard — every Singha Evolution capability flag MUST default OFF (pack doc
 * 13/18: new capability ships dark and rolls out internal → cohort → general). This test fails the
 * build if a future edit flips an evolution flag on by default, so no evolution surface can go live
 * silently without an explicit env/config opt-in.
 */

const EVOLUTION_FLAGS: FeatureFlagName[] = [
  // E2 config foundations
  'multiOperator',
  'structuredLocations',
  'quantityUnits',
  'saleMethodConfig',
  // E4 commercial offers
  'commercialOffersV2',
  'sealedOffers',
  // E5 currency / FX
  'multiCurrency',
  'fxDisplay',
  // E6 routing
  'transactionRouting',
  // E7 logistics
  'logistics',
  'logisticsQuotes',
  // E8 fees / payments
  'feesEngine',
  'operatorPayments',
  // E9 procurement
  'procurement',
  // E10 supply + perishables
  'supplyProgrammes',
  'perishableGoods',
  // E11 Singha ID + dashboard + control centre
  'singhaId',
  'dashboard',
  'controlCentre',
  // E12 intelligence
  'insightEngine',
  // E13 satellite nodes
  'satelliteNodes',
];

describe('Singha Evolution flags default OFF (rule: ship dark)', () => {
  const cfg = loadConfig({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });

  it.each(EVOLUTION_FLAGS)('%s is OFF by default', (flag) => {
    expect(cfg.features[flag]).toBe(false);
  });
});
