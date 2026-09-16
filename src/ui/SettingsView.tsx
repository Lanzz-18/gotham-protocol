import { useStore } from "../store/useStore";
import { Icon } from "./Icons";
import { PILLAR_ICON_CHOICES } from "./icon-data";
import { xpToNext } from "../engine/xp";

const ACCENT_CHOICES = ["#ff2537", "#ff5563", "#b3141f", "#ff8a94", "#c7ccd6", "#8a8e99"];

interface SettingsViewProps {
  onUploadPortrait: (tier: number) => void;
  onRemovePortrait: (tier: number) => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}

export function SettingsView(props: SettingsViewProps) {
  return (
    <div className="view">
      <h2 className="section-title">Console Configuration</h2>
      <div className="settings-grid">
        <General />
        <Pillars />
        <Ranks onUploadPortrait={props.onUploadPortrait} onRemovePortrait={props.onRemovePortrait} />
        <Curve />
        <DataBlock onExport={props.onExport} onImport={props.onImport} onReset={props.onReset} />
      </div>
    </div>
  );
}

function General() {
  const appName = useStore((s) => s.config.appName);
  const settings = useStore((s) => s.settings);
  const setConfig = useStore((s) => s.setConfig);
  const setSettings = useStore((s) => s.setSettings);

  return (
    <div className="panel setblock">
      <h3>General</h3>
      <label className="field" style={{ marginBottom: 14 }}>
        App name
        <input type="text" maxLength={40} value={appName}
          onChange={(e) => setConfig((c) => { c.appName = e.target.value; })} />
      </label>

      <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
        Theme accent
      </div>
      <div className="accent-picker" style={{ marginBottom: 8 }}>
        {ACCENT_CHOICES.map((c) => (
          <span
            key={c}
            role="button"
            aria-label={`Accent ${c}`}
            className={"accent-swatch" + (settings.accent === c ? " active" : "")}
            style={{ background: c, color: c }}
            onClick={() => setSettings({ accent: c })}
          />
        ))}
      </div>

      <div className="toggle-row">
        <div>
          <div>Motion &amp; effects</div>
          <div className="desc">Fog, bar pulse, level-up &amp; rank-up cinematics.</div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.motion} onChange={(e) => setSettings({ motion: e.target.checked })} />
          <span className="slider" />
        </label>
      </div>

      <div className="toggle-row">
        <div>
          <div>Sound</div>
          <div className="desc">Subtle UI ticks and a rank-up stinger (WebAudio).</div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} />
          <span className="slider" />
        </label>
      </div>
    </div>
  );
}

