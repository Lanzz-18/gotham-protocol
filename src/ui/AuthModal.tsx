import { useState } from "react";

import { useStore } from "../store/useStore";
import { Modal, type ModalAction } from "./Modal";

interface AuthModalProps {
  onClose: () => void;
}

/**
 * One modal, two modes. Sign Up asks for a name (shown in the nav once
 * signed in) on top of the usual email + password; Sign In just needs the
 * two. A link at the bottom swaps between them without closing the dialog.
 */
export function AuthModal({ onClose }: AuthModalProps) {
  const signUp = useStore((s) => s.signUp);
  const signIn = useStore((s) => s.signIn);
  const authBusy = useStore((s) => s.authBusy);
  const authMessage = useStore((s) => s.authMessage);
  const pushToast = useStore((s) => s.pushToast);

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = mode === "signin"
    ? email.trim() && password
    : name.trim() && email.trim() && password.length >= 6;

  const submit = async () => {
    const ok = mode === "signup"
      ? await signUp(name.trim(), email.trim(), password)
      : await signIn(email.trim(), password);
    if (ok) {
      pushToast(mode === "signup" ? "Account created. You're signed in." : "Signed in.", "ok");
      onClose();
    }
  };

  const actions: ModalAction[] = [
    { label: "Cancel", cls: "ghost", act: onClose },
    {
      label: authBusy ? "Working…" : mode === "signup" ? "Create account" : "Sign in",
      cls: "accent",
      act: () => { if (canSubmit && !authBusy) void submit(); },
    },
  ];

  return (
    <Modal
      title={mode === "signup" ? "Create Account" : "Sign In"}
      sub={
        mode === "signup"
          ? "One account, every device — your pillars and history follow you."
          : "Welcome back."
      }
      actions={actions}
      onClose={onClose}
    >
      <div className="form-col">
        {mode === "signup" && (
          <label className="field">Name
            <input
              type="text" maxLength={40} autoFocus placeholder="What should we call you"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label className="field">Email
          <input
            type="email" placeholder="you@example.com" autoFocus={mode === "signin"}
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">Password
          <input
            type="password" placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit && !authBusy) void submit(); }}
          />
        </label>

        {authMessage && (
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{authMessage}</div>
        )}

        <button
          type="button"
          className="btn ghost sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </Modal>
  );
}
