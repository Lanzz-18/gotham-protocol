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
  localStorage.clear(); // "already shown you this" memory, so each test starts fresh
});

afterEach(cleanup);

/** Render, press past the opening splash, and stop on the main menu. */
async function mountMenu() {
  render(<App />);
  await waitFor(() => expect(useStore.getState().ready).toBe(true));
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(document.querySelector(".splash")).toBeNull());
}

describe("The opening splash", () => {
  it("opens on Press any key, over the menu", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Press any key")).toBeTruthy());
    expect(document.querySelector(".menu")).toBeTruthy();
  });

  it("keeps the menu unreachable until it hands over", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector(".splash")).toBeTruthy());
    expect(document.querySelector(".menu")?.hasAttribute("inert")).toBe(true);
  });

  it("Enter on the splash starts it — it never presses Go to home underneath", async () => {
    await mountMenu();
    expect(document.querySelector(".menu")).toBeTruthy();
    expect(document.querySelector(".menu")?.hasAttribute("inert")).toBe(false);
  });

  it("a tap works the same as a key", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector(".splash")).toBeTruthy());
    fireEvent.pointerDown(document.querySelector(".splash")!);
    await waitFor(() => expect(document.querySelector(".splash")).toBeNull());
  });

  it("doesn't come back when you return to the menu from the console", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Main Menu" }));
    await waitFor(() => expect(document.querySelector(".menu")).toBeTruthy(), { timeout: 2000 });
    expect(document.querySelector(".splash")).toBeNull();
  });
});

/** Render, then step through the main menu into the console. */
async function mount() {
  await mountMenu();
  fireEvent.click(screen.getByRole("button", { name: /go to home/i }));
  await waitFor(() => expect(document.querySelector(".menu")).toBeNull());
}

describe("The main menu", () => {
  it("is what you land on, with the hero plate and its smoke", async () => {
    await mountMenu();
    expect(document.querySelector(".menu")).toBeTruthy();
    expect(document.querySelector<HTMLImageElement>(".menu-plate")?.getAttribute("src")).toBe("menu-hero.webp");
    expect(document.querySelector(".menu-smoke")).toBeTruthy();
  });

  it("hides the console until you go in", async () => {
    await mountMenu();
    expect(screen.getByRole("button", { name: /go to home/i })).toBeTruthy();
    expect(document.querySelector(".menu")).toBeTruthy();
  });

  it("Go to home opens the console", async () => {
    await mount();
    expect(document.querySelector(".menu")).toBeNull();
    expect(document.querySelector(".pillar-grid")).toBeTruthy();
  });

  it("the bat mark takes you back to the menu", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /back to main menu/i }));
    // the console fades out before the menu remounts, so this crosses a real delay
    await waitFor(() => expect(document.querySelector(".menu")).toBeTruthy(), { timeout: 2000 });
  });

  it("the Main Menu button does the same", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Main Menu" }));
    await waitFor(() => expect(document.querySelector(".menu")).toBeTruthy(), { timeout: 2000 });
  });
});

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
    // Only the rank title now — a fresh profile ships with a default portrait
    // for tier 0, so the placeholder caption (which only renders when there
    // is no image) never appears alongside it.
    expect(screen.getAllByText("Drifter")).toHaveLength(1);
    expect(document.querySelector(".portrait-frame img")).toBeTruthy();
    expect(screen.getByText("Overall Level")).toBeTruthy();
    expect(document.querySelector(".overall-row .lvl")?.textContent).toBe("0");
  });

  it("survives having no canvas and no IndexedDB", async () => {
    await mount();
    expect(document.querySelector("#dots")).toBeTruthy();
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

  it("the ring waits for the XP to land, then catches up", async () => {
    await mount();
    const btn = screen.getByText("Workout");
    fireEvent.click(btn);
    fireEvent.click(btn); // 100 XP: level 1
    const ringLevel = () => document.querySelector('[data-pillar="forge"] .pc-ring .lv b')?.textContent;
    expect(useStore.getState().pillars.forge.level).toBe(1);
    expect(ringLevel()).toBe("0"); // the store has it; the ring is still waiting
    // lands at ~0.56s, then the digit rolls for 0.7s before settling back to plain text
    await waitFor(() => expect(ringLevel()).toBe("1"), { timeout: 2500 });
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

describe("I'm tired Alfred", () => {
  it("asks first, then marks the week as rest and offers to cancel", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "I'm tired Alfred" }));
    expect(screen.getByText("Take the week, Master Wayne?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rest this week" }));
    await waitFor(() => expect(useStore.getState().config.restWeeks).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Cancel rest week" })).toBeTruthy();
    expect(screen.getByText("Resting · back Monday")).toBeTruthy();

    expect(document.querySelector(".app")?.classList.contains("resting")).toBe(true); // the console goes grey

    fireEvent.click(screen.getByRole("button", { name: "Cancel rest week" }));
    await waitFor(() => expect(useStore.getState().config.restWeeks).toHaveLength(0));
    expect(document.querySelector(".app")?.classList.contains("resting")).toBe(false);
  });

  it("Keep fighting closes the question without changing anything", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "I'm tired Alfred" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep fighting" }));
    expect(screen.queryByText("Take the week, Master Wayne?")).toBeNull();
    expect(useStore.getState().config.restWeeks ?? []).toHaveLength(0);
  });
});

