import type { BarcodeSymbology } from '@inventory/shared';

/**
 * JsBarcode only renders 1D symbologies. Maps our DB enum to a JsBarcode format
 * string, or `null` when the symbology has no 1D rendering (QR/DataMatrix are
 * 2D and need a different renderer, out of scope for this pass).
 */
export function toJsBarcodeFormat(symbology: BarcodeSymbology): string | null {
  switch (symbology) {
    case 'EAN13':
      return 'EAN13';
    case 'EAN8':
      return 'EAN8';
    case 'UPCA':
      return 'UPC';
    case 'UPCE':
      return 'UPCE';
    case 'CODE128':
    case 'GS1_128':
      return 'CODE128';
    case 'CODE39':
      return 'CODE39';
    case 'ITF14':
      return 'ITF14';
    default:
      return null;
  }
}
