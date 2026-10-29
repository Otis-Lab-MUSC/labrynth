import { useState, useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { uploadKey, useCardSyncStore } from "../../store/useCardSyncStore";
import {
  LIMIT_DEFAULTS, buildLimitPayload, getMissingLimitFields, hasInfusionLimit, hasTimeLimit,
  isValidInfusionLimit, isValidStopDelay, isValidTimeLimit, type LimitValues,
} from "../../lib/limits";
import { describeMissingFields, describeUnsent } from "../../lib/cardSet";
import { MenuButton } from "../hardware/MenuButton";
import { UploadIconButton, type UploadButtonTone } from "../hardware/UploadIconButton";

/** `pumps: null` is Auto: the server counts whichever pump is the active reward pump. */
const COUNTED_PUMP_OPTIONS: { value: string; label: string; pumps: string[] | null }[] = [
  { value: "auto", label: "Auto (reward pump)", pumps: null },
  { value: "PUMP_1", label: "Pump 1", pumps: ["PUMP_1"] },
  { value: "PUMP_2", label: "Pump 2", pumps: ["PUMP_2"] },
  { value: "both", label: "Pump 1 + Pump 2", pumps: ["PUMP_1", "PUMP_2"] },
];

const countedPumpsValue = (pumps: string[] | null) =>
  pumps === null ? "auto" : pumps.length > 1 ? "both" : pumps[0];

const OPERANT_TYPES = [
  { value: "Time", label: "Time" },
  { value: "Infusion", label: "Infusion" },
  { value: "Both", label: "Both" },
];
const PAVLOVIAN_TYPES = [
  { value: "Trials", label: "Trials" },
  { value: "Infusion", label: "Infusion" },
];

type NumberField = "timeLimit" | "infusionLimit" | "delay";

const FIELD_LABEL: Record<NumberField, string> = {
  timeLimit: "Time Limit (s)",
  infusionLimit: "Infusion Limit",
  delay: "Stop Delay (s)",
};

const FIELD_VALID: Record<NumberField, (v: number) => boolean> = {
  timeLimit: isValidTimeLimit,
  infusionLimit: isValidInfusionLimit,
  delay: isValidStopDelay,
};

interface Props {
  sessionId: string;
  paradigm?: string;
  /** Reports the on-screen limits, uploaded or not, so "Save Preset" captures what the user sees. */
  onDraftChange?: (limits: { limitType: string; timeLimit: number; infusionLimit: number; delay: number; countedPumps: string[] | null }) => void;
}

/**
 * Session limits. The type and the counted pumps are menu buttons: picking one saves it, and it
 * reaches the server with the next limit uploaded (Start always sends the saved limits). Each
 * number has its own upload button beside it.
 */
export function LimitConfig({ sessionId, paradigm, onDraftChange }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setLimitSettings = useSessionStore((s) => s.setLimitSettings);
  const sigs = useCardSyncStore((s) => s.sigs);
  const record = useCardSyncStore((s) => s.record);

  const isPavlovian = paradigm === "pavlovian";
  const defaultLimitType = isPavlovian ? "Trials" : "Time";

  const [limitType, setLimitType] = useState(() => session?.limitSettings?.limitType ?? defaultLimitType);
  const [timeLimit, setTimeLimit] = useState(() => session?.limitSettings?.timeLimit ?? LIMIT_DEFAULTS.timeLimit);
  const [infusionLimit, setInfusionLimit] = useState(() => session?.limitSettings?.infusionLimit ?? LIMIT_DEFAULTS.infusionLimit);
  const [delay, setDelay] = useState(() => session?.limitSettings?.delay ?? LIMIT_DEFAULTS.delay);
  const [countedPumps, setCountedPumps] = useState<string[] | null>(() => session?.limitSettings?.countedPumps ?? null);
  const [sending, setSending] = useState<NumberField | null>(null);
  const [error, setError] = useState<string | null>(null);

  // These inputs seed once, but a "Full Reset" nulls limitSettings underneath a panel that never
  // unmounts (useSessionStore.resetSessionData), so without this they keep displaying the
  // pre-reset limits while the store holds nothing. Resyncing keeps the two in agreement.
  useEffect(() => {
    if (session?.limitSettings) return;
    setLimitType(defaultLimitType);
    setTimeLimit(LIMIT_DEFAULTS.timeLimit);
    setInfusionLimit(LIMIT_DEFAULTS.infusionLimit);
    setDelay(LIMIT_DEFAULTS.delay);
    setCountedPumps(null);
  }, [session?.limitSettings, defaultLimitType]);

  useEffect(() => {
    onDraftChange?.({ limitType, timeLimit, infusionLimit, delay, countedPumps });
  }, [limitType, timeLimit, infusionLimit, delay, countedPumps, onDraftChange]);

  const onScreen: LimitValues = { limitType, timeLimit, infusionLimit, delay, countedPumps };
  const missing = getMissingLimitFields(onScreen);
  const values: Record<NumberField, number> = { timeLimit, infusionLimit, delay };
  const setters: Record<NumberField, (v: number) => void> = { timeLimit: setTimeLimit, infusionLimit: setInfusionLimit, delay: setDelay };
  const fieldKey = (field: NumberField) => uploadKey(sessionId, "limits", field);
  const visibleFields: NumberField[] = [
    ...(!isPavlovian && hasTimeLimit(limitType) ? (["timeLimit"] as const) : []),
    ...(hasInfusionLimit(limitType) ? (["infusionLimit", "delay"] as const) : []),
  ];
  // A never-sent stop delay of 0 matches the server's default (no delay), so it does not warn.
  const isFieldUnsent = (field: NumberField) => {
    if (!FIELD_VALID[field](values[field])) return false;
    const last = sigs[fieldKey(field)];
    if (last === undefined && field === "delay") return values.delay !== 0;
    return last !== String(values[field]);
  };

  /** Save a choice to the store (Start sends what is saved). */
  const save = (patch: Partial<LimitValues>) =>
    setLimitSettings(sessionId, { limitType, timeLimit, infusionLimit, delay, countedPumps, ...patch });

  const handleType = (value: string) => {
    setLimitType(value);
    save({ limitType: value });
  };

  const handleCountedPumps = (value: string) => {
    const pumps = COUNTED_PUMP_OPTIONS.find((o) => o.value === value)?.pumps ?? null;
    setCountedPumps(pumps);
    save({ countedPumps: pumps });
  };

  const handleUpload = async (field: NumberField) => {
    if (!FIELD_VALID[field](values[field]) || sending) return;
    save({});
    // Sends every valid limit on screen, so the saved type and counted pumps go out with it.
    const payload = buildLimitPayload(onScreen);
    const client = session?.draft ? null : getClientForSession(sessionId);
    if (!payload || !client) {
      record(fieldKey(field), String(values[field]));
      return;
    }
    setSending(field);
    try {
      await client.setLimit(sessionId, payload);
      // Mark only what this request carried: a "Both" sent as "Time" did not carry the stop delay.
      const carried: Record<NumberField, boolean> = {
        timeLimit: payload.time_limit !== undefined,
        infusionLimit: payload.infusion_limit !== undefined,
        delay: payload.delay !== undefined,
      };
      for (const f of visibleFields) if (carried[f]) record(fieldKey(f), String(values[f]));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(null);
    }
  };

  const numberRow = (field: NumberField, min: number, max: number) => {
    const valid = FIELD_VALID[field](values[field]);
    const unsent = isFieldUnsent(field);
    let tone: UploadButtonTone = "default";
    if (valid) tone = unsent ? "pending" : "sent";
    let title = `Upload ${FIELD_LABEL[field]}`;
    if (!valid) title = `Fill in ${FIELD_LABEL[field]} first`;
    else if (!unsent) title = `${FIELD_LABEL[field]} is set`;
    return (
      <div className="flex items-center gap-2" key={field}>
        <label className="text-sm w-32 text-theme-text/60">{FIELD_LABEL[field]}:</label>
        <input type="number" value={values[field]} min={min} max={max}
          onChange={(e) => setters[field](+e.target.value)}
          data-log-id={`limits-${field}`}
          className={`w-24 input-base${valid ? "" : " border-red-500"}`} />
        <UploadIconButton
          onClick={() => handleUpload(field)}
          disabled={!valid || sending !== null}
          title={title}
          tone={tone}
          sending={sending === field}
        />
      </div>
    );
  };

  const unsentLabels = visibleFields.filter(isFieldUnsent).map((f) => FIELD_LABEL[f]);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Limits</h3>
      <div className="flex items-center gap-2">
        <label className="text-sm w-32 text-theme-text/60">Type:</label>
        <MenuButton
          value={limitType}
          options={isPavlovian ? PAVLOVIAN_TYPES : OPERANT_TYPES}
          onSelect={handleType}
          title="Picking a type saves it; it is sent with the next limit you upload"
          logId="limits-type"
          className="w-24"
        />
      </div>

      {!isPavlovian && hasTimeLimit(limitType) && numberRow("timeLimit", 1, 86400)}

      {hasInfusionLimit(limitType) && (
        <>
          {numberRow("infusionLimit", 1, 10000)}
          <div className="flex items-center gap-2">
            <label className="text-sm w-32 text-theme-text/60">Counts toward:</label>
            <MenuButton
              value={countedPumpsValue(countedPumps)}
              options={COUNTED_PUMP_OPTIONS}
              onSelect={handleCountedPumps}
              title="Picking saves it; it is sent with the next limit you upload"
              logId="limits-counted-pumps"
            />
          </div>
          {numberRow("delay", 0, 86400)}
        </>
      )}

      {missing.length > 0 && <p className="text-xs text-red-400" role="status">{describeMissingFields(missing)}</p>}
      {unsentLabels.length > 0 && (
        <p className="text-xs font-semibold text-amber-500" aria-live="polite">{describeUnsent(unsentLabels)}</p>
      )}
      {error && <p className="text-xs text-red-500" role="alert">Upload failed: {error}</p>}
    </div>
  );
}
