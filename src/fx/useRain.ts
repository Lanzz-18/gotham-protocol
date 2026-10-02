import { useEffect, useRef, type RefObject } from "react";

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
  a: number;
}

const WIND = 0.18; // sideways drift per unit fallen

/**
 * Light Gotham rain on a canvas, plus a rare lightning strike: every 12–30s
 * the `flashHost` element gets a `flash` class in a quick double flicker, and
 * its CSS decides what lights up (the hall brightens its villains, the menu
 * its plate). Does nothing at all when `enabled` is false.
 */
export function useRain(enabled: boolean, flashHost: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !enabled) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const host0 = flashHost.current;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let drops: Drop[] = [];
    let raf = 0;
    let last = performance.now();
    const timers: number[] = [];

    const make = (seed: boolean): Drop => ({
      x: Math.random() * (w + 80) - 40,
      y: seed ? Math.random() * h : -30 - Math.random() * h * 0.3,
      len: 10 + Math.random() * 18,
      v: 900 + Math.random() * 700,
      a: 0.06 + Math.random() * 0.14,
    });

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(170, Math.round((w * h) / 7000));
      drops = Array.from({ length: count }, () => make(true));
    };

    const frame = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgb(199,204,214)";
      ctx.lineWidth = 1;
      for (const d of drops) {
        d.y += d.v * dt;
        d.x += d.v * dt * WIND;
        if (d.y - d.len > h) Object.assign(d, make(false));
        ctx.globalAlpha = d.a;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * WIND, d.y - d.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const strike = () => {
      const host = flashHost.current;
      if (host) {
        host.classList.add("flash");
        later(() => host.classList.remove("flash"), 90);
        later(() => host.classList.add("flash"), 170);
        later(() => host.classList.remove("flash"), 340);
      }
      later(strike, 12000 + Math.random() * 18000);
    };
    later(strike, 6000 + Math.random() * 10000);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
      host0?.classList.remove("flash");
    };
  }, [enabled, flashHost]);

  return ref;
}
