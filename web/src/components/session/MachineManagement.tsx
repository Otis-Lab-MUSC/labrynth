import { useState } from "react";
import { Plus, Trash2, RefreshCw, Wifi, Link } from "lucide-react";
import { useMachineStore } from "../../store/useMachineStore";
import { useSessionStore } from "../../store/useSessionStore";
import type { DiscoveredDevice, Machine } from "../../types";

// ---------------------------------------------------------------------------
// Quick pair — enter code only, backend tries all discovered peers
// ---------------------------------------------------------------------------

function QuickPairSection() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showName, setShowName] = useState(false);
  const { pairByCode } = useMachineStore();

  const formatCode = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
  };

  const handlePair = async () => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code shown on the device");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await pairByCode(digits, name.trim() || undefined);
      setCode("");
      setName("");
      setShowName(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Link size={14} className="text-accent/60" />
        <span className="text-sm font-medium text-theme-text">Pair a Device</span>
      </div>
      <p className="text-xs text-theme-text/50">
        Enter the 6-digit code shown on the REACHER device's terminal.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(formatCode(e.target.value)); setError(null); }}
          placeholder="000-000"
          className="input-base flex-1 font-mono text-lg tracking-widest text-center"
          onKeyDown={(e) => { if (e.key === "Enter") handlePair(); }}
        />
        <button
          onClick={handlePair}
          disabled={loading}
          className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50 px-4"
        >
          {loading ? "Pairing…" : "Pair"}
        </button>
      </div>
      {!showName && (
        <button onClick={() => setShowName(true)} className="text-xs text-theme-text/40 hover:text-theme-text/60">
          + Add display name
        </button>
      )}
      {showName && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name (optional)"
          className="input-base w-full text-sm"
        />
      )}
      {error && (
        <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discovered device card (not yet paired)
// ---------------------------------------------------------------------------

function DiscoveredCard({ device, onConnect }: { device: DiscoveredDevice; onConnect: () => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <Wifi size={14} className="shrink-0 text-accent/60" />
        <span className="text-sm text-theme-text truncate">{device.hostname}</span>
        <span className="shrink-0 rounded bg-theme-border/40 px-1.5 py-0.5 text-xs font-mono text-theme-text/50">
          discovered
        </span>
      </div>
      <button
        onClick={onConnect}
        className="shrink-0 btn-sm bg-accent text-accent-contrast hover:bg-accent-hover text-xs"
      >
        Pair
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pairing dialog (for a specific discovered device)
// ---------------------------------------------------------------------------

function PairingDialog({ device, onClose }: { device: DiscoveredDevice; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { pairMachine } = useMachineStore();

  const formatCode = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
  };

  const handlePair = async () => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code shown on the device terminal");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await pairMachine(device.deviceId, digits, name.trim() || undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md space-y-4 shadow-xl">
        <div>
          <h3 className="text-lg font-semibold text-theme-text">Connect to {device.hostname}</h3>
          <p className="mt-1 text-sm text-theme-text/50">{device.url}</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-theme-text/60">Pairing Code</label>
            <input
              value={code}
              onChange={(e) => setCode(formatCode(e.target.value))}
              placeholder="000-000"
              className="input-base w-full font-mono text-lg tracking-widest text-center"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handlePair(); }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-theme-text/60">Display Name <span className="text-theme-text/30">(optional)</span></label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${device.hostname}`}
              className="input-base w-full"
            />
          </div>
        </div>
        {error && (
          <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="btn-sm bg-panel border border-theme-border text-theme-text hover:bg-accent/10">Cancel</button>
          <button onClick={handlePair} disabled={loading} className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50">
            {loading ? "Pairing…" : "Pair"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Machine dialog — URL + pairing code (manual), with API key fallback
// ---------------------------------------------------------------------------

function AddMachineDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("http://");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useApiKey, setUseApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const { pairMachineByUrl, addMachine } = useMachineStore();

  const formatCode = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
  };

  const handleConnect = async () => {
    if (!url.trim() || url.trim() === "http://") {
      setError("Enter the device URL");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (useApiKey) {
        if (!apiKey.trim()) { setError("API key is required"); setLoading(false); return; }
        await addMachine(url.trim(), apiKey.trim(), name.trim() || undefined);
      } else {
        const digits = code.replace(/\D/g, "");
        if (digits.length !== 6) { setError("Enter the 6-digit pairing code"); setLoading(false); return; }
        await pairMachineByUrl(url.trim(), digits, name.trim() || undefined);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md space-y-4 shadow-xl">
        <h3 className="text-lg font-semibold text-theme-text">Add Machine</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-theme-text/60">URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.50:6229" className="input-base w-full font-mono" autoFocus />
          </div>
          {!useApiKey ? (
            <div>
              <label className="mb-1 block text-sm text-theme-text/60">Pairing Code</label>
              <input
                value={code}
                onChange={(e) => setCode(formatCode(e.target.value))}
                placeholder="000-000"
                className="input-base w-full font-mono text-lg tracking-widest text-center"
                onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm text-theme-text/60">API Key</label>
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste API key from device terminal"
                  className="input-base flex-1 font-mono"
                />
                <button type="button" onClick={() => setShowKey((v) => !v)} className="btn-sm bg-panel border border-theme-border text-theme-text/60 hover:text-theme-text">
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-theme-text/60">Display Name <span className="text-theme-text/30">(optional)</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chamber 1" className="input-base w-full" />
          </div>
        </div>
        <button type="button" onClick={() => { setUseApiKey((v) => !v); setError(null); }} className="text-xs text-theme-text/40 hover:text-theme-text/60 underline">
          {useApiKey ? "Use pairing code instead" : "Use API key instead"}
        </button>
        {error && <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="btn-sm bg-panel border border-theme-border text-theme-text hover:bg-accent/10">Cancel</button>
          <button onClick={handleConnect} disabled={loading} className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50">
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MachineManagement — inline device management for the Session page
// ---------------------------------------------------------------------------

export function MachineManagement() {
  const { machines, discoveredDevices, removeMachine, startPolling } = useMachineStore();
  const { sessions } = useSessionStore();
  const [showAdd, setShowAdd] = useState(false);
  const [pairingDevice, setPairingDevice] = useState<DiscoveredDevice | null>(null);

  const hasRemoteMachines = machines.some((m) => !m.isLocal);

  // Count sessions per machine
  const sessionCountMap = new Map<string, number>();
  for (const sess of sessions.values()) {
    if (!sess.draft) {
      sessionCountMap.set(sess.machineId, (sessionCountMap.get(sess.machineId) ?? 0) + 1);
    }
  }

  const handleRemove = (machine: Machine) => {
    if ((sessionCountMap.get(machine.deviceId) ?? 0) > 0) {
      if (!confirm(`"${machine.name}" has active sessions. Removing it will close those sessions. Continue?`)) return;
    }
    removeMachine(machine.deviceId);
  };

  return (
    <div className="space-y-4 pt-3">
      {/* Quick pair */}
      {!hasRemoteMachines && <QuickPairSection />}

      {/* Discovered devices */}
      {discoveredDevices.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-theme-text/50 uppercase tracking-wider">Discovered</h4>
          {discoveredDevices.map((d) => (
            <DiscoveredCard key={d.deviceId} device={d} onConnect={() => setPairingDevice(d)} />
          ))}
        </div>
      )}

      {/* Paired remote machines — compact list with remove buttons */}
      {hasRemoteMachines && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-theme-text/50 uppercase tracking-wider">Paired Devices</h4>
          {machines.filter((m) => !m.isLocal).map((m) => (
            <div key={m.deviceId} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 inline-block h-2 w-2 rounded-full ${m.online ? "bg-green-500" : "bg-red-500/60"}`} />
                <span className="text-sm text-theme-text truncate">{m.name}</span>
                <span className="text-xs text-theme-text/40 font-mono truncate">{m.hostname}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(m); }}
                className="shrink-0 rounded p-1 text-theme-text/30 hover:bg-red-500/20 hover:text-red-400 transition"
                title="Remove machine"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {/* Quick pair (secondary position) */}
          <div className="pt-2">
            <QuickPairSection />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => startPolling()}
          className="btn-sm bg-panel border border-theme-border text-theme-text/60 hover:text-theme-text hover:bg-accent/10"
          title="Refresh status"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="btn-sm bg-panel border border-theme-border text-theme-text/60 hover:text-theme-text hover:bg-accent/10 flex items-center gap-1.5"
        >
          <Plus size={14} />
          Manual
        </button>
      </div>

      {/* Dialogs */}
      {pairingDevice && <PairingDialog device={pairingDevice} onClose={() => setPairingDevice(null)} />}
      {showAdd && <AddMachineDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}
