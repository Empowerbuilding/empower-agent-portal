/**
 * lib/sounds.ts — In-app audio feedback
 * Uses Web Audio API — no audio files needed.
 * Discord-inspired: subtle, soft, non-intrusive.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Short soft pop — played when the user sends a message */
export function playSend() {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, ac.currentTime + 0.08);
  gain.gain.setValueAtTime(0.18, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.12);
}

/** Gentle two-tone ding — played when an agent/system message arrives */
export function playReceive() {
  const ac = getCtx();
  if (!ac) return;

  const play = (freq: number, startOffset: number) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ac.currentTime + startOffset);
    gain.gain.setValueAtTime(0.0001, ac.currentTime + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.15, ac.currentTime + startOffset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startOffset + 0.35);
    osc.start(ac.currentTime + startOffset);
    osc.stop(ac.currentTime + startOffset + 0.35);
  };

  play(880, 0);
  play(1100, 0.12);
}

/** Initialize (or resume) AudioContext — must be called from a user gesture */
export function unlockAudio() {
  const ac = getCtx();
  if (ac && ac.state === 'suspended') ac.resume();
}
