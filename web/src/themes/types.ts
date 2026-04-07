export interface ColorPalette {
  surface: string;
  panel: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentHover: string;
  accentContrast: string;
  border: string;
  input: string;
  textDim?: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  colors: { light: ColorPalette; dark: ColorPalette };
  font: "mono" | "sans" | "cyberpunk";
  radius: { sm: string; md: string; lg: string };
  glass: { enabled: boolean; opacity: number; blur: string };
  branding: {
    type: "terminal" | "clean";
    text: string;
    showCursor: boolean;
    icon: "neural" | "bolt" | "ember" | "reacher" | null;
  };
  sidebar: { activeStyle: "filled" | "left-accent"; itemPrefix: string };
  background: "neural" | "ct-scan" | "storm-synapse" | "ember-circuit" | "neon-grid" | "cyberpunk-grid" | null;
}
