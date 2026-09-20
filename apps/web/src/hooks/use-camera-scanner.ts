import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';

/**
 * Continuously decodes barcodes from the device camera into a <video> element.
 * Mount the returned `videoRef` on a <video> tag while `enabled` is true.
 * `delayBetweenScanSuccess` throttles repeat callbacks so holding a code in
 * frame doesn't fire `onDetected` dozens of times per second.
 */
export function useCameraScanner(enabled: boolean, onDetected: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      return undefined;
    }
    if (!videoRef.current) return undefined;

    // getUserMedia is only available in a secure context (HTTPS, or localhost).
    // Opening the app from a phone via a plain-http LAN address (a common way
    // to test on a real device) silently loses `navigator.mediaDevices` — give
    // a clear reason instead of a cryptic "getUserMedia is not a function".
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Camera access needs HTTPS (or localhost). Use the barcode field below instead, or serve this page over HTTPS to test the camera on a phone.',
      );
      return undefined;
    }

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanSuccess: 1200,
    });
    let controls: IScannerControls | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) onDetectedRef.current(result.getText());
      })
      .then((c) => {
        if (cancelled) {
          c.stop();
        } else {
          controls = c;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not access the camera');
        }
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [enabled]);

  return { videoRef, error };
}
