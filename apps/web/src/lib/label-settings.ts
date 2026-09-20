export type BarcodeOrientation = 'horizontal' | 'vertical';

/** roll = one label per page (thermal/label printers); sheet = labels tiled on A4. */
export type LabelPrintMode = 'roll' | 'sheet';

export interface LabelSettings {
  widthMm: number;
  heightMm: number;
  barcodeOrientation: BarcodeOrientation;
  printMode: LabelPrintMode;
}

export const LABEL_SIZE_LIMITS = { min: 15, max: 300 } as const;

export const LABEL_SIZE_PRESETS: {
  key: string;
  label: string;
  widthMm: number;
  heightMm: number;
}[] = [
  { key: '38x25', label: '38 × 25 mm', widthMm: 38, heightMm: 25 },
  { key: '50x25', label: '50 × 25 mm', widthMm: 50, heightMm: 25 },
  { key: '50x30', label: '50 × 30 mm', widthMm: 50, heightMm: 30 },
  { key: '60x40', label: '60 × 40 mm', widthMm: 60, heightMm: 40 },
  { key: '100x50', label: '100 × 50 mm', widthMm: 100, heightMm: 50 },
  { key: '100x150', label: '100 × 150 mm', widthMm: 100, heightMm: 150 },
];

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  widthMm: 50,
  heightMm: 30,
  barcodeOrientation: 'horizontal',
  printMode: 'sheet',
};

const STORAGE_KEY = 'inventory.label-settings.v1';

export function clampMm(value: number): number {
  if (!Number.isFinite(value)) return LABEL_SIZE_LIMITS.min;
  return Math.min(LABEL_SIZE_LIMITS.max, Math.max(LABEL_SIZE_LIMITS.min, value));
}

/** Loads saved settings, falling back to defaults for anything missing or invalid. */
export function loadLabelSettings(): LabelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LABEL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LabelSettings>;
    return {
      widthMm: clampMm(Number(parsed.widthMm ?? DEFAULT_LABEL_SETTINGS.widthMm)),
      heightMm: clampMm(Number(parsed.heightMm ?? DEFAULT_LABEL_SETTINGS.heightMm)),
      barcodeOrientation: parsed.barcodeOrientation === 'vertical' ? 'vertical' : 'horizontal',
      printMode: parsed.printMode === 'roll' ? 'roll' : 'sheet',
    };
  } catch {
    return DEFAULT_LABEL_SETTINGS;
  }
}

export function saveLabelSettings(settings: LabelSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode etc.) — settings just won't persist.
  }
}
