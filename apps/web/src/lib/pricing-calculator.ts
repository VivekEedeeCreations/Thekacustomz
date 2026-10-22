/**
 * Pure math for the pricing calculator (apps/web/src/pages/pricing-calculator). Nothing here
 * touches the database — it's a scratchpad to help decide a selling price, not the pricing
 * model used by orders (which treats products.selling_price as GST-exclusive; see
 * order-form-page.tsx). Kept separate from React so the arithmetic can be reasoned about and
 * tested on its own.
 */

export type CostType = 'FIXED' | 'PERCENT_OF_PRICE';

export interface CostLine {
  id: string;
  label: string;
  type: CostType;
  /** Rupees when type is FIXED, a percentage (e.g. 15 for 15%) when PERCENT_OF_PRICE. */
  amount: number;
}

export interface CostInputs {
  /** The raw material / base cost — always fixed, always included. */
  rawCost: number;
  /** Extra costs a seller carries: packaging, shipping, marketplace commission, gateway fees. */
  additionalCosts: CostLine[];
  /** GST rate applied on the selling price, e.g. 18 for 18%. */
  gstRatePercent: number;
}

function sumFixed(inputs: CostInputs): number {
  return (
    inputs.rawCost +
    inputs.additionalCosts.filter((c) => c.type === 'FIXED').reduce((sum, c) => sum + c.amount, 0)
  );
}

/** Sum of percentage cost lines, as a fraction (e.g. 0.15 for three lines of 5% each). */
function sumPercentFraction(inputs: CostInputs): number {
  return (
    inputs.additionalCosts
      .filter((c) => c.type === 'PERCENT_OF_PRICE')
      .reduce((sum, c) => sum + c.amount, 0) / 100
  );
}

export interface PriceBreakdown {
  sellingPrice: number;
  /** Selling price with GST removed — the seller's actual (pre-tax) receipt. */
  taxableValue: number;
  gstAmount: number;
  fixedCostTotal: number;
  /** Percentage-based costs (commission, gateway fees, ...), computed on the selling price. */
  percentCostTotal: number;
  totalCost: number;
  /** taxableValue - totalCost. Negative means the price is selling at a loss. */
  profit: number;
  /** profit as a % of the selling price the customer pays. */
  marginPercent: number;
  /** profit as a % of total cost — the traditional "cost-plus" markup. */
  markupPercent: number | null;
}

/** Given a GST-inclusive selling price, break it down into tax, costs and profit. */
export function breakdownFromSellingPrice(
  inputs: CostInputs,
  sellingPrice: number,
): PriceBreakdown {
  const gstFraction = inputs.gstRatePercent / 100;
  const taxableValue = sellingPrice / (1 + gstFraction);
  const gstAmount = sellingPrice - taxableValue;
  const fixedCostTotal = sumFixed(inputs);
  const percentCostTotal = sumPercentFraction(inputs) * sellingPrice;
  const totalCost = fixedCostTotal + percentCostTotal;
  const profit = taxableValue - totalCost;
  return {
    sellingPrice,
    taxableValue,
    gstAmount,
    fixedCostTotal,
    percentCostTotal,
    totalCost,
    profit,
    marginPercent: sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0,
    markupPercent: totalCost > 0 ? (profit / totalCost) * 100 : null,
  };
}

export interface TargetMarginResult {
  ok: true;
  breakdown: PriceBreakdown;
}
export interface TargetMarginError {
  ok: false;
  reason: string;
}

/**
 * A target to solve the selling price for: either a margin (profit as a % of the selling
 * price) or a fixed profit amount in rupees.
 */
export type PriceTarget =
  { mode: 'MARGIN_PERCENT'; value: number } | { mode: 'PROFIT_AMOUNT'; value: number };

/**
 * Solves for the GST-inclusive selling price that hits a target margin or profit amount, given
 * the same cost lines. With S = selling price, profit = S/(1+gst) - fixed - percentCosts(S) =
 * S * base - fixed, where base = 1/(1+gst) - percentFraction is the share of S left after GST
 * and percentage costs.
 *
 * - Target margin m (% of S): profit = (m/100)*S, so S*base - fixed = (m/100)*S, giving
 *   S = fixed / (base - m/100). If there are no fixed costs, profit/S always equals `base`
 *   regardless of S (both sides scale with S), so the ratio is either true for every price or
 *   for none — not a useful "the" price. We reject that case rather than show a meaningless ₹0.
 * - Target profit amount P (₹): profit = P, so S*base - fixed = P, giving S = (fixed + P) / base.
 *   This works fine even with no fixed costs, since P doesn't scale with S.
 *
 * Either way, the denominator must be positive — otherwise the percentage costs (and, for a
 * margin target, the margin itself) already eat the whole price, and no finite price works.
 */
export function priceForTarget(
  inputs: CostInputs,
  target: PriceTarget,
): TargetMarginResult | TargetMarginError {
  const gstFraction = inputs.gstRatePercent / 100;
  const fixedCostTotal = sumFixed(inputs);
  const percentFraction = sumPercentFraction(inputs);
  const base = 1 / (1 + gstFraction) - percentFraction;

  if (target.mode === 'MARGIN_PERCENT') {
    const denominator = base - target.value / 100;
    if (denominator <= 0) {
      return {
        ok: false,
        reason:
          'Not achievable: the percentage-based costs and target margin already add up to 100% or more of the selling price.',
      };
    }
    if (fixedCostTotal <= 0) {
      return {
        ok: false,
        reason:
          'Add a raw material cost (or a fixed cost) to solve for a price from a margin percentage — with only percentage-based costs, every price gives the same margin, so there is no single answer. Try a target profit amount instead.',
      };
    }
    const sellingPrice = fixedCostTotal / denominator;
    return { ok: true, breakdown: breakdownFromSellingPrice(inputs, sellingPrice) };
  }

  if (base <= 0) {
    return {
      ok: false,
      reason:
        'Not achievable: the percentage-based costs already use up 100% or more of the selling price.',
    };
  }
  const sellingPrice = (fixedCostTotal + target.value) / base;
  if (sellingPrice <= 0) {
    return {
      ok: false,
      reason:
        'That profit target gives a selling price of ₹0 or less — lower it, or check your costs.',
    };
  }
  return { ok: true, breakdown: breakdownFromSellingPrice(inputs, sellingPrice) };
}

export const GST_SLABS = [0, 5, 12, 18, 28] as const;

let nextId = 0;
export function newCostLineId(): string {
  nextId += 1;
  return `cost-${Date.now()}-${nextId}`;
}
