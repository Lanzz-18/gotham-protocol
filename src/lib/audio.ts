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
