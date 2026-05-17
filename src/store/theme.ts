import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreset = "heritage" | "onyx" | "volt";
export type LayoutPreset = "boutique" | "catalogue" | "specialist";
export type ViewMode = "customer" | "merchant";

export const THEME_PRESETS: { id: ThemePreset; name: string; tagline: string }[] = [
  { id: "heritage", name: "Heritage", tagline: "Warm neutral · editorial" },
  { id: "onyx", name: "Onyx", tagline: "Dark mono · premium" },
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
  view: ViewMode;
  setTheme: (t: ThemePreset) => void;
  setLayout: (l: LayoutPreset) => void;
  setStoreName: (s: string) => void;
  setLogoMark: (s: string) => void;
  setView: (v: ViewMode) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "heritage",
      layout: "boutique",
      storeName: "Foundry",
      logoMark: "FND",
      view: "customer",
      setTheme: (theme) => set({ theme }),
      setLayout: (layout) => set({ layout }),
      setStoreName: (storeName) => set({ storeName }),
      setLogoMark: (logoMark) => set({ logoMark }),
      setView: (view) => set({ view }),
    }),
    { name: "shop4u-theme" },
  ),
);

/**
 * Applies the active theme to <html> by toggling data-theme + data-layout.
 * Call this once at app boot and on every change.
 */
export const applyTheme = (theme: ThemePreset, layout: LayoutPreset) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  // data-layout will later drive layout-preset CSS / component switching.
  document.documentElement.dataset.layout = layout;
};
