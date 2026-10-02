import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useStore } from "../store/useStore";
import {
  MARKERS, OVERVIEW, PILLAR_PARTS, VIEWS, buildBatFigure, pillarFor, type Part, type PillarKey,
} from "../fx/batFigure";
import { PillarGrid } from "./PillarGrid";

const PART_LABEL: Record<PillarKey, string> = {
  archive: "Head",
  craft: "Arm",
  mirror: "Back of the head",
  forge: "Bicep",
  discipline: "Back of the arm",
};
const ORDER: PillarKey[] = ["archive", "craft", "mirror", "forge", "discipline"];
const LIT = new THREE.Color(0x2e070b);
const UNLIT = new THREE.Color(0x000000);
/** How far the figure slides left (px) while the stats panel is open on the right. */
const PANEL_SHIFT = 175;

/**
 * Drives the camera. Every view is an orbit around the figure's vertical
 * axis, and moving between two views eases each number toward its target —
 * the angle the short way round — so the camera swings round the figure
 * Arkham-menu style rather than cutting or flying through it.
 */
function Rig({ focus }: { focus: PillarKey | null }) {
  const { camera, size } = useThree();
  const cur = useRef({ theta: OVERVIEW.theta, r: OVERVIEW.r, y: OVERVIEW.y, shift: 0 });
  const target = useRef(new THREE.Vector3(...OVERVIEW.target));
  const want = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const v = focus ? VIEWS[focus] : OVERVIEW;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 3.2);
    const c = cur.current;
    // On the overview he turns slowly to and fro, so the figure never sits dead.
    const theta = v.theta + (focus ? 0 : Math.sin(state.clock.elapsedTime * 0.3) * 0.32);
    let d = theta - c.theta;
    d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    c.theta += d * k;
    c.r += (v.r - c.r) * k;
    c.y += (v.y - c.y) * k;
    c.shift += ((focus ? PANEL_SHIFT : 0) - c.shift) * k;
    target.current.lerp(want.set(...v.target), k);

    camera.position.set(Math.sin(c.theta) * c.r, c.y, Math.cos(c.theta) * c.r);
    camera.lookAt(target.current);
    // Slide the picture left so the part in focus clears the panel on the right.
    const cam = camera as THREE.PerspectiveCamera;
    cam.setViewOffset(size.width, size.height, c.shift, 0, size.width, size.height);
    cam.updateProjectionMatrix();
  });
  return null;
}

function Figure({ hover, focus, onHover, onPick }: {
  hover: PillarKey | null;
  focus: PillarKey | null;
  onHover: (k: PillarKey | null) => void;
  onPick: (k: PillarKey) => void;
}) {
  const fig = useMemo(() => buildBatFigure(), []);

  // The hovered and focused pillar's body parts glow a deep red.
  useEffect(() => {
    const lit = new Set<Part>([...(hover ? PILLAR_PARTS[hover] : []), ...(focus ? PILLAR_PARTS[focus] : [])]);
    fig.traverse((o) => {
      // Unlit materials (the eyes) have no emissive and keep their own glow.
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        o.material.emissive.copy(lit.has(o.userData.part) ? LIT : UNLIT);
      }
    });
  }, [fig, hover, focus]);

  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    pillarFor(e.object.userData.part as Part | undefined, e.point.z - 0.01);

  return (
    <primitive
      object={fig}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(at(e)); }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const k = at(e);
        if (k) onPick(k);
      }}
    />
  );
}

/** A small pulsing red dot on each pillar's spot, shown on the overview only. */
function Markers({ show, onPick }: { show: boolean; onPick: (k: PillarKey) => void }) {
  const group = useRef<THREE.Group | null>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((m, i) => {
      const s = 1 + Math.sin(t * 2.4 + i) * 0.25;
      m.scale.setScalar(s);
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity += ((show ? 0.95 : 0) - mat.opacity) * 0.12;
      m.visible = mat.opacity > 0.02;
    });
  });
  return (
    <group ref={group}>
      {ORDER.map((k) => (
        <mesh
          key={k}
          position={MARKERS[k]}
          onClick={(e) => { e.stopPropagation(); onPick(k); }}
        >
          <sphereGeometry args={[0.016, 16, 12]} />
          <meshBasicMaterial color="#ff2537" transparent opacity={0} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The Pillars page as a Batsuit: the figure stands in a box next to the
 * profile. Click a body part (or a pillar below) and the camera swings in on
 * it while that pillar's card — stats and log buttons — opens on the right.
 */
export default function BatsuitScene({ motion }: { motion: boolean }) {
  const pillars = useStore((s) => s.config.pillars);
  const [focus, setFocus] = useState<PillarKey | null>(null);
  const [hover, setHover] = useState<PillarKey | null>(null);
  const close = useCallback(() => setFocus(null), []);

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focus, close]);

  const name = (k: PillarKey) => pillars.find((p) => p.id === k)?.name ?? k;
  const available = ORDER.filter((k) => pillars.some((p) => p.id === k));
  const caption = hover ?? focus;

  return (
    <div className="suit">
      <div className={"suit-box" + (hover ? " hovering" : "") + (focus ? " focused" : "")}>
        <Canvas
          className="suit-canvas"
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 35, near: 0.05, far: 30, position: [0, OVERVIEW.y, OVERVIEW.r] }}
          frameloop={motion ? "always" : "demand"}
          onPointerMissed={close}
        >
          <fog attach="fog" args={["#050506", 3.2, 8]} />
          <ambientLight intensity={0.18} />
          <hemisphereLight args={[0x8a8e99, 0x050506, 0.4]} />
          {/* key from the front, then a cold rim and a red rim from behind to cut the silhouette out of the dark */}
          <directionalLight position={[1.4, 3, 2.6]} intensity={1.6} />
          <directionalLight position={[-2.2, 2.4, -2.6]} intensity={2.4} color="#c7ccd6" />
          <directionalLight position={[2.4, 1.6, -2.2]} intensity={1.1} color="#ff2537" />
          <pointLight position={[0, 0.08, 0.7]} intensity={0.5} distance={2.5} color="#ff2537" />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <circleGeometry args={[0.85, 64]} />
            <meshStandardMaterial color="#0d0d10" roughness={1} metalness={0} />
          </mesh>

          <Figure hover={hover} focus={focus} onHover={setHover} onPick={setFocus} />
          <Markers show={!focus} onPick={setFocus} />
          <Rig focus={focus} />
        </Canvas>

        {caption && !focus && (
          <div className="suit-caption">
            <b>{name(caption)}</b> · {PART_LABEL[caption]}
          </div>
        )}

        {focus && (
          <div className="suit-panel" key={focus}>
            <div className="suit-panel-head">
              <span>{PART_LABEL[focus]}</span>
              <button className="suit-close" onClick={close} aria-label="Back to full suit">×</button>
            </div>
            <PillarGrid motion={motion} only={focus} />
          </div>
        )}
      </div>

      <div className="suit-chips" role="tablist" aria-label="Pillars">
        {available.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={focus === k}
            className={"suit-chip" + (focus === k ? " on" : "")}
            onClick={() => setFocus((f) => (f === k ? null : k))}
            onMouseEnter={() => setHover(k)}
            onMouseLeave={() => setHover(null)}
          >
            <b>{name(k)}</b>
            <span>{PART_LABEL[k]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
