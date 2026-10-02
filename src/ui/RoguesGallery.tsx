import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { useStore } from "../store/useStore";
import {
  POWER_WINDOW_DAYS, todayThreat, villainDays, villainPowers, type DayMark, type VillainPower,
} from "../engine/nemesis";
import { VILLAIN_FIGURES } from "../engine/config";
import { systemClock } from "../engine/clock";
import { dayIndex } from "../engine/streak";
import { useRain } from "../fx/useRain";
import { clang } from "../lib/audio";
import { readJSON, writeJSON } from "../lib/storage";
import { Icon } from "./Icons";
import { Roll } from "./Roll";

/** Each villain's status as this device last showed it — how the hall knows one was just locked up. */
const STATUS_KEY = "gp-rogue-status";
const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));

/** Arc spans 160° rather than a full 180°, so the two end figures don't bunch up at the edges. */
const ARC_SPREAD = (160 * Math.PI) / 180;

/**
 * Where villain `i` of `n` stands on the semicircle. `depth` is 1 at the back
 * of the hall (centre) and 0 at the front (ends): back figures sit higher and
 * a touch smaller, front ones lower and on top.
 */
function arcPos(i: number, n: number) {
  const t = n === 1 ? 0.5 : i / (n - 1);
  const theta = Math.PI - (Math.PI - ARC_SPREAD) / 2 - t * ARC_SPREAD;
  const depth = Math.sin(theta);
  return {
    x: 50 + 44 * Math.cos(theta),
    y: 34 - 30 * depth,
    scale: 1 - 0.14 * depth,
    z: Math.round((1 - depth) * 10),
    depth,
  };
}

function status(v: VillainPower): { key: string; label: string } {
  if (v.dormant) return { key: "dormant", label: "Dormant" };
  if (v.power === 0) return { key: "locked", label: "Locked up" };
  if (v.power < 0.34) return { key: "contained", label: "Contained" };
  if (v.power < 0.67) return { key: "rising", label: "Rising" };
  return { key: "dominant", label: "Dominant" };
}

