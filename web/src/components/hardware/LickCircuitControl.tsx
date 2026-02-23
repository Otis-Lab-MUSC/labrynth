import { useState } from "react";
import * as api from "../../api/client";
import { HARDWARE_PINS } from "./pins";

interface Props {
  sessionId: string;
}

export function LickCircuitControl({ sessionId }: Props) {
  const [armed, setArmed] = useState(false);
  const send = (code: number) => api.sendCommand(sessionId, code);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        Lick Circuit
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pin {HARDWARE_PINS.LICK}</span>
      </h3>
      <div className="flex gap-2">
        <button
          onClick={() => { send(501); setArmed(true); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(500); setArmed(false); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
      </div>
    </div>
  );
}
