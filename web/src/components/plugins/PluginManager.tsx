import { PLUGIN_REGISTRY } from "../../plugins/registry";
import { PluginCard } from "./PluginCard";

interface Props {
  sessionId?: string;
}

export function PluginManager({ sessionId }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-theme-text">Plugins</h3>
      {PLUGIN_REGISTRY.map((manifest) => (
        <PluginCard key={manifest.id} manifest={manifest} sessionId={sessionId} />
      ))}
    </div>
  );
}
