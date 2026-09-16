import { useEffect, useRef, useState } from "react";

import { useStore } from "../store/useStore";
import { useFog } from "../fx/useFog";
import { downloadBlob, stamp } from "../lib/format";
import { ping, stinger } from "../lib/audio";
import { Header } from "./Header";
import { ProfilePanel } from "./ProfilePanel";
import { PillarGrid } from "./PillarGrid";
import { HistoryView } from "./HistoryView";
import { StatsView } from "./StatsView";
import { SettingsView } from "./SettingsView";
import { Modal, type ModalAction } from "./Modal";
import { Toasts } from "./Toasts";
import { RankUpOverlay } from "./RankUpOverlay";
import type { LogEntry } from "../engine/types";
import type { PersistedState } from "../store/db";

type View = "dashboard" | "history" | "stats" | "settings";

type Dialog =
  | { kind: "none" }
  | { kind: "custom" }
  | { kind: "edit"; entry: LogEntry }
  | { kind: "confirm"; title: string; msg: string; onYes: () => void };

const TABS: Array<[View, string]> = [
  ["dashboard", "Pillars"],
  ["history", "History"],
  ["stats", "Stats"],
  ["settings", "Settings"],
];

export function App() {
  const store = useStore();
  const {
    ready, config, settings, hydrate, addLog, editLog, deleteLog,
    setPortrait, removePortrait, replaceAll, resetAll, pushToast,
    rankUpTier, clearRankUp,
  } = store;

  const [view, setView] = useState<View>("dashboard");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  const importRef = useRef<HTMLInputElement | null>(null);
  const portraitRef = useRef<HTMLInputElement | null>(null);
  const portraitTier = useRef(0);

  const prefersReduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const motion = settings.motion && !prefersReduce;

  const fogRef = useFog(motion);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", settings.accent);
    document.body.classList.toggle("reduce-motion", !motion);
    document.title = config.appName;
  }, [settings.accent, motion, config.appName]);

  useEffect(() => { if (rankUpTier !== null) stinger(settings.sound); }, [rankUpTier, settings.sound]);

  const closeDialog = () => setDialog({ kind: "none" });

  const confirm = (title: string, msg: string, onYes: () => void) =>
    setDialog({ kind: "confirm", title, msg, onYes });

  /* ---- backup ---- */
  const onExport = () => {
    const payload: PersistedState = {
      version: 2,
      config: store.config,
      history: store.history,
      portraits: store.portraits,
      settings: store.settings,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `gotham-protocol-backup-${stamp()}.json`,
    );
    pushToast("Backup exported.", "ok");
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const obj = JSON.parse(String(e.target?.result));
        if (!obj || typeof obj !== "object" || (!obj.history && !obj.config)) {
          throw new Error("Not a Gotham Protocol backup.");
        }
        replaceAll(obj as PersistedState);
        pushToast("Backup imported. Welcome back.", "ok");
      } catch (err) {
        pushToast("Import failed: " + (err as Error).message, "warn");
      }
    };
    reader.readAsText(file);
  };

  /* ---- portraits (downscale to 512px, store as data URL) ---- */
  const onPortraitFile = (file: File) => {
    const tier = portraitTier.current;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 512;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          const s = Math.min(MAX / w, MAX / h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")?.drawImage(img, 0, 0, w, h);
        try {
          setPortrait(tier, c.toDataURL("image/jpeg", 0.85));
          pushToast(`Portrait set for tier ${tier}.`, "ok");
        } catch {
          pushToast("Could not process image.", "warn");
        }
      };
      img.onerror = () => pushToast("That file isn't a readable image.", "warn");
      img.src = String(e.target?.result);
    };
    reader.readAsDataURL(file);
  };

  const askPortrait = (tier: number) => {
    portraitTier.current = tier;
    portraitRef.current?.click();
  };

  const onReset = () =>
    confirm(
      "Reset everything?",
      "This erases all pillar progress, history, portraits and settings, returning to defaults. Export a backup first if unsure.",
      () => { resetAll(); pushToast("Protocol reset.", "ok"); },
    );

  if (!ready) return null;

  const rank = rankUpTier !== null ? config.ranks[rankUpTier] : null;

  return (
    <>
      <canvas id="fog" ref={fogRef} aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <div className="app">
        <Header onExport={onExport} onImport={() => importRef.current?.click()} onReset={onReset} />

        <div className="hud-body">
          <ProfilePanel onUploadPortrait={askPortrait} motion={motion} />

          <section>
            <nav className="tabs" role="tablist">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  className={"tab" + (view === id ? " active" : "")}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {view === "dashboard" && (
              <div className="view" role="tabpanel">
                <div className="toolbar-row">
                  <h2 className="section-title" style={{ flex: 1 }}>Five Pillars</h2>
                  <button className="btn accent sm" onClick={() => setDialog({ kind: "custom" })}>+ Custom Log</button>
                </div>
                <PillarGrid />
              </div>
            )}

            {view === "history" && (
              <HistoryView
                onEdit={(entry) => setDialog({ kind: "edit", entry })}
                onDelete={(id) =>
                  confirm(
                    "Delete entry?",
                    "This removes the log and recomputes your XP and levels. This cannot be undone.",
                    () => { deleteLog(id); pushToast("Entry deleted.", "ok"); },
                  )
                }
              />
            )}

            {view === "stats" && <StatsView />}

            {view === "settings" && (
              <SettingsView
                onUploadPortrait={askPortrait}
                onRemovePortrait={(tier) =>
                  confirm("Remove portrait?", "This deletes the uploaded image for this rank tier.", () => {
                    removePortrait(tier);
                    pushToast("Portrait removed.", "ok");
                  })
                }
                onExport={onExport}
                onImport={() => importRef.current?.click()}
                onReset={onReset}
              />
            )}
          </section>
        </div>
      </div>

      {dialog.kind === "custom" && (
        <CustomLogDialog
          onClose={closeDialog}
          onSubmit={(pillar, action, xp, note) => {
            closeDialog();
            addLog(pillar, action, xp, note);
            ping(settings.sound);
          }}
        />
      )}

      {dialog.kind === "edit" && (
        <EditLogDialog
          entry={dialog.entry}
          onClose={closeDialog}
          onSubmit={(patch) => { editLog(dialog.entry.id, patch); closeDialog(); pushToast("Entry updated.", "ok"); }}
        />
      )}

      {dialog.kind === "confirm" && (
        <Modal
          title={dialog.title}
          onClose={closeDialog}
          actions={[
            { label: "Cancel", cls: "ghost", act: closeDialog },
            { label: "Confirm", cls: "danger", act: () => { closeDialog(); dialog.onYes(); } },
          ]}
        >
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>{dialog.msg}</p>
        </Modal>
      )}

      {rank && <RankUpOverlay rank={rank} onDone={clearRankUp} />}
      <Toasts />

      <input
        type="file" hidden ref={importRef} accept="application/json,.json"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }}
      />
      <input
        type="file" hidden ref={portraitRef} accept="image/*"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPortraitFile(f); e.target.value = ""; }}
      />
    </>
  );
}

