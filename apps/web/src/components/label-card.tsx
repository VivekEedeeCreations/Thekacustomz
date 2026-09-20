import type { CSSProperties } from 'react';
import type { BarcodeSymbology } from '@inventory/shared';

import { BarcodeSvg } from '@/components/barcode-svg';
import { formatCurrency } from '@/lib/format';
import { clampMm, type LabelSettings } from '@/lib/label-settings';

export interface LabelContent {
  name: string;
  price: number;
  barcode: string;
  symbology: BarcodeSymbology;
}

const clampLines = (lines: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

/**
 * One printable label. Everything is sized in millimetres via inline styles
 * (not Tailwind) so the on-screen preview and the printed label are identical.
 *
 * - horizontal: name on top, bars across the middle, code + price underneath.
 * - vertical: bars rotated 90° down the left edge, text column on the right.
 */
export function LabelCard({
  content,
  settings,
  bordered = false,
}: {
  content: LabelContent;
  settings: LabelSettings;
  bordered?: boolean;
}) {
  const w = clampMm(settings.widthMm);
  const h = clampMm(settings.heightMm);
  const pad = Math.max(1, Math.min(w, h) * 0.05);
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const textMm = Math.min(4, Math.max(1.8, Math.min(w, h) * 0.11));
  const codeMm = textMm * 0.85;
  const gap = pad * 0.6;

  const outer: CSSProperties = {
    width: `${w}mm`,
    height: `${h}mm`,
    padding: `${pad}mm`,
    boxSizing: 'border-box',
    overflow: 'hidden',
    background: '#fff',
    color: '#000',
    fontSize: `${textMm}mm`,
    lineHeight: 1.15,
    breakInside: 'avoid',
    border: bordered ? '0.1mm solid #999' : 'none',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  };

  const codeAndPrice = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: `${gap}mm`,
        fontSize: `${codeMm}mm`,
      }}
    >
      <span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.02em' }}>
        {content.barcode}
      </span>
      <span style={{ fontWeight: 600 }}>{formatCurrency(content.price)}</span>
    </div>
  );

  if (settings.barcodeOrientation === 'vertical') {
    // Bar length runs along the label's height; bar height is bw.
    const bw = Math.max(5, Math.min(Math.max(8, Math.min(30, iw * 0.42)), iw - 10));
    return (
      <div style={{ ...outer, display: 'flex', gap: `${gap}mm` }}>
        <div style={{ position: 'relative', width: `${bw}mm`, height: `${ih}mm`, flex: 'none' }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${ih}mm`,
              height: `${bw}mm`,
              transformOrigin: 'top left',
              transform: `translateX(${bw}mm) rotate(90deg)`,
            }}
          >
            <BarcodeSvg
              value={content.barcode}
              symbology={content.symbology}
              fit
              className="block h-full w-full"
            />
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, ...clampLines(4), wordBreak: 'break-word' }}>
            {content.name}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: `${codeMm}mm` }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
              {content.barcode}
            </span>
            <span style={{ fontWeight: 600, fontSize: `${textMm}mm` }}>
              {formatCurrency(content.price)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...outer, display: 'flex', flexDirection: 'column', gap: `${gap}mm` }}>
      <p
        style={{ margin: 0, fontWeight: 600, textAlign: 'center', ...clampLines(h >= 40 ? 2 : 1) }}
      >
        {content.name}
      </p>
      {/* Positioned so the SVG has a definite box to stretch into (percentage heights don't resolve inside a flex item). */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <BarcodeSvg
          value={content.barcode}
          symbology={content.symbology}
          fit
          className="absolute inset-0 block h-full w-full"
        />
      </div>
      {codeAndPrice}
    </div>
  );
}
