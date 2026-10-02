import { useLayoutEffect, useRef } from "react";

import { Icon } from "./Icons";
import { useStore } from "../store/useStore";

export type View = "dashboard" | "rogues" | "history" | "stats" | "settings";

const LINKS: Array<[View, string]> = [
  ["dashboard", "Pillars"],
  ["rogues", "Rogues"],
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
  const linksRef = useRef<HTMLElement | null>(null);
  const batRef = useRef<HTMLSpanElement | null>(null);
  const placed = useRef(false);

  /* The batarang sits under the active tab. On a tab change it slides across
     and spins on the way; on first paint and on resize it just moves there. */
  useLayoutEffect(() => {
    const links = linksRef.current;
    const bat = batRef.current;
    if (!links || !bat) return;
    const place = () => {
      const tab = links.querySelector<HTMLElement>('[aria-selected="true"]');
      if (tab) bat.style.setProperty("--x", `${tab.offsetLeft + tab.offsetWidth / 2}px`);
    };
    if (placed.current) {
      // Restart the spin, and switch the slide on BEFORE moving, or it jumps.
      bat.classList.remove("fly");
      void bat.offsetWidth;
      bat.classList.add("fly");
    } else {
      bat.classList.add("ready");
      placed.current = true;
    }
    place();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(place);
    ro.observe(links);
    return () => ro.disconnect();
  }, [view]);

  return (
    <header className="nav">
      <button className="nav-mark" onClick={onMenu} aria-label="Back to main menu">
        <Icon name="bat" />
      </button>
      <span className="nav-word">{appName}</span>

      <nav className="nav-links" role="tablist" aria-label="Views" ref={linksRef}>
        <span className="nav-bat" ref={batRef} aria-hidden="true">
          <svg viewBox="0 0 40 12">
            <path d="M20 2 L22 4.2 L24 2.6 C28 5 33 4.2 40 1.6 C36 5.8 33 8.6 30 8 C27 7.8 25 9.6 20 12 C15 9.6 13 7.8 10 8 C7 8.6 4 5.8 0 1.6 C7 4.2 12 5 16 2.6 L18 4.2 Z" fill="currentColor" />
          </svg>
        </span>
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
