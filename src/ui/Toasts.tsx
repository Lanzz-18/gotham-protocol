import { useStore } from "../store/useStore";
import { Icon } from "./Icons";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);

  return (
    <div id="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={"toast" + (t.kind === "levelup" ? " levelup" : "")}
          style={t.color ? { ["--sc" as string]: t.color } : undefined}
        >
          {t.kind === "levelup" && (
            <span className="star" style={{ color: t.color ?? "var(--accent)" }}><Icon name="star" /></span>
          )}
          <span>
            {t.subject && <b>{t.subject}</b>}
            {t.subject ? " " : ""}
            {t.text}
          </span>
        </div>
      ))}
    </div>
  );
}
