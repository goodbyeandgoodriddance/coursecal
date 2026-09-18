/**
 * A single, deliberately understated completion sound.
 *
 * Synthesized with the Web Audio API rather than shipped as an audio file: it
 * keeps the repository free of binary assets, adds nothing to the download,
 * and means the cue can never fail to load.
 *
 * The brief is "subtle encouragement", so the design is restrained on purpose:
 * two soft sine tones a perfect fifth apart, the second entering slightly
 * after the first, at low gain with a fast attack and a gentle decay. A sine
 * has no harmonics to sound harsh, and the fifth is consonant, so it reads as
 * a quiet confirmation rather than a notification demanding attention.
 */

/** Peak gain per voice. Low on purpose — this should sit under the room. */
const PEAK_GAIN = 0.045;
/** Seconds. Short enough that ticking several things off never overlaps badly. */
const DURATION = 0.28;
/** A4 and the E above it: a perfect fifth. */
const NOTES = [440, 659.25];
/** Seconds the upper note trails the lower, so it blooms rather than clicks. */
const STAGGER = 0.055;

/**
 * Lazily created and reused. Constructing an AudioContext per play leaks
 * contexts, and browsers cap how many may exist at once.
 */
let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  try {
    context ??= new Ctor();
    return context;
  } catch {
    // Audio is a nicety; never let its absence break completing a task.
    return null;
  }
}

/**
 * Plays the completion cue. Safe to call unconditionally — it silently does
 * nothing when the platform has no audio, and never throws.
 */
export function playCompletionSound(): void {
  const ctx = getContext();
  if (!ctx) return;

  try {
    // Autoplay policy can leave the context suspended until a user gesture;
    // this is always called from a click, so resuming here is allowed.
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime;

    NOTES.forEach((frequency, index) => {
      const at = start + index * STAGGER;

      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      // Set directly rather than scheduling: the pitch is constant for this
      // oscillator's whole life, so there is nothing to automate.
      oscillator.frequency.value = frequency;

      const gain = ctx.createGain();
      // Start from silence: jumping straight to peak produces an audible click.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + DURATION);

      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + DURATION + 0.02);
    });
  } catch {
    // Ignore: a failed cue must never surface as an error to the user.
  }
}

/** Releases the shared context. Only needed by tests. */
export function disposeSoundContext(): void {
  void context?.close().catch(() => undefined);
  context = null;
}