function Pillars() {
  const pillars = useStore((s) => s.config.pillars);
  const setConfig = useStore((s) => s.setConfig);
  const pushToast = useStore((s) => s.pushToast);

  return (
    <div className="panel setblock">
      <h3>Pillars</h3>
      {pillars.map((p, pi) => (
        <div className="set-pillar" key={p.id}>
          <div className="row1">
            <div className="reorder">
              <button className="btn ghost" aria-label="Move up" onClick={() => setConfig((c) => {
                if (pi > 0) [c.pillars[pi - 1], c.pillars[pi]] = [c.pillars[pi], c.pillars[pi - 1]];
              })}>&#9650;</button>
              <button className="btn ghost" aria-label="Move down" onClick={() => setConfig((c) => {
                if (pi < c.pillars.length - 1) [c.pillars[pi + 1], c.pillars[pi]] = [c.pillars[pi], c.pillars[pi + 1]];
              })}>&#9660;</button>
            </div>

            <label className="field" style={{ flex: 1, textTransform: "none" }}>
              Name
              <input className="p-name" type="text" maxLength={30} value={p.name}
                onChange={(e) => setConfig((c) => { c.pillars[pi].name = e.target.value; })} />
            </label>
            <label className="field" style={{ textTransform: "none" }}>
              Theme
              <input className="p-theme" type="text" maxLength={30} value={p.theme}
                onChange={(e) => setConfig((c) => { c.pillars[pi].theme = e.target.value; })} />
            </label>
            <label className="field" style={{ textTransform: "none" }}>
              Icon
              <select value={p.icon} onChange={(e) => setConfig((c) => { c.pillars[pi].icon = e.target.value; })}>
                {PILLAR_ICON_CHOICES.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
              </select>
            </label>
            <label className="field" style={{ textTransform: "none" }}>
              Color
              <input type="color" value={p.accent}
                onChange={(e) => setConfig((c) => { c.pillars[pi].accent = e.target.value; })} />
            </label>
          </div>

          <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            Quick-log actions
          </div>
          <div className="set-actions-list">
            {p.actions.map((a, ai) => (
              <div className="set-action-row" key={ai}>
                <input className="a-name" type="text" maxLength={40} value={a.label}
                  onChange={(e) => setConfig((c) => { c.pillars[pi].actions[ai].label = e.target.value; })} />
                <input className="a-xp" type="number" min={1} max={100000} value={a.xp}
                  onChange={(e) => setConfig((c) => { c.pillars[pi].actions[ai].xp = Math.max(1, Number(e.target.value) || 1); })} />
                <button className="icon-btn danger" aria-label="Remove action" onClick={() => {
                  if (p.actions.length <= 1) { pushToast("Keep at least one action.", "warn"); return; }
                  setConfig((c) => { c.pillars[pi].actions.splice(ai, 1); });
                }}>
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>

          <button className="btn ghost sm" style={{ marginTop: 8 }}
            onClick={() => setConfig((c) => { c.pillars[pi].actions.push({ label: "New action", xp: 20 }); })}>
            + Add action
          </button>
        </div>
      ))}
    </div>
  );
}

function Ranks({ onUploadPortrait, onRemovePortrait }: Pick<SettingsViewProps, "onUploadPortrait" | "onRemovePortrait">) {
  const ranks = useStore((s) => s.config.ranks);
  const portraits = useStore((s) => s.portraits);
  const setConfig = useStore((s) => s.setConfig);

  return (
    <div className="panel setblock">
      <h3>Rank Ladder &amp; Portraits</h3>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
        Edit titles and the overall-level threshold each rank unlocks at. Upload a portrait per tier — higher tiers can be cooler images.
      </div>
      {ranks.map((r, ri) => (
        <div className="rank-row" key={ri}>
          <span className="tno">{ri}</span>
          <input type="text" maxLength={30} value={r.title}
            onChange={(e) => setConfig((c) => { c.ranks[ri].title = e.target.value; })} />
          <input type="number" min={0} max={100000} aria-label="Threshold" value={r.threshold}
            onChange={(e) => setConfig((c) => { c.ranks[ri].threshold = Math.max(0, Number(e.target.value) || 0); })} />
          {portraits[ri] ? (
            <img className="rank-thumb" src={portraits[ri]} alt={`Portrait tier ${ri}`} />
          ) : (
            <div className="rank-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: r.aura }}>
              <Icon name="bat" />
            </div>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn ghost sm" onClick={() => onUploadPortrait(ri)}>Upload</button>
            {portraits[ri] && (
              <button className="icon-btn danger" aria-label="Remove portrait" onClick={() => onRemovePortrait(ri)}>
                <Icon name="trash" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Curve() {
  const curve = useStore((s) => s.config.xpCurve);
  const setConfig = useStore((s) => s.setConfig);

  return (
    <div className="panel setblock">
      <h3>XP Curve</h3>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
        xpToNext(L) = round(base &times; growth^L), levels 0-indexed. Higher base = slower start; higher growth = steeper climb.
        Preview: L0&rarr;1 needs <b style={{ color: "var(--accent)" }}>{xpToNext(0, curve)}</b>,
        L5&rarr;6 needs <b style={{ color: "var(--accent)" }}>{xpToNext(5, curve)}</b>,
        L10&rarr;11 needs <b style={{ color: "var(--accent)" }}>{xpToNext(10, curve)}</b> XP.
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <label className="field" style={{ textTransform: "none" }}>
          Base ({curve.base})
          <input type="range" min={20} max={300} step={5} value={curve.base}
            onChange={(e) => setConfig((c) => { c.xpCurve.base = Number(e.target.value); })} />
        </label>
        <label className="field" style={{ textTransform: "none" }}>
          Growth ({curve.growth.toFixed(2)})
          <input type="range" min={1.05} max={1.5} step={0.01} value={curve.growth}
            onChange={(e) => setConfig((c) => { c.xpCurve.growth = Number(e.target.value); })} />
        </label>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-2)" }}>
        Changing the curve recomputes all levels from your history.
      </div>
    </div>
  );
}

function DataBlock({ onExport, onImport, onReset }: Pick<SettingsViewProps, "onExport" | "onImport" | "onReset">) {
  return (
    <div className="panel setblock">
      <h3>Backup &amp; Data</h3>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
        Your save file is portable. Export the JSON to back up, then import it on another machine to pick up where you left off.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn accent sm" onClick={onExport}>Export JSON backup</button>
        <button className="btn ghost sm" onClick={onImport}>Import backup</button>
        <button className="btn danger sm" onClick={onReset}>Reset everything</button>
      </div>
    </div>
  );
}
