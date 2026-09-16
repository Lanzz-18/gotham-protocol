import { useState } from "react";

import { useStore } from "../store/useStore";
import { fullTime } from "../lib/format";
import { Icon } from "./Icons";
import type { LogEntry } from "../engine/types";

interface HistoryViewProps {
  onEdit: (entry: LogEntry) => void;
  onDelete: (id: string) => void;
}

export function HistoryView({ onEdit, onDelete }: HistoryViewProps) {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);

  const [pillar, setPillar] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  let items = history.slice().sort((a, b) => b.ts - a.ts);
  if (pillar !== "all") items = items.filter((h) => h.pillar === pillar);
  if (from) {
    const t = new Date(from + "T00:00:00").getTime();
    items = items.filter((h) => h.ts >= t);
  }
  if (to) {
    const t = new Date(to + "T23:59:59").getTime();
    items = items.filter((h) => h.ts <= t);
  }

  const byId = (id: string) => config.pillars.find((p) => p.id === id);

  return (
    <div className="view">
      <h2 className="section-title">Activity Log</h2>

      <div className="toolbar-row">
        <label className="field" style={{ textTransform: "none" }}>
          Filter pillar
          <select className="pillar-select" value={pillar} onChange={(e) => setPillar(e.target.value)}>
            <option value="all">All pillars</option>
            {config.pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field" style={{ textTransform: "none" }}>
          From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field" style={{ textTransform: "none" }}>
          To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          className="btn ghost sm"
          style={{ alignSelf: "flex-end" }}
          onClick={() => { setPillar("all"); setFrom(""); setTo(""); }}
        >
          Clear filters
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty">No entries yet. Log an action to begin your protocol.</div>
      ) : (
        <div className="timeline">
          {items.map((h) => {
            const p = byId(h.pillar);
            return (
              <div key={h.id} className="log-item" style={{ ["--pc" as string]: p?.accent ?? "#888" }}>
                <span className="log-dot" />
                <div className="log-main">
                  <div className="action">{h.action}</div>
                  <div className="meta">{p?.name ?? "?"} {"·"} {fullTime(h.ts)}</div>
                  {h.note && <div className="note">{h.note}</div>}
                </div>
                <div className="log-xp">+{h.xp}</div>
                <div className="log-tools">
                  <button className="icon-btn" onClick={() => onEdit(h)} aria-label="Edit entry">
                    <Icon name="edit" />
                  </button>
                  <button className="icon-btn danger" onClick={() => onDelete(h.id)} aria-label="Delete entry">
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
