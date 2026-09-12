/**
 * Smooth UI sounds (ticket 075) — Web Audio API synthesized, no audio files.
 * Soft sine/triangle tones with gentle envelopes; master mute persisted in
 * localStorage (`odv_sound_muted`). The AudioContext is created lazily on
 * the first user gesture (browser autoplay policy).
 */

const MUTE_KEY = 'odv_sound_muted';

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One smooth tone: sine wave, soft attack/release envelope, low volume. */
function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
  const c = ensureCtx();
  if (!c || muted) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sound = {
  /** Soft nav/click blip. */
  click(): void {
    tone(520, 0, 0.12, 0.05);
  },

  /** Gentle two-note success chime. */
  success(): void {
    tone(660, 0, 0.18, 0.06);
    tone(880, 0.09, 0.22, 0.05);
  },

  /** Low, soft error tone (not harsh). */
  error(): void {
    tone(220, 0, 0.25, 0.06, 'triangle');
    tone(180, 0.08, 0.3, 0.05, 'triangle');
  },

  /** Soft ping for notifications (Notify feature hooks in here). */
  notify(): void {
    tone(740, 0, 0.2, 0.05);
    tone(988, 0.12, 0.25, 0.04);
  },

  isMuted(): boolean {
    return muted;
  },

  setMuted(m: boolean): void {
    muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // storage unavailable — mute still applies for this session
    }
  },

  toggle(): boolean {
    const next = !muted;
    sound.setMuted(next);
    if (!next) sound.click(); // audible confirmation when unmuting
    return next;
  },
};