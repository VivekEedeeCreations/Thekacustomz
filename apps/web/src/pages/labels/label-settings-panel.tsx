import { ArrowLeftRight } from 'lucide-react';

import { LabelCard, type LabelContent } from '@/components/label-card';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  clampMm,
  LABEL_SIZE_LIMITS,
  LABEL_SIZE_PRESETS,
  type BarcodeOrientation,
  type LabelPrintMode,
  type LabelSettings,
} from '@/lib/label-settings';

const CUSTOM = 'custom';
const PX_PER_MM = 96 / 25.4;
const PREVIEW_MAX = { width: 340, height: 230 };

/** Placeholder shown in the preview when nothing has been added to the batch yet. */
const SAMPLE: LabelContent = {
  name: 'Sample product name',
  price: 499,
  barcode: '2000000000015',
  symbology: 'EAN13',
};

export function LabelSettingsPanel({
  settings,
  onChange,
  sample,
}: {
  settings: LabelSettings;
  onChange: (next: LabelSettings) => void;
  sample?: LabelContent;
}) {
  const w = clampMm(settings.widthMm);
  const h = clampMm(settings.heightMm);
  const presetKey =
    LABEL_SIZE_PRESETS.find((p) => p.widthMm === w && p.heightMm === h)?.key ?? CUSTOM;

  // Scale the (mm-sized) label up/down so the preview always fits its box.
  const scale = Math.min(
    PREVIEW_MAX.width / (w * PX_PER_MM),
    PREVIEW_MAX.height / (h * PX_PER_MM),
    4,
  );

  const set = (patch: Partial<LabelSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="mb-6 grid gap-6 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Label settings</h3>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_1fr_auto_1fr] sm:items-end">
          <div className="space-y-1.5">
            <Label>Label size</Label>
            <Select
              value={presetKey}
              onValueChange={(key) => {
                const preset = LABEL_SIZE_PRESETS.find((p) => p.key === key);
                if (preset) set({ widthMm: preset.widthMm, heightMm: preset.heightMm });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_SIZE_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="label-width">Width (mm)</Label>
            <Input
              id="label-width"
              type="number"
              inputMode="decimal"
              step="0.5"
              min={LABEL_SIZE_LIMITS.min}
              max={LABEL_SIZE_LIMITS.max}
              value={settings.widthMm}
              onChange={(e) => set({ widthMm: e.target.valueAsNumber })}
              onBlur={() => set({ widthMm: clampMm(settings.widthMm) })}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Swap width and height"
            title="Swap width and height (portrait / landscape)"
            onClick={() => set({ widthMm: h, heightMm: w })}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="label-height">Height (mm)</Label>
            <Input
              id="label-height"
              type="number"
              inputMode="decimal"
              step="0.5"
              min={LABEL_SIZE_LIMITS.min}
              max={LABEL_SIZE_LIMITS.max}
              value={settings.heightMm}
              onChange={(e) => set({ heightMm: e.target.valueAsNumber })}
              onBlur={() => set({ heightMm: clampMm(settings.heightMm) })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Barcode orientation</Label>
            <Tabs
              value={settings.barcodeOrientation}
              onValueChange={(v) => set({ barcodeOrientation: v as BarcodeOrientation })}
            >
              <TabsList className="w-full">
                <TabsTrigger value="horizontal" className="flex-1">
                  Horizontal
                </TabsTrigger>
                <TabsTrigger value="vertical" className="flex-1">
                  Vertical
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-1.5">
            <Label>Print layout</Label>
            <Select
              value={settings.printMode}
              onValueChange={(v) => set({ printMode: v as LabelPrintMode })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sheet">Tiled on A4 sheet</SelectItem>
                <SelectItem value="roll">One label per page (label printer)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {settings.printMode === 'roll'
            ? 'The page is sized to the label automatically. In the print dialog, pick your label printer and set margins to None.'
            : 'Labels are tiled across A4 pages. Very small labels may be too small for scanners to read.'}
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 md:items-center">
        <span className="text-xs text-muted-foreground">
          Preview ({w} × {h} mm{sample ? '' : ', sample'})
        </span>
        <div
          className="overflow-hidden rounded-sm border bg-white shadow-sm"
          style={{ width: w * PX_PER_MM * scale, height: h * PX_PER_MM * scale }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <LabelCard content={sample ?? SAMPLE} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  );
}
