import {
  SALE_METHOD_DEFINITIONS,
  saleMethodValues,
  type SaleMethodDefinitionSpec,
  type SaleMethodFamily,
} from '@singha/contracts';

/**
 * Sale-method taxonomy logic (Evolution E2). Pure — the canonical taxonomy lives in
 * `@singha/contracts` (`SALE_METHOD_DEFINITIONS`); this module is its query surface and
 * the guardrail for two non-negotiables:
 *  - D3: the legacy `SaleMethod` enum maps 1:1 onto definition codes (safe migration).
 *  - D4: no offer/sealed method binds automatically (no silent auto-award of the highest).
 * DB persistence + flag gating live in the API; this stays exhaustively unit-testable.
 */

const BY_CODE = new Map(SALE_METHOD_DEFINITIONS.map((m) => [m.code, m]));

/** Look up a sale-method definition by code, or `undefined` if unknown. */
export function saleMethodByCode(code: string): SaleMethodDefinitionSpec | undefined {
  return BY_CODE.get(code);
}

/** Every definition, ordered for display. */
export function allSaleMethods(): SaleMethodDefinitionSpec[] {
  return [...SALE_METHOD_DEFINITIONS].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Only the currently-enabled methods, ordered for display. */
export function activeSaleMethods(): SaleMethodDefinitionSpec[] {
  return allSaleMethods().filter((m) => m.active);
}

/** Definitions in a family (auction | offer | fixed | eoi | procurement). */
export function saleMethodsInFamily(family: SaleMethodFamily): SaleMethodDefinitionSpec[] {
  return allSaleMethods().filter((m) => m.family === family);
}

/** True only for genuine auction mechanics (Timed / Live / Premier). */
export function isAuctionMethod(code: string): boolean {
  return BY_CODE.get(code)?.isAuction ?? false;
}

/** The definition that carries a given legacy `SaleMethod` enum value, if any. */
export function saleMethodForLegacyEnum(enumValue: string): SaleMethodDefinitionSpec | undefined {
  return SALE_METHOD_DEFINITIONS.find((m) => m.legacyEnum === enumValue);
}

/**
 * Whether accepting/winning under this method creates a binding sale automatically.
 * The auction engine binds a winning bid; offers and sealed offers NEVER auto-bind
 * (DECISIONS D4). Unknown codes are treated as non-binding (safe default).
 */
export function bindsAutomatically(code: string): boolean {
  return BY_CODE.get(code)?.bindsAutomatically ?? false;
}

/** The legacy `SaleMethod` enum values, each guaranteed a 1:1 active definition (D3). */
export const LEGACY_SALE_METHODS = saleMethodValues;
