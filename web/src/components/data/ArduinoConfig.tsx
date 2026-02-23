import type { FirmwareConfig } from "../../types";

interface ArduinoConfigProps {
  firmwareInfo: FirmwareConfig | null;
  hardwareSettings: FirmwareConfig[];
}

const INTERNAL_FIELDS = new Set(["level", "device"]);

export function ArduinoConfig({ firmwareInfo, hardwareSettings }: ArduinoConfigProps) {
  if (!firmwareInfo && hardwareSettings.length === 0) {
    return (
      <div className="card">
        <h3 className="font-medium text-theme-text">Arduino Configuration</h3>
        <p className="text-sm text-theme-text/60 font-mono">No configuration received.</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-medium text-theme-text">Arduino Configuration</h3>

      {firmwareInfo && (
        <div>
          <h4 className="text-sm font-semibold text-accent mb-1">Controller</h4>
          <div className="rounded border border-theme-border bg-surface p-3 font-mono text-sm space-y-1">
            {Object.entries(firmwareInfo)
              .filter(([key]) => !INTERNAL_FIELDS.has(key))
              .map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-theme-text/60 min-w-[120px]">{key}:</span>
                  <span className="text-theme-text">{String(value ?? "—")}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {hardwareSettings.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-accent mb-1">Hardware Devices</h4>
          <div className="space-y-2">
            {hardwareSettings.map((hw, i) => {
              const deviceName = (hw as Record<string, unknown>).device as string | undefined;
              return (
                <div key={i} className="rounded border border-theme-border bg-surface p-3 font-mono text-sm space-y-1">
                  {deviceName && (
                    <div className="text-accent font-semibold mb-1">{String(deviceName)}</div>
                  )}
                  {Object.entries(hw)
                    .filter(([key]) => !INTERNAL_FIELDS.has(key))
                    .map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-theme-text/60 min-w-[120px]">{key}:</span>
                        <span className="text-theme-text">{String(value ?? "—")}</span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
