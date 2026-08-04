import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeColors } from "@/lib/supabase";

export type ThemePreset = "heritage" | "onyx" | "volt";
export type LayoutPreset = "boutique" | "catalogue" | "specialist";
export type ViewMode = "customer" | "merchant";

// CSS custom property each color key overrides — see styles.css presets.
const COLOR_VAR_MAP: Record<keyof ThemeColors, string> = {
  bg: "--bg",
  surface: "--surface",
  text: "--text",
  muted: "--muted",
  border: "--border",
  primary: "--primary",
  onPrimary: "--on-primary",
  accent: "--accent",
};

export const THEME_PRESETS: { id: ThemePreset; name: string; tagline: string }[] = [
  { id: "heritage", name: "Heritage", tagline: "Warm neutral · editorial" },
  { id: "onyx", name: "Onyx", tagline: "Quiet dark luxury · boutique at night" },
  { id: "volt", name: "Volt", tagline: "Acid yellow · drop energy" },
];

export const LAYOUT_PRESETS: { id: LayoutPreset; name: string; tagline: string }[] = [
  { id: "boutique", name: "Boutique", tagline: "Editorial, image-led" },
  { id: "catalogue", name: "Catalogue", tagline: "Dense grid, fast browse" },
  { id: "specialist", name: "Specialist", tagline: "Hero one product at a time" },
];

type ThemeState = {
  theme: ThemePreset;
  layout: LayoutPreset;
  storeName: string;
  logoMark: string; // a short wordmark used in placeholders
  logoUrl: string | null; // uploaded logo image, takes priority over logoMark
  colors: ThemeColors; // per-tenant custom color overrides (mid-tier+ feature)
  view: ViewMode;
  setTheme: (t: ThemePreset) => void;
  setLayout: (l: LayoutPreset) => void;
  setStoreName: (s: string) => void;
  setLogoMark: (s: string) => void;
  setLogoUrl: (s: string | null) => void;
  setColors: (c: ThemeColors) => void;
  setColor: (k: keyof ThemeColors, v: string) => void;
  setView: (v: ViewMode) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "heritage",
      layout: "boutique",
      storeName: "Foundry",
      logoMark: "FND",
      logoUrl: null,
      colors: {},
      view: "customer",
      setTheme: (theme) => set({ theme }),
      setLayout: (layout) => set({ layout }),
      setStoreName: (storeName) => set({ storeName }),
      setLogoMark: (logoMark) => set({ logoMark }),
      setLogoUrl: (logoUrl) => set({ logoUrl }),
      setColors: (colors) => set({ colors }),
      setColor: (k, v) => set({ colors: { ...get().colors, [k]: v } }),
      setView: (view) => set({ view }),
    }),
    { name: "youcommerce-theme" },
  ),
);

/**
 * Applies the active theme to <html> by toggling data-theme + data-layout,
 * then layers any per-tenant custom color overrides on top as inline CSS
 * custom properties (these win over whatever the preset defines).
 *
 * Previously-applied overrides are cleared first so switching tenants,
 * presets, or clearing a color back to "unset" doesn't leave stale colors
 * behind on the <html> element.
 *
 * Call this once at app boot and on every change.
 */
export const applyTheme = (theme: ThemePreset, layout: LayoutPreset, colors?: ThemeColors) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  // data-layout will later drive layout-preset CSS / component switching.
  root.dataset.layout = layout;

  for (const cssVar of Object.values(COLOR_VAR_MAP)) {
    root.style.removeProperty(cssVar);
  }
  if (colors) {
    for (const [key, value] of Object.entries(colors) as [
      keyof ThemeColors,
      string | undefined,
    ][]) {
      if (value) root.style.setProperty(COLOR_VAR_MAP[key], value);
    }
  }
};
