import { useEffect, useRef } from "react";

interface Blob {
  x: number; y: number; r: number;
  vx: number; vy: number;
  col: string; a: number;
}

const COLORS = ["255,37,55", "120,120,132", "150,22,30"]; // red / grey / deep-red night haze

/** Drifting night fog on a full-viewport canvas. Ported from legacy initFog(). */
export function useFog(enabled: boolean) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs: Blob[] = [];
    for (let i = 0; i < 7; i++) {
      blobs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 180 + Math.random() * 260,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.12,
        col: COLORS[i % COLORS.length],
        a: 0.05 + Math.random() * 0.06,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(${b.col},${b.a})`);
        g.addColorStop(1, `rgba(${b.col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < -b.r) b.x = w + b.r;
        if (b.x > w + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = h + b.r;
        if (b.y > h + b.r) b.y = -b.r;
      }
    };

    if (!enabled) {
      draw(); // a single static frame
    } else {
      const loop = () => {
        draw();
        raf = requestAnimationFrame(loop);
      };
      loop();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [enabled]);

  return ref;
}
