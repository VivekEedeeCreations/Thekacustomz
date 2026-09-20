let audio: AudioContext | undefined;

export type BeepKind = 'ok' | 'warn' | 'error';

const TONES: Record<BeepKind, { hz: number; seconds: number }> = {
  ok: { hz: 880, seconds: 0.14 },
  warn: { hz: 520, seconds: 0.2 },
  error: { hz: 220, seconds: 0.4 },
};

/**
 * Short audible cue for scan results, so the operator doesn't have to look at the
 * screen for every parcel. Silently does nothing where audio isn't available.
 */
export function beep(kind: BeepKind): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();

    const { hz, seconds } = TONES[kind];
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = hz;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + seconds);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + seconds + 0.05);
  } catch {
    // Audio blocked or unsupported — the on-screen result is still shown.
  }
}
