import { useState } from "react";
import { createPortal } from "react-dom";

import { useStore } from "../store/useStore";
import { systemClock } from "../engine/clock";
import { dayIndexToTs, canRest, currentWeekStart, nextRestWeek, restWeeksUsed, REST_WEEKS_ALLOWED } from "../engine/week";
import { Modal } from "./Modal";

const LAMP_MS = 2800;

/**
 * "I'm tired Alfred" — the very bottom of the console. Takes the whole
 * current week off: villains hold, the streak is bridged, logging still works.
 */
export function RestWeek({ motion = true }: { motion?: boolean }) {
  const config = useStore((s) => s.config);
  const toggleRestWeek = useStore((s) => s.toggleRestWeek);
  const pushToast = useStore((s) => s.pushToast);
  const [asking, setAsking] = useState(false);
  const [lamp, setLamp] = useState(false);

  const list = config.restWeeks ?? [];
  const week = currentWeekStart(systemClock, config.dayBoundaryHour);
  const resting = list.includes(week);
  const left = REST_WEEKS_ALLOWED - restWeeksUsed(list, week);

  const rest = () => {
    setAsking(false);
    if (toggleRestWeek() !== "on") return;
    pushToast("Rest week on. The villains hold until Monday.", "ok");
    // Alfred's lamp: the room goes down to one soft light before the console greys out.
    if (motion) {
      setLamp(true);
      window.setTimeout(() => setLamp(false), LAMP_MS);
    }
  };

  const cancel = () => {
    toggleRestWeek();
    pushToast("Rest week cancelled. Back to it.", "ok");
  };

  let body;
  if (resting) {
    body = (
      <>
        <p className="alfred-note">Resting this week. Back Monday.</p>
        <button className="alfred-btn" onClick={cancel}>Cancel rest week</button>
      </>
    );
  } else if (canRest(list, week)) {
    body = (
      <button className="alfred-btn" onClick={() => setAsking(true)}>I'm tired Alfred</button>
    );
  } else {
    const opens = new Date(dayIndexToTs(nextRestWeek(list, week)))
      .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    body = <p className="alfred-note">You've had your two rest weeks. The next one opens {opens}.</p>;
  }

  return (
    <footer className="alfred">
      {body}
      {lamp && createPortal(
        <div className="lamp" aria-hidden="true">
          <span className="lamp-light" />
          <span className="lamp-line">Rest well, Master Wayne.</span>
        </div>,
        document.body,
      )}
      {asking && (
        <Modal
          title="Take the week, Master Wayne?"
          onClose={() => setAsking(false)}
          actions={[
            { label: "Keep fighting", cls: "ghost", act: () => setAsking(false) },
            { label: "Rest this week", cls: "accent", act: rest },
          ]}
        >
          <p className="alfred-copy">
            The villains hold position until Monday and your streak is safe. You can still log if you feel like it.
          </p>
          <p className="alfred-copy dim">
            {left - 1 === 0
              ? "This is your last rest week for now. You get two in any four weeks."
              : "You get two rest weeks in any four weeks. One left after this."}
          </p>
        </Modal>
      )}
    </footer>
  );
}
