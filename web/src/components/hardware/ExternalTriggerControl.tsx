import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";

interface Props {
  sessionId: string;
}

/**
 * External start-trigger card.
 *
 * Deliberately has no Arm/Disarm buttons. Arming is a session-start action, not
 * a device action: it goes through `POST /program/{id}/arm-trigger` so the host
 * can reset its run buffers and move the session to "armed" in the same step.
 * Sending 1200/1201 as raw commands here would bypass that and be rejected
 * anyway — the generic command endpoint only accepts a "connected" session.
 *
 * The armed flag below is a read-only mirror of firmware state, synced from the
 * level-000 config dump.
 */
export function ExternalTriggerControl({ sessionId }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const trigger = session?.hardwareUi.externalTrigger;
  const armed = trigger?.armed ?? false;
  const isArmedState = session?.state === "armed";

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        External Start Trigger
        <PinField sessionId={sessionId} component="ext_trigger" />
      </h3>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            armed ? "bg-amber-500 animate-pulse" : "bg-theme-text/25"
          }`}
        />
        <span className="text-sm font-mono text-theme-text/60">
          {isArmedState
            ? "Waiting for trigger"
            : armed
              ? "Firmware armed"
              : "Not armed"}
        </span>
      </div>
      <p className="text-xs text-theme-text/50 leading-relaxed">
        Starts the session from a rising TTL edge instead of the Start button, so
        the rig can follow an external instrument. Wire the source to this pin and
        share a ground with the board. Choose <span className="font-mono">Wait for
        external trigger</span> in the start dialog to arm — the run begins when the
        edge arrives, and the two-photon frame output fires then too.
      </p>
    </div>
  );
}
