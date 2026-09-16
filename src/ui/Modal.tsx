import { useEffect, type ReactNode } from "react";

export interface ModalAction {
  label: string;
  cls?: string;
  act: () => void;
}

interface ModalProps {
  title: string;
  sub?: string;
  actions: ModalAction[];
  onClose: () => void;
  children?: ReactNode;
}

export function Modal({ title, sub, actions, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div id="modal-root" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="document">
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {children}
        <div className="actions">
          {actions.map((a, i) => (
            <button key={i} className={"btn " + (a.cls ?? "")} onClick={a.act}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
