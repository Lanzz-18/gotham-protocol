import { use, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { useStore } from "../store/useStore";
import {
  MARKERS, OVERVIEW, VIEWS, buildBatFigure, pillarFor, stepCape, type Part, type PillarKey,
} from "../fx/batFigure";
import { loadSuit } from "../fx/loadSuit";
import type { SuitMesh } from "../fx/suitSdf";
import { Icon } from "./Icons";
import { PillarGrid } from "./PillarGrid";

const PART_LABEL: Record<PillarKey, string> = {
  archive: "Head",
  craft: "Arm",
  mirror: "Back of the head",
  forge: "Bicep",
  discipline: "Back of the arm",
};
const ORDER: PillarKey[] = ["archive", "craft", "mirror", "forge", "discipline"];
/** How far the figure slides left (px) while the stats panel is open on the right. */
const PANEL_SHIFT = 175;

/**
 * Drives the camera. Every view is an orbit around the figure's vertical
 * axis, and moving between two views eases each number toward its target —
 * the angle the short way round — so the camera swings round the figure
 * Arkham-menu style rather than cutting or flying through it.
 *
 * The key light rides along above the camera's left shoulder, so every view,
 * the back ones too, gets the same clean cel-shaded shadow shape.
 *
 * Once per visit, when the camera has all but settled on the pillar in focus,
 * it calls `onArrive`, so the callout can lock on as the swing eases out.
 *
 * In free look the orbit controls move the camera instead; the rig keeps its
 * numbers on wherever the camera is, so leaving free look eases back to the
 * overview from exactly there. `aim` is the point the camera looks at, shared
 * with the controls.
 */
function Rig({ focus, look, aim, onArrive }: {
  focus: PillarKey | null;
  look: boolean;
  aim: RefObject<THREE.Vector3>;
  onArrive: (k: PillarKey) => void;
}) {
  const { camera, size } = useThree();
  const arrived = useRef<PillarKey | null>(null);
  const cur = useRef({ theta: OVERVIEW.theta, r: OVERVIEW.r, y: OVERVIEW.y, shift: 0 });
  const want = useMemo(() => new THREE.Vector3(), []);
  const key = useRef<THREE.DirectionalLight | null>(null);
  const keyAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const v = focus ? VIEWS[focus] : OVERVIEW;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 3.2);
    const c = cur.current;
    let d = 0;
    if (look) {
      c.theta = Math.atan2(camera.position.x, camera.position.z);
      c.r = Math.hypot(camera.position.x, camera.position.z);
      c.y = camera.position.y;
    } else {
      // On the overview he turns slowly to and fro, so the figure never sits dead.
      const theta = v.theta + (focus ? 0 : Math.sin(state.clock.elapsedTime * 0.3) * 0.32);
      d = theta - c.theta;
      d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      c.theta += d * k;
      c.r += (v.r - c.r) * k;
      c.y += (v.y - c.y) * k;
      aim.current.lerp(want.set(...v.target), k);
      camera.position.set(Math.sin(c.theta) * c.r, c.y, Math.cos(c.theta) * c.r);
      camera.lookAt(aim.current);
    }
    c.shift += ((focus ? PANEL_SHIFT : 0) - c.shift) * k;
    // Slide the picture left so the part in focus clears the panel on the right.
    const cam = camera as THREE.PerspectiveCamera;
    cam.setViewOffset(size.width, size.height, c.shift, 0, size.width, size.height);
    cam.updateProjectionMatrix();
    key.current?.position.copy(camera.position).add(keyAt.set(-1.6, 2.2, 0).applyQuaternion(camera.quaternion));

    if (!focus || look) {
      arrived.current = null;
    } else if (
      arrived.current !== focus &&
      Math.abs(d * (1 - k)) < 0.1 && Math.abs(v.r - c.r) < 0.05 && Math.abs(v.y - c.y) < 0.04 &&
      aim.current.distanceTo(want) < 0.03
    ) {
      arrived.current = focus;
      onArrive(focus);
    }
  });
  return <directionalLight ref={key} intensity={1.1} />;
}