export function RoguesGallery({ motion = true, onLog }: { motion?: boolean; onLog?: () => void }) {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);
  const sound = useStore((s) => s.settings.sound);

  const powers = villainPowers(history, config, systemClock);
  const awake = powers.filter((v) => !v.dormant);
  const threat = awake.length ? awake.reduce((s, v) => s + v.power, 0) / awake.length : 0;
  const worst = awake.reduce<VillainPower | null>((a, v) => (v.power > (a?.power ?? 0) ? v : a), null);
  const pillarName = (id: string) => config.pillars.find((p) => p.id === id)?.name ?? "";

  const hallRef = useRef<HTMLDivElement | null>(null);
  const rainRef = useRain(motion, hallRef);
  const [focus, setFocus] = useState<string | null>(null);
  const closeFocus = useCallback(() => setFocus(null), []);

  /* Cell door: a villain whose status was something else the last time this
     device showed the hall, and is locked up now, gets the slam — once. */
  const [lastSeen] = useState<Record<string, string>>(() => readJSON(STATUS_KEY, {}));
  const statusMap = JSON.stringify(Object.fromEntries(powers.map((v) => [v.pillar, status(v).key])));
  useEffect(() => { writeJSON(STATUS_KEY, JSON.parse(statusMap)); }, [statusMap]);
  const slams = powers.filter((v) => status(v).key === "locked" && lastSeen[v.pillar] && lastSeen[v.pillar] !== "locked");
  const anySlam = slams.length > 0;
  useEffect(() => { if (anySlam && motion) clang(sound); }, [anySlam, motion, sound]);

  /* Living hall: the figures lean with the pointer, nearer ones more, so the
     arc reads as depth. On a phone, tilting does the same (Android — iOS only
     allows it behind a permission prompt, which this doesn't ask for). */
  const queued = useRef(0);
  const lean = (mx: number, my: number) => {
    hallRef.current?.style.setProperty("--mx", clamp(mx).toFixed(3));
    hallRef.current?.style.setProperty("--my", clamp(my).toFixed(3));
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!motion || queued.current || e.pointerType === "touch") return;
    const { clientX, clientY } = e;
    queued.current = requestAnimationFrame(() => {
      queued.current = 0;
      const r = hallRef.current?.getBoundingClientRect();
      if (r) lean((clientX - r.left) / r.width - 0.5, (clientY - r.top) / r.height - 0.5);
    });
  };
  useEffect(() => {
    if (!motion) return;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const el = hallRef.current;
      el?.style.setProperty("--mx", clamp(e.gamma / 40).toFixed(3));
      el?.style.setProperty("--my", clamp((e.beta - 45) / 60).toFixed(3));
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("deviceorientation", onTilt);
      if (queued.current) cancelAnimationFrame(queued.current);
    };
  }, [motion]);

  const focused = focus ? powers.find((v) => v.pillar === focus) : undefined;

  return (
    <div className="view rogues">
      <div className="toolbar-row">
        <h2 className="section-title" style={{ flex: 1 }}>Rogues Gallery</h2>
      </div>
      <StatusReport />
      <p className="rogues-sub">
        Power = days you skipped a pillar ÷ days counted, over the last {POWER_WINDOW_DAYS} days.
        Every day you skip pushes its villain up; every day you log pushes it back down. Rest weeks don't count.
      </p>

      <div className="hall-stage">
        <div
          className={"hall" + (focus ? " focusing" : "")}
          ref={hallRef}
          onPointerMove={onMove}
          onPointerLeave={() => lean(0, 0)}
          onClick={(e) => { if (e.target === e.currentTarget) setFocus(null); }}
        >
          <div className="hall-floor" aria-hidden="true" />
          <div className="hall-ring" aria-hidden="true" />
          <canvas className="hall-rain" ref={rainRef} aria-hidden="true" />

          <ul className="hall-arc">
            {powers.map((v, i) => (
              <Rogue
                key={v.pillar}
                v={v}
                pillar={pillarName(v.pillar)}
                figure={VILLAIN_FIGURES[v.pillar]}
                pos={arcPos(i, powers.length)}
                slam={slams.includes(v)}
                on={focus === v.pillar}
                onPick={() => setFocus((f) => (f === v.pillar ? null : v.pillar))}
              />
            ))}
          </ul>

          <div className="hall-center">
            <span className="hall-mark"><Icon name="bat" /></span>
            <span className="hall-k">14-day threat</span>
            <b className="hall-v">{awake.length ? <><Roll value={Math.round(threat * 100)} />%</> : "—"}</b>
            <span className="hall-note">
              {worst ? <>Most dangerous: <em>{worst.name}</em></> : awake.length ? "Every rogue is locked up." : "Log a pillar to wake its villain."}
            </span>
          </div>
        </div>
      </div>

      {focused && createPortal(
        <RoguePanel
          v={focused}
          pillar={pillarName(focused.pillar)}
          days={villainDays(history, config, systemClock, focused.pillar)}
          onClose={closeFocus}
          onLog={onLog}
        />,
        document.body,
      )}
    </div>
  );
}

function threatLevel(t: number): string {
  if (t === 0) return "All clear";
  if (t < 0.34) return "Low";
  if (t < 0.67) return "Elevated";
  return "Critical";
}

/** "A", "A or B", "A, B or C". */
function orList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/* Which rogues the report has already shown as handled today, kept for the
   session — so the slash plays once per rogue per day, as news, not on every
   visit to the tab. */
const shownByDay = new Map<number, Set<string>>();

