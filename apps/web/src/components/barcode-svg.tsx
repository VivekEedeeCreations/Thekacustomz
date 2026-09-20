import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import type { BarcodeSymbology } from '@inventory/shared';

import { toJsBarcodeFormat } from '@/lib/barcode-format';

/** Quiet zone (in barcode modules) kept clear on each side in `fit` mode so it still scans. */
const FIT_QUIET_ZONE = 10;

export function BarcodeSvg({
  value,
  symbology,
  height = 60,
  fit = false,
  className,
}: {
  value: string;
  symbology: BarcodeSymbology;
  height?: number;
  /**
   * Fit mode: render just the bars (no printed digits) and stretch the SVG to
   * fill its container, so the caller controls the physical size. Use with a
   * sized parent; put the human-readable value in your own markup.
   */
  fit?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const format = toJsBarcodeFormat(symbology);

  useEffect(() => {
    if (!ref.current || !format) return;
    try {
      if (fit) {
        JsBarcode(ref.current, value, {
          format,
          width: 1,
          height: 50,
          displayValue: false,
          margin: 0,
          marginLeft: FIT_QUIET_ZONE,
          marginRight: FIT_QUIET_ZONE,
        });
        // JsBarcode sets a viewBox; let CSS size win and stretch to the box.
        ref.current.removeAttribute('width');
        ref.current.removeAttribute('height');
        ref.current.setAttribute('preserveAspectRatio', 'none');
      } else {
        JsBarcode(ref.current, value, {
          format,
          height,
          displayValue: true,
          fontSize: 14,
          margin: 4,
        });
      }
    } catch {
      // Invalid value for this symbology (e.g. non-numeric EAN13) — leave blank.
    }
  }, [value, format, height, fit]);

  if (!format) {
    return (
      <div className={className}>
        <p className="font-mono text-sm">{value}</p>
        <p className="text-xs text-muted-foreground">{symbology} preview not supported</p>
      </div>
    );
  }

  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}