/** The figure. While `pickable` is off (free look) a drag over him never opens a pillar. */
function Figure({ suit, motion, pickable, onHover, onPick }: {
  suit: SuitMesh;
  motion: boolean;
  pickable: boolean;
  onHover: (k: PillarKey | null) => void;
  onPick: (k: PillarKey) => void;
}) {
  const fig = useMemo(() => buildBatFigure(suit), [suit]);

  // the cape answers the camera swinging round as if he had turned
  useFrame((state, dt) => stepCape(fig, dt, Math.atan2(state.camera.position.x, state.camera.position.z), motion));

  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    pillarFor(e.object.userData.part as Part | undefined, e.point.z - 0.01);

  return (
    <primitive
      object={fig}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!pickable) return;
        e.stopPropagation();
        onHover(at(e));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!pickable) return;
        e.stopPropagation();
        const k = at(e);
        if (k) onPick(k);
      }}
    />
  );
}

/**
 * Free look: drag to turn him, scroll to zoom, right-drag to move up and down,
 * with three's orbit controls on the canvas. They circle the rig's own `aim`,
 * so they take over from wherever the camera is with no jump, and the point
 * they circle is kept on the figure so he never drifts out of frame.
 */
function FreeLook({ aim }: { aim: RefObject<THREE.Vector3> }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const oc = new OrbitControls(camera, gl.domElement);
    oc.target = aim.current;
    oc.enableDamping = true;
    oc.dampingFactor = 0.08;
    oc.rotateSpeed = 0.7;
    oc.zoomSpeed = 0.8;
    oc.minDistance = 0.7;
    oc.maxDistance = 5.5;
    oc.minPolarAngle = 0.15;
    oc.maxPolarAngle = 1.75; // just above the floor at full zoom-out
    const keep = () => {
      const t = oc.target;
      t.set(Math.max(-0.5, Math.min(0.5, t.x)), Math.max(0.2, Math.min(1.9, t.y)), Math.max(-0.5, Math.min(0.5, t.z)));
    };
    oc.addEventListener("change", keep);
    oc.update();
    controls.current = oc;
    return () => {
      oc.removeEventListener("change", keep);
      oc.dispose();
      controls.current = null;
    };
  }, [camera, gl, aim]);

  useFrame(() => controls.current?.update());
  return null;
}

/**
 * Keeps the callout pinned to the body. Each frame it works out where the
 * pillar's spot lands on screen and where the stats card sits, then moves the
 * target ring onto the spot and redraws the leader line out to the card. It
 * writes straight into the SVG instead of going through React, so following
 * the camera costs nothing. Once the panel has closed it keeps the card's last
 * place, so the line can still pull back cleanly.
 */
function CalloutTracker({ spot, box, mark, lead, end }: {
  spot: PillarKey | null;
  box: RefObject<HTMLDivElement | null>;
  mark: RefObject<SVGGElement | null>;
  lead: RefObject<SVGPathElement | null>;
  end: RefObject<SVGCircleElement | null>;
}) {
  const { camera, size } = useThree();
  const p = useMemo(() => new THREE.Vector3(), []);
  const card = useRef({ x: 0, y: 0 });

  useFrame(() => {
    if (!spot || !box.current || !mark.current || !lead.current || !end.current) return;
    camera.updateMatrixWorld();
    p.set(...MARKERS[spot]).project(camera);
    const x = ((p.x + 1) / 2) * size.width;
    const y = ((1 - p.y) / 2) * size.height;

    // the card's left edge, level with its level ring
    const b = box.current.getBoundingClientRect();
    const el = box.current.querySelector<HTMLElement>(".suit-panel [data-pillar]");
    if (el) {
      const r = el.getBoundingClientRect();
      const ring = (el.querySelector<HTMLElement>(".pc-ring") ?? el).getBoundingClientRect();
      card.current = { x: r.left - b.left, y: ring.top + ring.height / 2 - b.top };
    }
    const { x: cx, y: cy } = card.current;

    // out of the ring to a knee just short of the card, then straight in
    const kx = cx - 28;
    const l = Math.hypot(kx - x, cy - y) || 1;
    const sx = x + ((kx - x) / l) * 12, sy = y + ((cy - y) / l) * 12;
    mark.current.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    lead.current.setAttribute("d", `M${sx.toFixed(1)} ${sy.toFixed(1)}L${kx.toFixed(1)} ${cy.toFixed(1)}L${cx.toFixed(1)} ${cy.toFixed(1)}`);
    end.current.setAttribute("cx", cx.toFixed(1));
    end.current.setAttribute("cy", cy.toFixed(1));
  });
  return null;
}

