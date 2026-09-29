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
  onMenu: () => void;
  onOpenAuth: () => void;
}

export function Header({ view, onView, onCustomLog, onMenu, onOpenAuth }: HeaderProps) {
  const appName = useStore((s) => s.config.appName);
  const user = useStore((s) => s.user);
  const signOutUser = useStore((s) => s.signOutUser);

  return (
    <header className="nav">
      <button className="nav-mark" onClick={onMenu} aria-label="Back to main menu">
        <Icon name="bat" />
      </button>
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

      <button className="nav-menu-btn" onClick={onMenu}>Main Menu</button>

      {user ? (
        <>
          <span className="nav-account">
            <span className="dot" aria-hidden="true" />
            {user.name}
          </span>
          <button className="nav-signout" onClick={() => void signOutUser()}>Sign out</button>
        </>
      ) : (
        <button className="nav-menu-btn" onClick={onOpenAuth}>Sign Up</button>
      )}

      <button className="nav-cta" onClick={onCustomLog}>Log action</button>
    </header>
  );
}
