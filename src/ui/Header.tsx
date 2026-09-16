import { Icon } from "./Icons";
import { useStore } from "../store/useStore";

interface HeaderProps {
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}

export function Header({ onExport, onImport, onReset }: HeaderProps) {
  const appName = useStore((s) => s.config.appName);
  const now = new Date();

  return (
    <header className="hud-header">
      <div className="brand">
        <span className="emblem" aria-hidden="true"><Icon name="bat" /></span>
        <div>
          <h1>{appName}</h1>
          <div className="sub">Self-Improvement Command Console</div>
        </div>
      </div>
      <div className="header-spacer" />
      <div className="header-date">
        {now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase()}
        {" · "}
        <b>{now.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</b>
      </div>
      <div className="header-actions">
        <button className="btn ghost sm" onClick={onExport}>Export</button>
        <button className="btn ghost sm" onClick={onImport}>Import</button>
        <button className="btn danger sm" onClick={onReset}>Reset</button>
      </div>
    </header>
  );
}
