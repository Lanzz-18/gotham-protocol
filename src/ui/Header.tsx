import { Icon } from "./Icons";
import { useStore } from "../store/useStore";

export type View = "dashboard" | "history" | "stats" | "settings";

const LINKS: Array<[View, string]> = [
  ["dashboard", "Pillars"],
  ["history", "History"],
  ["stats", "Stats"],
  ["settings", "Settings"],
];

interface HeaderProps {
  view: View;
  onView: (v: View) => void;
  onCustomLog: () => void;
}

export function Header({ view, onView, onCustomLog }: HeaderProps) {
  const appName = useStore((s) => s.config.appName);

  return (
    <header className="nav">
      <span className="nav-mark" aria-hidden="true"><Icon name="bat" /></span>
      <span className="nav-word">{appName}</span>

      <nav className="nav-links" role="tablist" aria-label="Views">
        {LINKS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            className="nav-link"
            onClick={() => onView(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <button className="nav-cta" onClick={onCustomLog}>Log action</button>
    </header>
  );
}
