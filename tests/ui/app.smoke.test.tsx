// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

import { App } from "../../src/ui/App";
import { useStore } from "../../src/store/useStore";
import { DEFAULT_CONFIG } from "../../src/engine/config";

/**
 * Smoke tests that the ported UI actually mounts and drives the engine.
 * The canvas FX and IndexedDB are both absent in jsdom, so these also prove
 * the app degrades instead of crashing when neither is available.
 */

beforeEach(() => {
  useStore.getState().resetAll();
});

afterEach(cleanup);

async function mount() {
  render(<App />);
  await waitFor(() => expect(useStore.getState().ready).toBe(true));
}

describe("The console boots", () => {
  it("renders the title and all five pillars", async () => {
    await mount();
    expect(screen.getByText("GOTHAM PROTOCOL")).toBeTruthy();
    for (const p of DEFAULT_CONFIG.pillars) {
      expect(screen.getByText(p.name), `${p.name} missing`).toBeTruthy();
    }
  });

  it("starts a fresh profile at overall level 0, rank Drifter", async () => {
    await mount();
    // Drifter renders twice: the portrait placeholder caption and the rank title.
    expect(screen.getAllByText("Drifter")).toHaveLength(2);
    expect(screen.getByText("Overall Level")).toBeTruthy();
    expect(document.querySelector(".overall-row .lvl")?.textContent).toBe("0");
  });

  it("survives having no canvas and no IndexedDB", async () => {
    await mount();
    expect(document.querySelector("#fog")).toBeTruthy();
    expect(document.querySelector(".portrait-smoke")).toBeTruthy();
  });
});

describe("Logging an action drives the engine", () => {
  it("a quick-log click adds history and XP", async () => {
    await mount();
    fireEvent.click(screen.getByText("Workout"));

    await waitFor(() => {
      const s = useStore.getState();
      expect(s.history).toHaveLength(1);
      expect(s.history[0].action).toBe("Workout");
      expect(s.pillars.forge.xp).toBe(50);
    });
  });

  it("enough logs level the pillar and fire a level-up toast", async () => {
    await mount();
    const btn = screen.getByText("Workout");
    fireEvent.click(btn);
    fireEvent.click(btn); // 100 XP total, past the 80 needed for level 1

    await waitFor(() => {
      const s = useStore.getState();
      expect(s.pillars.forge.level).toBe(1);
      expect(s.pillars.forge.xp).toBe(20);
      expect(s.toasts.some((t) => t.kind === "levelup")).toBe(true);
    });
  });

  it("the level-up toast renders the pillar name as text, never as markup", async () => {
    useStore.getState().setConfig((c) => {
      c.pillars[0].name = "<img src=x onerror=alert(1)>";
    });
    await mount();
    fireEvent.click(screen.getAllByText("Workout")[0]);
    fireEvent.click(screen.getAllByText("Workout")[0]);

    await waitFor(() => expect(useStore.getState().toasts.length).toBeGreaterThan(0));
    expect(document.querySelector("#toast-container img")).toBeNull();
  });
});

describe("The Nemesis bar", () => {
  it("stays hidden on a pillar you have never logged", async () => {
    await mount();
    expect(document.querySelector('[data-nemesis="forge"]')).toBeNull();
  });

  it("appears the moment the pillar is first logged, holding the line", async () => {
    await mount();
    fireEvent.click(screen.getByText("Workout"));

    await waitFor(() => expect(document.querySelector('[data-nemesis="forge"]')).toBeTruthy());
    expect(screen.getByText("vs BANE")).toBeTruthy();
    expect(screen.getByText("held the line")).toBeTruthy();
  });

  it("shows a villain only for the pillars that have been started", async () => {
    await mount();
    fireEvent.click(screen.getByText("Workout"));

    await waitFor(() => expect(document.querySelector('[data-nemesis="forge"]')).toBeTruthy());
    expect(document.querySelector('[data-nemesis="craft"]')).toBeNull();
    expect(document.querySelector('[data-nemesis="archive"]')).toBeNull();
  });

  it("gives the player the whole bar on day one", async () => {
    await mount();
    fireEvent.click(screen.getByText("Workout"));

    await waitFor(() => {
      const you = document.querySelector<HTMLElement>('[data-nemesis="forge"] .tug-you');
      expect(parseFloat(you?.style.width ?? "0")).toBeCloseTo(100);
    });
  });
});

describe("Tabs switch views", () => {
  it("History shows the empty state, then the logged entry", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/No entries yet/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Pillars" }));
    fireEvent.click(screen.getByText("Deep work hr"));
    fireEvent.click(screen.getByRole("tab", { name: "History" }));

    await waitFor(() => expect(screen.getByText("Deep work hr")).toBeTruthy());
  });

  it("Stats and Settings both render", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Stats" }));
    expect(screen.getByText("Analytics")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByText("Console Configuration")).toBeTruthy();
    expect(screen.getByText("XP Curve")).toBeTruthy();
  });
});