/**
 * The Pillars page as a Batsuit: the figure stands in a box next to the
 * profile. Click a body part (or a pillar below) and the camera swings in on
 * it while that pillar's card — stats and log buttons — opens on the right;
 * as the camera settles, a red target ring locks onto the part and a line
 * draws out from it to the card. Free look hands the camera to the viewer.
 */
export default function BatsuitScene({ motion }: { motion: boolean }) {
  // Suspends (showing "Suiting up…") until the worker has built the mesh.
  const suit = use(loadSuit());
  const pillars = useStore((s) => s.config.pillars);
  const [focus, setFocus] = useState<PillarKey | null>(null);
  const [hover, setHover] = useState<PillarKey | null>(null);
  // the last pillar the camera arrived at; its callout shows while it's still the one in focus
  const [arrived, setArrived] = useState<PillarKey | null>(null);
  // free look: the viewer turns and zooms the camera themselves
  const [look, setLook] = useState(false);
  const close = useCallback(() => setFocus(null), []);
  const aim = useRef(new THREE.Vector3(...OVERVIEW.target));
  const box = useRef<HTMLDivElement | null>(null);
  const mark = useRef<SVGGElement | null>(null);
  const lead = useRef<SVGPathElement | null>(null);
  const end = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    if (!focus && !look) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      setLook(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focus, look, close]);

  const toggleLook = () => {
    setLook((l) => !l);
    setFocus(null);
    setHover(null);
  };

  const name = (k: PillarKey) => pillars.find((p) => p.id === k)?.name ?? k;
  const available = ORDER.filter((k) => pillars.some((p) => p.id === k));
  const caption = hover ?? focus;

  return (
    <div className="suit">
      <div ref={box} className={"suit-box" + (hover ? " hovering" : "") + (focus ? " focused" : "") + (look ? " looking" : "")}>
        <Canvas
          className="suit-canvas"
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 35, near: 0.05, far: 30, position: [0, OVERVIEW.y, OVERVIEW.r] }}
          frameloop={motion ? "always" : "demand"}
          onPointerMissed={close}
        >
          <fog attach="fog" args={["#050506", 3.2, 8]} />
          {/* cel-shaded: a flat fill for the shadow side; the key light rides with the camera (Rig) */}
          <ambientLight intensity={0.7} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <circleGeometry args={[0.85, 64]} />
            <meshStandardMaterial color="#0d0d10" roughness={1} metalness={0} />
          </mesh>

          <Figure suit={suit} motion={motion} pickable={!look} onHover={setHover} onPick={setFocus} />
          {look && <FreeLook aim={aim} />}
          <Rig focus={focus} look={look} aim={aim} onArrive={setArrived} />
          <CalloutTracker spot={arrived} box={box} mark={mark} lead={lead} end={end} />
        </Canvas>

        <svg className={"suit-callout" + (focus && arrived === focus ? " on" : "")} aria-hidden="true">
          <path ref={lead} className="suit-callout-lead" pathLength={1} />
          <circle ref={end} className="suit-callout-end" r={3} />
          <g ref={mark}>
            <g className="suit-callout-mark">
              <circle className="suit-callout-pulse" r={9} />
              <circle className="suit-callout-ring" r={9} />
              <circle className="suit-callout-dot" r={2.5} />
            </g>
          </g>
        </svg>

        <button className={"suit-look" + (look ? " on" : "")} onClick={toggleLook} aria-pressed={look}>
          <Icon name="orbit" className="suit-look-icon" />
          <span>{look ? "Done" : "Free look"}</span>
        </button>

        {look ? (
          <div className="suit-caption">Drag to turn · Scroll to zoom · Right-drag to move</div>
        ) : caption && !focus && (
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
            onClick={() => {
              setLook(false);
              setFocus((f) => (f === k ? null : k));
            }}
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
