import { useNavigate, useLocation } from "@tanstack/react-router";
import { Palette, Eye, Store } from "lucide-react";
import { useThemeStore, THEME_PRESETS } from "@/store/theme";

/**
 * DevPanel — floating Customer/Merchant view + theme switcher.
 * Gated by import.meta.env.DEV so it never ships in production.
 */
export function DevPanel() {
  if (!import.meta.env.DEV) return null;
  const { theme, setTheme, view, setView } = useThemeStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const flipView = () => {
    const next = view === "customer" ? "merchant" : "customer";
    setView(next);
    if (next === "merchant" && !pathname.startsWith("/admin")) navigate({ to: "/admin" });
    if (next === "customer" && pathname.startsWith("/admin")) navigate({ to: "/" });
  };

  return (
    <div className="fixed right-4 top-20 z-50 w-64 rounded-md border border-border bg-surface shadow-md p-3 font-body text-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-2">
        Dev panel
      </p>

      <button
        onClick={flipView}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-sm border border-border hover:bg-bg mb-3"
      >
        {view === "customer" ? <Store size={14} /> : <Eye size={14} />}
        <span>Switch to {view === "customer" ? "Merchant" : "Customer"} view</span>
      </button>

      <div className="flex items-center gap-1 text-muted mb-2">
        <Palette size={12} />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Theme</span>
      </div>
      <div className="grid gap-1">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setTheme(p.id)}
            className={`px-3 py-2 text-left rounded-sm border text-xs ${
              theme === p.id
                ? "border-primary bg-bg"
                : "border-border hover:border-muted"
            }`}
          >
            <div className="font-semibold">{p.name}</div>
            <div className="text-muted text-[10px]">{p.tagline}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
