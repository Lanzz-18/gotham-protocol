/** How long the "+50" takes to fly from the button into the ring. */
export const FLY_MS = 620;

/**
 * Fly a "+XP" label from a log button into its pillar's level ring along an
 * arc, then call `onLand`. Drawn as a fixed-position element on <body> so the
 * card's overflow can't clip it mid-flight. With no Web Animations support
 * (jsdom, very old browsers) it lands straight away.
 */
export function flyXp(from: HTMLElement, to: HTMLElement, text: string, color: string, onLand: () => void): void {
  const el = document.createElement("span");
  if (typeof el.animate !== "function") {
    onLand();
    return;
  }

  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2;
  const y0 = a.top + a.height / 2;
  const dx = b.left + b.width / 2 - x0;
  const dy = b.top + b.height / 2 - y0;
  // The arc's control point: halfway there, lifted up, so it lobs rather than slides.
  const cx = dx / 2;
  const cy = dy / 2 - Math.max(40, Math.hypot(dx, dy) * 0.45);

  el.className = "xp-fly";
  el.textContent = text;
  el.style.left = `${x0}px`;
  el.style.top = `${y0}px`;
  el.style.setProperty("--c", color);
  document.body.appendChild(el);

  const N = 14;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = 2 * (1 - t) * t * cx + t * t * dx;
    const y = 2 * (1 - t) * t * cy + t * t * dy;
    // pops up as it leaves the button, shrinks as it's absorbed by the ring
    const s = t < 0.15 ? 1 + (t / 0.15) * 0.3 : 1.3 - ((t - 0.15) / 0.85) * 0.75;
    frames.push({
      transform: `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`,
      opacity: t > 0.88 ? (1 - t) / 0.12 : 1,
    });
  }

  const anim = el.animate(frames, { duration: FLY_MS, easing: "cubic-bezier(.45,0,.65,1)", fill: "forwards" });
  anim.onfinish = () => {
    el.remove();
    onLand();
  };
}