/** Today only: which rogues you've dealt with, which are still loose, and the threat that leaves. */
function StatusReport() {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);
  const r = todayThreat(history, config, systemClock);
  const today = dayIndex(systemClock.now(), config.dayBoundaryHour);
  const [seen] = useState(() => new Set(shownByDay.get(today) ?? []));
  const handledKey = r.pillars.filter((p) => p.handled).map((p) => p.pillar).join(",");
  useEffect(() => {
    let shown = shownByDay.get(today);
    if (!shown) {
      shownByDay.clear(); // a new day: yesterday's news is old
      shown = new Set();
      shownByDay.set(today, shown);
    }
    for (const id of handledKey.split(",")) if (id) shown.add(id);
  }, [handledKey, today]);
  // Fresh = handled now but not yet shown; each gets the slash, staggered.
  const fresh = r.pillars.filter((p) => p.handled && !seen.has(p.pillar)).map((p) => p.pillar);
  const delay = (id: string) => ({ ["--d" as string]: `${0.25 + fresh.indexOf(id) * 0.12}s` });
  const pct = Math.round(r.threat * 100);
  const date = new Date(systemClock.now()).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const loose = r.pillars.filter((p) => !p.handled);

  let line: string;
  if (r.rest) line = "Rest week. The threat is on hold until Monday.";
  else if (r.loose === 0) line = "Every rogue handled today. Gotham sleeps.";
  else if (r.loose === r.pillars.length) line = `All ${r.loose} still loose. Log any pillar to start pushing them back.`;
  else line = `${r.loose} still loose. Log ${orList(loose.map((p) => p.name))} before midnight.`;

  return (
    <div className={"status-card" + (r.rest ? " rest" : "")} aria-label="Today's status report">
      <div className="status-head">
        <div>
          <div className="status-k">Status report</div>
          <div className="status-date">{date}</div>
        </div>
        <div className="status-threat">
          <div className="status-k">Today's threat</div>
          <div className="status-v">
            <b>{r.rest ? "—" : <><Roll value={pct} />%</>}</b>
            <span>{r.rest ? "On hold" : threatLevel(r.threat)}</span>
          </div>
        </div>
      </div>

      <div className="status-segs" aria-hidden="true">
        {r.pillars.map((p) => (
          <i
            key={p.pillar}
            className={(p.handled ? "done" : "") + (fresh.includes(p.pillar) ? " slash" : "")}
            style={delay(p.pillar)}
          />
        ))}
      </div>

      <ul className="status-list">
        {r.pillars.map((p) => (
          <li
            key={p.pillar}
            className={(p.handled ? "done" : "") + (fresh.includes(p.pillar) ? " slash" : "")}
            style={delay(p.pillar)}
            data-status={p.pillar}
          >
            <span className="nm">{p.villain}</span>
            <span className="st">{p.handled ? "Handled" : "Loose"}</span>
          </li>
        ))}
      </ul>

      <p className="status-line">{line}</p>
    </div>
  );
}

