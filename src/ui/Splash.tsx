import { useCallback, useEffect, useRef, useState } from "react";

import { createSwarm, type Swarm } from "../fx/batSwarm";
import { swarmSound } from "../lib/audio";
import { Icon } from "./Icons";

type Phase = "title" | "swarm" | "out" | "fade";

interface SplashProps {
  motion: boolean;
  sound: boolean;
  onDone: () => void;
}

const HERO = "menu-hero.webp";

/** Resolves once the menu plate is decoded, or after 3s — never reveal a half-loaded menu, never hang. */
function heroReady(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 3000);
    const done = () => { clearTimeout(timer); resolve(); };
    const img = new Image();
    img.src = HERO;
    if (typeof img.decode === "function") img.decode().then(done, done);
    else img.addEventListener("load", done, { once: true });
  });
}

function canDraw(): boolean {
  try {
    return !!document.createElement("canvas").getContext("2d");
  } catch {
    return false;
  }
}

/**
 * Opening screen: "Press any key" over dark fog, then the bat swarm carves
 * the darkness away to reveal the main menu. Plays once per app open, any key
 * or tap skips it, and with reduced motion it's a plain half-second fade.
 */
export function Splash({ motion, sound, onDone }: SplashProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const swarmRef = useRef<Swarm | null>(null);
  const phaseRef = useRef<Phase>("title");
  const [phase, setPhase] = useState<Phase>("title");
  const [ready] = useState(heroReady);
  const [drawable] = useState(canDraw);
  const [touch] = useState(() => !!window.matchMedia?.("(pointer: coarse)")?.matches);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !drawable) return;
    const light = touch || window.innerWidth < 700;
    swarmRef.current = createSwarm(c, { light, onEnd: () => go("out") });
    return () => swarmRef.current?.destroy();
  }, [drawable, touch, go]);

  const press = useCallback(() => {
    const p = phaseRef.current;
    if (p === "swarm") {
      // Skip: cut straight to the hand-off.
      swarmRef.current?.stop();
      go("out");
      return;
    }
    if (p !== "title") return;
    swarmSound(sound); // inside the gesture, or the browser blocks it
    if (!motion || !swarmRef.current) {
      go("fade");
      return;
    }
    phaseRef.current = "swarm"; // claim it now, so a second press while loading is a skip
    void ready.then(() => {
      if (phaseRef.current !== "swarm") return;
      swarmRef.current?.start();
      setPhase("swarm");
    });
  }, [motion, sound, ready, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Stop the key reaching the menu underneath (Enter would press "Go to home").
      e.preventDefault();
      e.stopPropagation();
      press();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [press]);

  useEffect(() => {
    if (phase !== "out" && phase !== "fade") return;
    const t = window.setTimeout(onDone, phase === "fade" ? 500 : 320);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  return (
    <div
      className={`splash ${phase}${drawable ? "" : " nocanvas"}`}
      role="button"
      tabIndex={0}
      aria-label={touch ? "Tap to begin" : "Press any key to begin"}
      onPointerDown={press}
    >
      <canvas className="splash-canvas" ref={canvasRef} aria-hidden="true" />
      <div className="splash-fog" aria-hidden="true" />
      <div className="splash-title">
        <span className="splash-mark" aria-hidden="true"><Icon name="bat" /></span>
        <span className="splash-press">{touch ? "Tap to begin" : "Press any key"}</span>
      </div>
    </div>
  );
}
