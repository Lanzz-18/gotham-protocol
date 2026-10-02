let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!ctx && typeof AudioContext !== "undefined") ctx = new AudioContext();
  return ctx;
}

/** Short tick on a successful log. Generated, no audio files. */
export function ping(enabled: boolean): void {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "triangle";
  o.frequency.value = 660;
  o.connect(g);
  g.connect(a.destination);
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.15, a.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.18);
  o.frequency.exponentialRampToValueAtTime(990, a.currentTime + 0.12);
  o.start();
  o.stop(a.currentTime + 0.2);
}

/**
 * The opening swarm: filtered noise chopped at a wingbeat rate for the
 * flutter, under a low swell. Must be called from inside the key/tap that
 * starts it — browsers won't play audio before a user gesture.
 */
export function swarmSound(enabled: boolean): void {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  void a.resume();
  const t = a.currentTime;

  const len = Math.round(a.sampleRate * 2.2);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = a.createBufferSource();
  noise.buffer = buf;

  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 900;
  band.Q.value = 0.8;

  // Wingbeats: an LFO pumping the gain of the noise.
  const beat = a.createGain();
  beat.gain.value = 0.5;
  const lfo = a.createOscillator();
  lfo.frequency.value = 15;
  const lfoDepth = a.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth);
  lfoDepth.connect(beat.gain);

  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.22, t + 0.25);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);

  noise.connect(band);
  band.connect(beat);
  beat.connect(env);
  env.connect(a.destination);

  const swell = a.createOscillator();
  swell.type = "sine";
  swell.frequency.value = 55;
  const sg = a.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.16, t + 0.7);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  swell.connect(sg);
  sg.connect(a.destination);

  noise.start(t);
  lfo.start(t);
  swell.start(t);
  noise.stop(t + 2.2);
  lfo.stop(t + 2.2);
  swell.stop(t + 2.3);
}

/** A cell door slamming: a hard metallic hit with a short ring-out. */
export function clang(enabled: boolean): void {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  [[220, "square", 0.09], [331, "triangle", 0.12], [587, "triangle", 0.06]].forEach(([f, type, peak]) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type as OscillatorType;
    o.frequency.setValueAtTime(f as number, t);
    o.frequency.exponentialRampToValueAtTime((f as number) * 0.94, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak as number, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + 0.7);
  });
}

/** Four-note rank-up stinger. */
export function stinger(enabled: boolean): void {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  [110, 164.8, 220, 329.6].forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = i > 2 ? "sawtooth" : "triangle";
    o.frequency.value = f;
    o.connect(g);
    g.connect(a.destination);
    const st = t + i * 0.09;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.18, st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.9);
    o.start(st);
    o.stop(st + 0.95);
  });
}
