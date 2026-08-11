/**
 * Pure commerce money math (docs/14). All amounts are integer minor units; we
 * never carry a floating balance — the authoritative record is the append-only
 * ledger, and these helpers only DERIVE figures for invoices/settlements.
 */
export interface FeeConfig {
  buyerPremiumPct: number;
  taxPct: number;
}

export interface InvoiceComputation {
  hammerMinor: number;
  buyerPremiumMinor: number;
  taxMinor: number;
  otherFeesMinor: number;
  depositAppliedMinor: number;
  amountDueMinor: number;
}

const pct = (base: number, percentage: number): number => Math.round((base * percentage) / 100);

/** Buyer-side invoice. Tax is applied to the buyer's premium (VAT on the fee). */
export function computeInvoice(
  hammerMinor: number,
  fees: FeeConfig,
  opts: { otherFeesMinor?: number; depositAppliedMinor?: number } = {},
): InvoiceComputation {
  const buyerPremiumMinor = pct(hammerMinor, fees.buyerPremiumPct);
  const taxMinor = pct(buyerPremiumMinor, fees.taxPct);
  const otherFeesMinor = opts.otherFeesMinor ?? 0;
  const depositAppliedMinor = opts.depositAppliedMinor ?? 0;
  const amountDueMinor =
    hammerMinor + buyerPremiumMinor + taxMinor + otherFeesMinor - depositAppliedMinor;
  return {
    hammerMinor,
    buyerPremiumMinor,
    taxMinor,
    otherFeesMinor,
    depositAppliedMinor,
    amountDueMinor,
  };
}

export interface SettlementComputation {
  saleProceedsMinor: number;
  commissionMinor: number;
  commissionTaxMinor: number;
  deductionsMinor: number;
  netMinor: number;
}

/** Seller-side settlement. Commission + VAT on commission + agreed deductions. */
export function computeSettlement(
  hammerMinor: number,
  cfg: { sellerCommissionPct: number; taxPct: number },
  opts: { deductionsMinor?: number } = {},
): SettlementComputation {
  const commissionMinor = pct(hammerMinor, cfg.sellerCommissionPct);
  const commissionTaxMinor = pct(commissionMinor, cfg.taxPct);
  const deductionsMinor = opts.deductionsMinor ?? 0;
  const netMinor = hammerMinor - commissionMinor - commissionTaxMinor - deductionsMinor;
  return {
    saleProceedsMinor: hammerMinor,
    commissionMinor,
    commissionTaxMinor,
    deductionsMinor,
    netMinor,
  };
}
