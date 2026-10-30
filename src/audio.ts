// Tiny procedural sound engine — every effect is synthesized with WebAudio, no asset files.

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

export function initAudio(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.45;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function env(g: GainNode, t: number, vol: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function noise(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass', q = 0.7, freqEnd?: number, delay = 0): void {
  if (!ctx || vol <= 0.001) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  env(g, t, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.05);
}

function tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0): void {
  if (!ctx || vol <= 0.001) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  const g = ctx.createGain();
  env(g, t, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  rifle() { noise(0.13, 3200, 0.5, 'lowpass', 0.8, 400); tone(170, 45, 0.09, 0.3, 'square'); },
  shotgun() { noise(0.42, 2400, 0.9, 'lowpass', 0.6, 180); tone(110, 28, 0.28, 0.55, 'sawtooth'); },
  rail() { tone(2200, 110, 0.55, 0.22, 'sawtooth'); tone(4200, 900, 0.3, 0.1, 'square'); noise(0.5, 7000, 0.3, 'highpass', 0.5); },
  hit() { tone(1300, 1700, 0.04, 0.1, 'square'); },
  head() { tone(2300, 3100, 0.07, 0.16, 'triangle'); tone(1150, 1500, 0.05, 0.08, 'square'); },
  kill() { tone(440, 55, 0.3, 0.22, 'sawtooth'); noise(0.22, 900, 0.22, 'bandpass', 2); },
  hurt() { tone(230, 70, 0.22, 0.4, 'square'); noise(0.18, 600, 0.35); },
  reload() { tone(900, 700, 0.04, 0.1, 'square'); tone(500, 400, 0.05, 0.1, 'square', 0.16); tone(1300, 1150, 0.04, 0.1, 'square', 0.3); },
  empty() { tone(1500, 1500, 0.03, 0.07, 'square'); },
  swap() { noise(0.08, 2500, 0.15, 'bandpass', 2); tone(700, 900, 0.05, 0.06, 'square', 0.06); },
  pickup() { tone(600, 1200, 0.12, 0.18, 'triangle'); tone(900, 1800, 0.12, 0.14, 'triangle', 0.08); },
  jump() { noise(0.08, 500, 0.08, 'lowpass'); },
  land() { noise(0.1, 300, 0.15, 'lowpass'); },
  wave() { tone(55, 55, 1.1, 0.3, 'sawtooth'); tone(82, 82, 1.0, 0.22, 'sawtooth', 0.12); tone(110, 104, 1.2, 0.2, 'square', 0.25); },
  clear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, 0.14, 'triangle', i * 0.09)); },
  spit(v: number) { noise(0.26, 1800, 0.3 * v, 'bandpass', 4, 500); },
  splat(v: number) { noise(0.2, 900, 0.25 * v, 'bandpass', 2, 200); },
  growl(v: number) { tone(95 + Math.random() * 30, 50, 0.5, 0.14 * v, 'sawtooth'); noise(0.45, 320, 0.12 * v, 'lowpass', 4); },
  swing(v: number) { noise(0.14, 900, 0.2 * v, 'bandpass', 1.5, 3200); },
  gameOver() { tone(220, 40, 1.6, 0.35, 'sawtooth'); tone(330, 50, 1.6, 0.2, 'square', 0.1); },
};