function CustomLogDialog({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (pillar: string, action: string, xp: number, note: string) => void;
}) {
  const pillars = useStore((s) => s.config.pillars);
  const [pillar, setPillar] = useState(pillars[0]?.id ?? "");
  const [action, setAction] = useState("");
  const [xp, setXp] = useState(30);
  const [note, setNote] = useState("");

  const actions: ModalAction[] = [
    { label: "Cancel", cls: "ghost", act: onClose },
    { label: "Log it", cls: "accent", act: () => onSubmit(pillar, action.trim() || "Custom log", Math.max(1, xp), note.trim()) },
  ];

  return (
    <Modal title="Custom Log" sub="Record any action against a pillar." actions={actions} onClose={onClose}>
      <div className="form-col">
        <label className="field">Pillar
          <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
            {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">Action
          <input type="text" maxLength={80} autoFocus placeholder="e.g. Sparring session"
            value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <label className="field">XP
          <input type="number" min={1} max={100000} value={xp} onChange={(e) => setXp(Number(e.target.value) || 0)} />
        </label>
        <label className="field">Note (optional)
          <textarea rows={2} maxLength={240} placeholder="Context, how it felt..."
            value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function EditLogDialog({ entry, onClose, onSubmit }: {
  entry: LogEntry;
  onClose: () => void;
  onSubmit: (patch: Partial<Omit<LogEntry, "id">>) => void;
}) {
  const pillars = useStore((s) => s.config.pillars);
  const [pillar, setPillar] = useState(entry.pillar);
  const [action, setAction] = useState(entry.action);
  const [xp, setXp] = useState(entry.xp);
  const [note, setNote] = useState(entry.note);

  const actions: ModalAction[] = [
    { label: "Cancel", cls: "ghost", act: onClose },
    {
      label: "Save", cls: "accent",
      act: () => onSubmit({ pillar, action: action.trim() || "Log", xp: Math.max(0, xp), note: note.trim() }),
    },
  ];

  return (
    <Modal title="Edit Entry" sub="Adjust this log. XP and levels recompute automatically." actions={actions} onClose={onClose}>
      <div className="form-col">
        <label className="field">Pillar
          <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
            {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">Action
          <input type="text" maxLength={80} value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <label className="field">XP
          <input type="number" min={0} max={100000} value={xp} onChange={(e) => setXp(Number(e.target.value) || 0)} />
        </label>
        <label className="field">Note
          <textarea rows={2} maxLength={240} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