function Rogue({ v, pillar, figure, pos, slam, on, onPick }: {
  v: VillainPower;
  pillar: string;
  figure: string | undefined;
  pos: ReturnType<typeof arcPos>;
  /** Just locked up: bars slam down, the cell shakes, the stamp lands. */
  slam: boolean;
  /** In the spotlight — the case file is open. */
  on: boolean;
  onPick: () => void;
}) {
  // The PNG may not exist yet — keep the empty plinth until it actually loads,
  // so a missing file never shows as a broken image.
  const [loaded, setLoaded] = useState(false);
  const st = status(v);
  const pct = Math.round(v.power * 100);
  const trend = v.dormant || Math.abs(v.trend) < 0.05 ? null : v.trend > 0 ? "gaining" : "losing ground";

  const style = {
    "--x": pos.x,
    "--y": pos.y,
    "--s": pos.scale,
    "--z": pos.z,
    "--dep": pos.depth.toFixed(3),
    "--p": v.power,
  } as CSSProperties;

  return (
    <li
      className={`rogue ${st.key}` + (slam ? " slamming" : "") + (on ? " on" : "")}
      style={style}
      data-rogue={v.pillar}
    >
      <button className="rogue-hit" onClick={onPick} aria-label={`${v.name} case file`} aria-expanded={on} />
      <div className="rogue-figure">
        {figure && (
          <img
            src={figure}
            alt={loaded ? v.name : ""}
            className={loaded ? "on" : ""}
            onLoad={() => setLoaded(true)}
          />
        )}
        {!loaded && (
          <svg className="rogue-ph" viewBox="0 0 60 80" aria-hidden="true">
            <circle cx="30" cy="20" r="11" />
            <path d="M8 80 C8 52 16 38 30 38 C44 38 52 52 52 80 Z" />
          </svg>
        )}
        {st.key === "locked" && (
          <div className={"rogue-bars" + (slam ? " slam" : "")} aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
        )}
        {slam && <span className="rogue-stamp" aria-hidden="true">Locked up</span>}
      </div>
      <div className="rogue-plinth" aria-hidden="true" />

      <div className="rogue-name">{v.name}</div>
      <div className="rogue-pillar">{pillar}</div>
      <div
        className="rogue-meter"
        role="meter"
        aria-label={`${v.name} power`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="rogue-meta">
        <b>{v.dormant ? "—" : <><Roll value={pct} />%</>}</b>
        <span>{st.label}{trend && <> · {trend}</>}</span>
        {!v.dormant && v.counted > 0 && (
          <span className="rogue-days">{v.missed} of {v.counted} days missed</span>
        )}
      </div>
    </li>
  );
}

const MARK_LABEL: Record<DayMark, string> = {
  logged: "Logged",
  missed: "Missed",
  rest: "Rest week",
  before: "Not started yet",
  today: "Today, not logged yet",
};

/** The case file: one villain's last 14 days, what their power means, and the way to push them back. */
function RoguePanel({ v, pillar, days, onClose, onLog }: {
  v: VillainPower;
  pillar: string;
  days: Array<{ ts: number; mark: DayMark }>;
  onClose: () => void;
  onLog?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const st = status(v);
  const pct = Math.round(v.power * 100);
  const points = Math.round(Math.abs(v.trend) * 100);

  let trend: string;
  if (v.dormant) trend = `No villain yet. Log ${pillar} once to wake ${v.name}.`;
  else if (v.trend >= 0.05) trend = `Gaining: up ${points} points on the 14 days before.`;
  else if (v.trend <= -0.05) trend = `Losing ground: down ${points} points on the 14 days before.`;
  else trend = "Holding steady against the 14 days before.";

  let line: string;
  if (v.dormant) line = `${v.name} stays dormant until ${pillar} is logged.`;
  else if (v.power === 0) line = `${v.name} is locked up. Keep logging ${pillar} to keep it that way.`;
  else line = `${v.missed} of ${v.counted} days missed. Each day you log ${pillar}, ${v.name} loses about ${Math.round(100 / POWER_WINDOW_DAYS)} points.`;

  return (
    <aside className={`rogue-panel ${st.key}`} role="dialog" aria-label={`${v.name} case file`}>
      <div className="rp-head">
        <div>
          <div className="rp-k">Case file</div>
          <h3 className="rp-name">{v.name}</h3>
          <div className="rp-pillar">{pillar}</div>
        </div>
        <button className="rp-close" ref={closeRef} onClick={onClose} aria-label="Close case file">×</button>
      </div>

      <div className="rp-power">
        <b>{v.dormant ? "—" : `${pct}%`}</b>
        <span>{st.label}</span>
      </div>
      <p className="rp-trend">{trend}</p>

      <div className="rp-k">Last {POWER_WINDOW_DAYS} days</div>
      <div className="rp-days">
        {days.map((d) => (
          <span
            key={d.ts}
            className={`rp-day ${d.mark}`}
            title={`${new Date(d.ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}: ${MARK_LABEL[d.mark]}`}
          >
            <i />
            <em>{new Date(d.ts).toLocaleDateString(undefined, { weekday: "narrow" })}</em>
          </span>
        ))}
      </div>
      <div className="rp-legend">
        <span><i className="logged" />Logged</span>
        <span><i className="missed" />Missed</span>
        <span><i className="rest" />Rest</span>
      </div>

      <p className="rp-line">{line}</p>
      {onLog && (
        <button className="btn accent rp-log" onClick={() => { onClose(); onLog(); }}>
          Go log {pillar}
        </button>
      )}
    </aside>
  );
}
