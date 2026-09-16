import { useStore } from "../store/useStore";
import { pillarTotalXP } from "../engine/xp";
import { dayKey } from "../engine/streak";
import { fmt } from "../lib/format";

/** Hand-rolled SVG charts, no chart library. Ported from legacy renderStats(). */
export function StatsView() {
  return (
    <div className="view">
      <h2 className="section-title">Analytics</h2>
      <div className="stats-grid">
        <div className="panel chart-card">
          <h3>XP per Pillar (lifetime)</h3>
          <XpPerPillar />
        </div>
        <div className="panel chart-card">
          <h3>Levels</h3>
          <LevelsChart />
        </div>
        <div className="panel chart-card" style={{ gridColumn: "1/-1" }}>
          <h3>Activity — last 30 days</h3>
          <Heatmap />
        </div>
      </div>
    </div>
  );
}

function XpPerPillar() {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);

  const data = config.pillars.map((p) => ({ name: p.name, v: pillarTotalXP(history, p.id), c: p.accent }));
  const max = Math.max(1, ...data.map((d) => d.v));
  const rowH = 34;

  return (
    <svg viewBox={`0 0 100 ${data.length * rowH + 6}`} width="100%" preserveAspectRatio="none"
      role="img" aria-label="XP per pillar bar chart">
      {data.map((d, i) => {
        const y = 6 + i * rowH;
        const bw = (d.v / max) * 72;
        return (
          <g key={d.name}>
            <text x="0" y={y + 9} fill="#8b93a8" fontSize="4.2" fontFamily="monospace">{d.name}</text>
            <rect x="0" y={y + 11} width="72" height="7" rx="2" fill="rgba(255,255,255,0.05)" />
            <rect x="0" y={y + 11} width={bw} height="7" rx="2" fill={d.c}>
              <animate attributeName="width" from="0" to={bw} dur="0.7s" fill="freeze" />
            </rect>
            <text x="74" y={y + 17} fill="#e9edf6" fontSize="4.6" fontFamily="monospace">{fmt(d.v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function LevelsChart() {
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);

  const data = config.pillars.map((p) => ({ name: p.name, v: pillars[p.id]?.level ?? 0, c: p.accent }));
  const max = Math.max(1, ...data.map((d) => d.v));
  const n = data.length;
  const gap = 6;
  const bw = (100 - gap * (n + 1)) / n;
  const H = 90;

  return (
    <svg viewBox="0 0 100 110" width="100%" role="img" aria-label="Level per pillar bar chart">
      {data.map((d, i) => {
        const x = gap + i * (bw + gap);
        const bh = (d.v / max) * H;
        return (
          <g key={d.name}>
            <rect x={x} y={H - bh + 4} width={bw} height={bh} rx="1.5" fill={d.c}>
              <animate attributeName="height" from="0" to={bh} dur="0.7s" fill="freeze" />
              <animate attributeName="y" from={H + 4} to={H - bh + 4} dur="0.7s" fill="freeze" />
            </rect>
            <text x={x + bw / 2} y={H - bh} fill="#e9edf6" fontSize="5" fontFamily="monospace" textAnchor="middle">{d.v}</text>
            <text x={x + bw / 2} y={H + 9} fill="#8b93a8" fontSize="3.4" fontFamily="monospace" textAnchor="middle">
              {d.name.split(" ").pop()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Heatmap() {
  const history = useStore((s) => s.history);
  const boundary = useStore((s) => s.config.dayBoundaryHour);

  const days = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const counts: Array<{ d: Date; c: number }> = [];
  let maxC = 1;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime(), boundary);
    const c = history.filter((h) => dayKey(h.ts, boundary) === key).length;
    counts.push({ d: new Date(d), c });
    if (c > maxC) maxC = c;
  }

  const cell = 3.0;
  const gap = 0.5;
  const w = days * (cell + gap);

  return (
    <>
      <svg viewBox={`0 0 ${w} 16`} width="100%" role="img" aria-label="Activity heatmap for last 30 days">
        {counts.map((it, i) => {
          const intensity = it.c === 0 ? 0 : 0.25 + 0.75 * (it.c / maxC);
          const fill = it.c === 0
            ? "rgba(255,255,255,0.05)"
            : `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, transparent)`;
          return (
            <rect key={i} x={i * (cell + gap)} y="4" width={cell} height={cell} rx="0.6" fill={fill}>
              <title>{it.d.toLocaleDateString()}: {it.c} logs</title>
            </rect>
          );
        })}
      </svg>
      <div className="heat-legend">
        less
        <span className="sw" style={{ background: "rgba(255,255,255,0.05)" }} />
        <span className="sw" style={{ background: "color-mix(in srgb,var(--accent) 40%,transparent)" }} />
        <span className="sw" style={{ background: "color-mix(in srgb,var(--accent) 70%,transparent)" }} />
        <span className="sw" style={{ background: "var(--accent)" }} />
        more
      </div>
    </>
  );
}
