import { useId, useMemo, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PricingCalculation } from '@/features/pricing-calculations/queries';
import { formatCurrency } from '@/lib/format';
import {
  breakdownFromSellingPrice,
  GST_SLABS,
  newCostLineId,
  priceForTarget,
  type CostLine,
  type CostType,
  type PriceBreakdown,
  type PriceTarget,
} from '@/lib/pricing-calculator';

import { EMPTY_CALCULATOR_STATE, stateFromJson, type CalculatorState } from './calculator-state';
import { SaveCalculationDialog, SavedCalculationsList } from './saved-calculations';

const CUSTOM_GST = '__custom__';

/** Parses a number input, treating blank/invalid as 0 so partial typing never crashes the math. */
function toNumber(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function CostRow({
  line,
  onChange,
  onRemove,
}: {
  line: CostLine;
  onChange: (line: CostLine) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
      <Input
        aria-label="Cost label"
        placeholder="e.g. Packaging, Amazon commission"
        className="min-w-40 flex-1"
        value={line.label}
        onChange={(e) => onChange({ ...line, label: e.target.value })}
      />
      <Select value={line.type} onValueChange={(v) => onChange({ ...line, type: v as CostType })}>
        <SelectTrigger className="w-40 shrink-0" aria-label="Cost type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="FIXED">Fixed ₹</SelectItem>
          <SelectItem value="PERCENT_OF_PRICE">% of selling price</SelectItem>
        </SelectContent>
      </Select>
      <div className="relative w-28 shrink-0">
        {line.type === 'FIXED' ? (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
            ₹
          </span>
        ) : null}
        <Input
          type="number"
          step="0.01"
          min="0"
          aria-label="Cost amount"
          className={line.type === 'FIXED' ? 'pl-6' : 'pr-6'}
          value={line.amount || ''}
          onChange={(e) => onChange({ ...line, amount: toNumber(e.target.value) })}
        />
        {line.type === 'PERCENT_OF_PRICE' ? (
          <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">
            %
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${line.label || 'cost'}`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function BreakdownList({
  breakdown,
  gstRatePercent,
}: {
  breakdown: PriceBreakdown;
  gstRatePercent: number;
}) {
  const loss = breakdown.profit < 0;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Selling price (what the customer pays)</span>
        <span className="font-medium">{formatCurrency(breakdown.sellingPrice)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          GST ({gstRatePercent}%, included in the price)
        </span>
        <span>− {formatCurrency(breakdown.gstAmount)}</span>
      </div>
      <div className="flex justify-between border-t pt-2">
        <span className="text-muted-foreground">Taxable value (your actual receipt)</span>
        <span className="font-medium">{formatCurrency(breakdown.taxableValue)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Fixed costs (raw material + others)</span>
        <span>− {formatCurrency(breakdown.fixedCostTotal)}</span>
      </div>
      {breakdown.percentCostTotal > 0 ? (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Percentage-based costs</span>
          <span>− {formatCurrency(breakdown.percentCostTotal)}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t pt-2">
        <span className="font-medium">{loss ? 'Loss' : 'Profit'}</span>
        <span
          className={
            loss
              ? 'font-semibold text-destructive'
              : 'font-semibold text-emerald-600 dark:text-emerald-500'
          }
        >
          {formatCurrency(breakdown.profit)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Badge variant={loss ? 'destructive' : 'success'}>
          Margin {breakdown.marginPercent.toFixed(1)}%
        </Badge>
        {breakdown.markupPercent != null ? (
          <Badge variant="outline">Markup {breakdown.markupPercent.toFixed(1)}% on cost</Badge>
        ) : null}
      </div>
    </div>
  );
}

export function PricingCalculatorPage() {
  const rawCostId = useId();
  const [rawCost, setRawCost] = useState('');
  const [costs, setCosts] = useState<CostLine[]>([]);
  const [gstChoice, setGstChoice] = useState<string>('18');
  const [customGst, setCustomGst] = useState('');
  const [sellingPriceInput, setSellingPriceInput] = useState('');
  const [targetMode, setTargetMode] = useState<PriceTarget['mode']>('MARGIN_PERCENT');
  const [targetValueInput, setTargetValueInput] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [loaded, setLoaded] = useState<PricingCalculation | null>(null);

  const snapshot: CalculatorState = {
    rawCost,
    costs,
    gstChoice,
    customGst,
    sellingPrice: sellingPriceInput,
    targetMode,
    targetValue: targetValueInput,
  };

  const applyState = (state: CalculatorState) => {
    setRawCost(state.rawCost);
    setCosts(state.costs);
    setGstChoice(state.gstChoice);
    setCustomGst(state.customGst);
    setSellingPriceInput(state.sellingPrice);
    setTargetMode(state.targetMode);
    setTargetValueInput(state.targetValue);
  };

  const loadCalculation = (calc: PricingCalculation) => {
    applyState(stateFromJson(calc.inputs));
    setLoaded(calc);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startNew = () => {
    applyState(EMPTY_CALCULATOR_STATE);
    setLoaded(null);
  };

  const gstRatePercent = Math.min(
    100,
    Math.max(0, gstChoice === CUSTOM_GST ? toNumber(customGst) : toNumber(gstChoice)),
  );

  const inputs = useMemo(
    () => ({
      rawCost: toNumber(rawCost),
      additionalCosts: costs,
      gstRatePercent,
    }),
    [rawCost, costs, gstRatePercent],
  );

  const addCost = () =>
    setCosts((prev) => [
      ...prev,
      { id: newCostLineId(), label: '', type: 'FIXED' as CostType, amount: 0 },
    ]);
  const updateCost = (id: string, next: CostLine) =>
    setCosts((prev) => prev.map((c) => (c.id === id ? next : c)));
  const removeCost = (id: string) => setCosts((prev) => prev.filter((c) => c.id !== id));

  const sellingPrice = toNumber(sellingPriceInput);
  const fromPrice = sellingPriceInput.trim()
    ? breakdownFromSellingPrice(inputs, sellingPrice)
    : null;

  const targetValue = toNumber(targetValueInput);
  const forTarget = targetValueInput.trim()
    ? priceForTarget(inputs, { mode: targetMode, value: targetValue })
    : null;

  return (
    <div>
      <PageHeader
        title="Price calculator"
        description="Work out your margin from a selling price, or find the selling price for a target margin. Save a calculation to come back to it — copy a result into a product's price yourself."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startNew}>
              <RotateCcw className="h-4 w-4" />
              New
            </Button>
            <RoleGate min="STAFF">
              <Button size="sm" onClick={() => setSaveOpen(true)}>
                <Save className="h-4 w-4" />
                Save
              </Button>
            </RoleGate>
          </div>
        }
      />

      {loaded ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Editing saved calculation{' '}
          <span className="font-medium text-foreground">{loaded.title}</span>. Changes aren&apos;t
          saved until you press Save.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-medium">Costs</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor={rawCostId}>Raw material cost</Label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id={rawCostId}
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-7"
                    placeholder="0.00"
                    value={rawCost}
                    onChange={(e) => setRawCost(e.target.value)}
                  />
                </div>
              </div>

              {costs.length > 0 ? (
                <div className="space-y-2">
                  <Label>Additional costs</Label>
                  {costs.map((line) => (
                    <CostRow
                      key={line.id}
                      line={line}
                      onChange={(next) => updateCost(line.id, next)}
                      onRemove={() => removeCost(line.id)}
                    />
                  ))}
                </div>
              ) : null}

              <Button type="button" variant="outline" size="sm" onClick={addCost}>
                <Plus className="h-4 w-4" />
                Add a cost
              </Button>
              <p className="text-xs text-muted-foreground">
                For an e-commerce seller: packaging, shipping to the warehouse, marketplace
                commission, payment gateway fees. Fixed costs are a flat ₹ amount; percentage costs
                (like a marketplace&apos;s commission) are computed on the selling price below.
              </p>

              <div>
                <Label>GST rate</Label>
                <div className="mt-1.5 flex gap-2">
                  <Select value={gstChoice} onValueChange={setGstChoice}>
                    <SelectTrigger className="w-32" aria-label="GST rate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GST_SLABS.map((slab) => (
                        <SelectItem key={slab} value={String(slab)}>
                          {slab}%
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_GST}>Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  {gstChoice === CUSTOM_GST ? (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="w-28"
                      placeholder="%"
                      value={customGst}
                      onChange={(e) => setCustomGst(e.target.value)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="mb-1 text-sm font-medium">From a selling price</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Enter the GST-inclusive price the customer pays, and see your margin.
            </p>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                ₹
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                aria-label="Selling price"
                className="pl-7"
                placeholder="e.g. 499"
                value={sellingPriceInput}
                onChange={(e) => setSellingPriceInput(e.target.value)}
              />
            </div>
            {fromPrice ? (
              <div className="mt-4">
                <BreakdownList breakdown={fromPrice} gstRatePercent={gstRatePercent} />
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="mb-1 text-sm font-medium">For a target profit</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Enter what you want to make — as a margin % of the selling price, or a fixed ₹ amount
              per unit — and find the price to charge.
            </p>
            <div className="flex gap-2">
              <Select
                value={targetMode}
                onValueChange={(v) => setTargetMode(v as PriceTarget['mode'])}
              >
                <SelectTrigger className="w-40 shrink-0" aria-label="Target type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARGIN_PERCENT">Margin %</SelectItem>
                  <SelectItem value="PROFIT_AMOUNT">Profit amount ₹</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                {targetMode === 'PROFIT_AMOUNT' ? (
                  <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                    ₹
                  </span>
                ) : null}
                <Input
                  type="number"
                  step={targetMode === 'MARGIN_PERCENT' ? '0.1' : '0.01'}
                  min="0"
                  max={targetMode === 'MARGIN_PERCENT' ? '99' : undefined}
                  aria-label="Target value"
                  className={targetMode === 'PROFIT_AMOUNT' ? 'pl-7' : 'pr-7'}
                  placeholder={targetMode === 'MARGIN_PERCENT' ? 'e.g. 30' : 'e.g. 150'}
                  value={targetValueInput}
                  onChange={(e) => setTargetValueInput(e.target.value)}
                />
                {targetMode === 'MARGIN_PERCENT' ? (
                  <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">
                    %
                  </span>
                ) : null}
              </div>
            </div>
            {forTarget ? (
              forTarget.ok ? (
                <div className="mt-4">
                  <BreakdownList breakdown={forTarget.breakdown} gstRatePercent={gstRatePercent} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-destructive">{forTarget.reason}</p>
              )
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SavedCalculationsList
          currentId={loaded?.id ?? null}
          onLoad={loadCalculation}
          onDeleted={(id) => {
            if (loaded?.id === id) setLoaded(null);
          }}
        />
      </div>

      <SaveCalculationDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        state={snapshot}
        current={loaded}
        onSaved={setLoaded}
      />
    </div>
  );
}
