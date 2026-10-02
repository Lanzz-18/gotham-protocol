import { useEffect, useState } from "react";

const ROLL_MS = 700;
const DIGITS = "0123456789".split("");

interface RollProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

/**
 * A number that rolls like an odometer when it changes, instead of jumping.
 * Each digit column slides from its old digit to its new one. At rest it's
 * plain text again — so screen readers, copy-paste and tests all see the real
 * value, and the strips only exist for the 0.7s the roll takes.
 */
export function Roll({ value, format = String, className }: RollProps) {
  const text = format(value);
  // `from` is what was showing before the latest change; equal to `shown` at rest.
  const [state, setState] = useState({ shown: text, from: text, key: 0 });
  if (state.shown !== text) {
    setState({ shown: text, from: state.shown, key: state.key + 1 });
  }

  const rolling = state.from !== state.shown;
  useEffect(() => {
    if (!rolling) return;
    const t = window.setTimeout(() => setState((s) => ({ ...s, from: s.shown })), ROLL_MS);
    return () => clearTimeout(t);
  }, [rolling, state.key]);

  // Bare text at rest, so it styles exactly like the number it replaced.
  if (!rolling) return className ? <span className={className}>{text}</span> : <>{text}</>;

  // Line both strings up from the right, so units roll against units.
  const len = Math.max(state.from.length, text.length);
  const from = state.from.padStart(len, " ");
  const to = text.padStart(len, " ");

  return (
    <span className={"roll " + (className ?? "")} aria-label={text} key={state.key}>
      {to.split("").map((c, i) => {
        if (!/\d/.test(c)) return <span key={i} className="roll-ch" aria-hidden="true">{c === " " ? "" : c}</span>;
        const a = /\d/.test(from[i]) ? Number(from[i]) : 0;
        const b = Number(c);
        return (
          <span key={i} className="roll-col" aria-hidden="true">
            <span
              className="roll-strip"
              style={{ ["--a" as string]: `${-a * 10}%`, ["--b" as string]: `${-b * 10}%` }}
            >
              {DIGITS.map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