describe("Rogues gallery", () => {
  it("stands every villain in the hall with a power meter", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    expect(screen.getByText("Rogues Gallery")).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(DEFAULT_CONFIG.pillars.length);
    expect(screen.getByText("Log a pillar to wake its villain.")).toBeTruthy();
  });

  it("wakes a villain once its pillar is logged", async () => {
    await mount();
    fireEvent.click(screen.getByText("Workout"));
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    await waitFor(() =>
      expect(document.querySelector('[data-rogue="forge"]')?.classList.contains("dormant")).toBe(false),
    );
    expect(document.querySelector('[data-rogue="craft"]')?.classList.contains("dormant")).toBe(true);
  });

  it("tapping a villain opens its case file; Escape closes it", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    fireEvent.click(screen.getByRole("button", { name: "TWO-FACE case file" }));
    const panel = screen.getByRole("dialog", { name: "TWO-FACE case file" });
    expect(panel.textContent).toContain("Last 14 days");
    expect(document.querySelector(".hall")?.classList.contains("focusing")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "TWO-FACE case file" })).toBeNull();
  });

  it("the case file's Go log button takes you to the pillars", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    fireEvent.click(screen.getByRole("button", { name: "BANE case file" }));
    fireEvent.click(screen.getByRole("button", { name: "Go log THE FORGE" }));
    expect(document.querySelector(".pillar-grid")).toBeTruthy();
  });

  it("slams the cell door on a villain the first time it's seen locked up", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" })); // seen while dormant
    expect(document.querySelector('[data-rogue="forge"] .rogue-bars')).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Pillars" }));
    fireEvent.click(screen.getByText("Workout")); // logged today: 0% power, locked up
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    expect(document.querySelector('[data-rogue="forge"] .rogue-bars.slam')).toBeTruthy();
    expect(document.querySelector('[data-rogue="forge"] .rogue-stamp')).toBeTruthy();

    // Seen once — next visit the bars are just there, no slam.
    fireEvent.click(screen.getByRole("tab", { name: "Pillars" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    expect(document.querySelector('[data-rogue="forge"] .rogue-bars')).toBeTruthy();
    expect(document.querySelector('[data-rogue="forge"] .rogue-bars.slam')).toBeNull();
  });

  it("the status report marks today's logged pillar as handled and drops the threat", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    const threat = () => document.querySelector(".status-v b")?.textContent;
    expect(threat()).toBe("100%");

    fireEvent.click(screen.getByRole("tab", { name: "Pillars" }));
    fireEvent.click(screen.getByText("Workout"));
    fireEvent.click(screen.getByRole("tab", { name: "Rogues" }));
    await waitFor(() => expect(document.querySelector('[data-status="forge"]')?.textContent).toContain("Handled"));
    expect(threat()).toBe("80%");
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
