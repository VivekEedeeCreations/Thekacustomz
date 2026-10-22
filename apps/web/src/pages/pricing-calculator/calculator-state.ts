import type { Json } from '@inventory/shared';

import {
  breakdownFromSellingPrice,
  newCostLineId,
  priceForTarget,
  type CostInputs,
  type CostLine,
  type PriceBreakdown,
  type PriceTarget,
} from '@/lib/pricing-calculator';

/** The calculator's form state, kept as the raw input text so a reload restores it exactly. */
export interface CalculatorState {
  rawCost: string;
  costs: CostLine[];
  gstChoice: string;
  customGst: string;
  sellingPrice: string;
  targetMode: PriceTarget['mode'];
  targetValue: string;
}

export const EMPTY_CALCULATOR_STATE: CalculatorState = {
  rawCost: '',
  costs: [],
  gstChoice: '18',
  customGst: '',
  sellingPrice: '',
  targetMode: 'MARGIN_PERCENT',
  targetValue: '',
};

export function toJson(state: CalculatorState): Json {
  return {
    ...state,
    costs: state.costs.map(({ label, type, amount }) => ({ label, type, amount })),
  };
}

/** Reads a saved `inputs` blob defensively — anything missing or malformed falls back to empty. */
export function stateFromJson(json: Json): CalculatorState {
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  const str = (key: string, fallback: string) =>
    typeof obj[key] === 'string' ? (obj[key] as string) : fallback;
  const costs = Array.isArray(obj.costs) ? obj.costs : [];

  return {
    rawCost: str('rawCost', EMPTY_CALCULATOR_STATE.rawCost),
    gstChoice: str('gstChoice', EMPTY_CALCULATOR_STATE.gstChoice),
    customGst: str('customGst', EMPTY_CALCULATOR_STATE.customGst),
    sellingPrice: str('sellingPrice', EMPTY_CALCULATOR_STATE.sellingPrice),
    targetValue: str('targetValue', EMPTY_CALCULATOR_STATE.targetValue),
    targetMode: obj.targetMode === 'PROFIT_AMOUNT' ? 'PROFIT_AMOUNT' : 'MARGIN_PERCENT',
    // Fresh ids on load so cost rows never collide with ones already on screen.
    costs: costs.flatMap((c) => {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return [];
      return [
        {
          id: newCostLineId(),
          label: typeof c.label === 'string' ? c.label : '',
          type: c.type === 'PERCENT_OF_PRICE' ? 'PERCENT_OF_PRICE' : 'FIXED',
          amount: typeof c.amount === 'number' && Number.isFinite(c.amount) ? c.amount : 0,
        } satisfies CostLine,
      ];
    }),
  };
}

function num(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

export function costInputsFromState(state: CalculatorState): CostInputs {
  const gst = state.gstChoice === '__custom__' ? num(state.customGst) : num(state.gstChoice);
  return {
    rawCost: num(state.rawCost),
    additionalCosts: state.costs,
    gstRatePercent: Math.min(100, Math.max(0, gst)),
  };
}

/**
 * Per-unit cost of a saved calculation. Percentage costs depend on a selling price, so this uses
 * the calculation's own selling price, else the price its target solves to; with neither, only
 * fixed costs are known and `breakdown` is null.
 */
export function unitCostFromState(state: CalculatorState): {
  unitCost: number;
  breakdown: PriceBreakdown | null;
} {
  const inputs = costInputsFromState(state);
  let breakdown: PriceBreakdown | null = null;
  if (state.sellingPrice.trim()) {
    breakdown = breakdownFromSellingPrice(inputs, num(state.sellingPrice));
  } else if (state.targetValue.trim()) {
    const result = priceForTarget(inputs, {
      mode: state.targetMode,
      value: num(state.targetValue),
    });
    if (result.ok) breakdown = result.breakdown;
  }
  const fixedOnly =
    inputs.rawCost +
    inputs.additionalCosts.filter((c) => c.type === 'FIXED').reduce((sum, c) => sum + c.amount, 0);
  return { unitCost: breakdown ? breakdown.totalCost : fixedOnly, breakdown };
}
