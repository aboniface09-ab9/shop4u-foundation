import { createFileRoute } from "@tanstack/react-router";
import { Check, Upload, X, Loader2, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useThemeStore, THEME_PRESETS, LAYOUT_PRESETS } from "@/store/theme";
import { useProducts } from "@/data/products";
import { useTenant, useTenantId } from "@/store/tenant";
import { supabase, type ThemeColorKey, type ThemeColors } from "@/lib/supabase";
import { uploadTenantLogo, deleteTenantLogo } from "@/lib/storage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/theme")({
  component: ThemeEditor,
});

// Custom color overrides are a mid-tier+ perk — starter tenants see an
// upsell card instead of the picker.
const CUSTOM_COLORS_PLANS: string[] = ["growth", "pro"];

function ThemeEditor() {
  const {
    theme,
    layout,
    storeName,
    logoMark,
    logoUrl,
    colors,
    setTheme,
    setLayout,
    setStoreName,
    setLogoMark,
    setLogoUrl,
    setColor,
  } = useThemeStore();
  const { data: products = [] } = useProducts();
  const previewProduct = products[0];
  const tenant = useTenant();
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const canCustomizeColors = !!tenant?.plan && CUSTOM_COLORS_PLANS.includes(tenant.plan);
  // True once any color override actually diverges from the preset default
  // below — the active preset card should then read "Custom" rather than
  // a plain checkmark, since the merchant is no longer looking at the
  // untouched preset (see the note on the preset grid below).
  const hasCustomColors = canCustomizeColors && Object.values(colors).some(Boolean);

  // Preset buttons apply a live local preview immediately (via setTheme),
  // but that's only ever in this browser's memory + localStorage. The
  // tenant's real theme.preset in Supabase — which every fresh page load
  // (storefront included) re-reads and re-applies — doesn't change until
  // this mutation runs. That mismatch was the "reverts to volt on the
  // storefront" bug: the DB value was never actually updated by "Save".
  const saveTheme = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant resolved");
      const { error } = await supabase
        .from("tenants")
        .update({
          // Merge into the existing theme jsonb rather than clobber it —
          // fonts/radius already stored there stay intact. Custom colors
          // only get persisted for tenants whose plan actually unlocks
          // the feature (the picker UI is hidden below starter anyway,
          // so `colors` here is whatever was already there for them).
          theme: {
            ...(tenant?.theme ?? {}),
            preset: theme,
            ...(canCustomizeColors ? { colors } : {}),
          },
          store_name: storeName,
          logo_mark: logoMark,
          logo_url: logoUrl,
        })
        .eq("id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant"] });
      toast.success("Theme saved — now live on the storefront too");
    },
    onError: (err) => {
      toast.error("Failed to save theme", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-semibold">Theme & brand</h1>
        <p className="text-muted text-sm">
          Preview instantly here, then hit Save to make it live on your storefront too.
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-10">
          {/* Logo — first thing merchants set up when they land here */}
          <section>
            <h2 className="font-heading font-semibold mb-3">Logo</h2>
            <LogoUpload
              tenantId={tenantId}
              logoUrl={logoUrl}
              onUpload={setLogoUrl}
              onRemove={() => setLogoUrl(null)}
            />
            <p className="text-xs text-muted mt-2">
              Shown in your storefront header and here in the admin sidebar. PNG or SVG with a
              transparent background works best.
            </p>
          </section>

          {/* Presets */}
          <section>
            <h2 className="font-heading font-semibold mb-3">Theme preset</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {THEME_PRESETS.map((p) => {
                const active = theme === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setTheme(p.id)}
                    className={`relative text-left rounded-md border p-4 transition-colors ${
                      active
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-muted"
                    }`}
                  >
                    {active &&
                      (hasCustomColors ? (
                        <span className="absolute top-2 right-2 font-mono text-[9px] uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm">
                          Custom
                        </span>
                      ) : (
                        <Check size={14} className="absolute top-2 right-2 text-primary" />
                      ))}
                    <div className="flex gap-1 mb-3" data-theme={p.id} aria-hidden>
                      <span
                        className="h-8 flex-1 rounded-sm"
                        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                      />
                      <span
                        className="h-8 flex-1 rounded-sm"
                        style={{ background: "var(--text)" }}
                      />
                      <span
                        className="h-8 flex-1 rounded-sm"
                        style={{ background: "var(--primary)" }}
                      />
                    </div>
                    <div className="font-heading font-semibold">{p.name}</div>
                    <div className="text-xs text-muted mt-0.5">{p.tagline}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Custom colors — mid-tier+ (Growth/Pro) perk */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-heading font-semibold">Custom colors</h2>
              {!canCustomizeColors && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                  Growth & Pro plans
                </span>
              )}
            </div>
            {canCustomizeColors ? (
              <>
                <p className="text-xs text-muted mb-4">
                  Override the preset above with your own brand colors. Anything you leave blank
                  keeps the preset's default.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <ColorField
                    label="Primary (buttons, links)"
                    cssVar="--primary"
                    theme={theme}
                    value={colors.primary}
                    onChange={(v) => setColor("primary", v)}
                  />
                  <ColorField
                    label="Accent"
                    cssVar="--accent"
                    theme={theme}
                    value={colors.accent}
                    onChange={(v) => setColor("accent", v)}
                  />
                  <ColorField
                    label="Background"
                    cssVar="--bg"
                    theme={theme}
                    value={colors.bg}
                    onChange={(v) => setColor("bg", v)}
                  />
                  <ColorField
                    label="Surface (cards, panels)"
                    cssVar="--surface"
                    theme={theme}
                    value={colors.surface}
                    onChange={(v) => setColor("surface", v)}
                  />
                </div>
                {Object.values(colors).some(Boolean) && (
                  <button
                    type="button"
                    onClick={() =>
                      (["primary", "accent", "bg", "surface"] as ThemeColorKey[]).forEach((k) =>
                        setColor(k, ""),
                      )
                    }
                    className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text"
                  >
                    Reset to preset defaults
                  </button>
                )}
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 flex items-start gap-3 text-sm text-muted">
                <Lock size={16} className="shrink-0 mt-0.5" />
                <p>
                  Custom brand colors (beyond the 3 built-in presets) are available on the Growth
                  and Pro plans. Email hello@youcommerce.co.za to upgrade.
                </p>
              </div>
            )}
          </section>

          {/* Brand */}
          <section>
            <h2 className="font-heading font-semibold mb-3">Brand</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="store">Store name</Label>
                <Input
                  id="store"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mark">Logo mark (fallback text)</Label>
                <Input
                  id="mark"
                  value={logoMark}
                  onChange={(e) => setLogoMark(e.target.value.slice(0, 6))}
                />
                <p className="text-xs text-muted">
                  Used wherever your logo image doesn't fit, and until you upload one above.
                </p>
              </div>
            </div>
          </section>

          {/* Layout presets */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-heading font-semibold">Layout preset</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                Drives data-layout (coming soon)
              </span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {LAYOUT_PRESETS.map((l) => {
                const active = layout === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => setLayout(l.id)}
                    className={`text-left rounded-md border p-4 ${
                      active
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-muted"
                    }`}
                  >
                    <div className="font-heading font-semibold">{l.name}</div>
                    <div className="text-xs text-muted mt-0.5">{l.tagline}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <div>
            <Button onClick={() => saveTheme.mutate()} disabled={saveTheme.isPending}>
              {saveTheme.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <aside className="lg:col-span-1">
          <div className="sticky top-6">
            <h2 className="font-heading font-semibold mb-3">Live preview</h2>
            <div className="rounded-md border border-border overflow-hidden bg-bg">
              <div className="p-3 border-b border-border flex items-center justify-between">
                {logoUrl ? (
                  <img src={logoUrl} alt={storeName} className="h-6 max-w-[120px] object-contain" />
                ) : (
                  <span className="font-heading font-bold">
                    {storeName}
                    <span className="text-primary">.</span>
                  </span>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                  Bag (0)
                </span>
              </div>
              <div className="aspect-[4/5]">
                {previewProduct ? (
                  <ProductImage
                    name={previewProduct.name}
                    category={previewProduct.category}
                    color={previewProduct.imageColor}
                    imageUrl={previewProduct.imageUrl}
                    size="md"
                  />
                ) : (
                  <div className="h-full w-full bg-surface" />
                )}
              </div>
              <div className="p-3">
                <div className="flex justify-between">
                  <span className="font-heading font-semibold">
                    {previewProduct?.name ?? "Loading…"}
                  </span>
                  <span className="font-mono text-sm">
                    {previewProduct ? `R${previewProduct.price.toLocaleString("en-ZA")}` : ""}
                  </span>
                </div>
                <Button size="sm" className="w-full mt-3">
                  Add to bag
                </Button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Logo upload — separate from ImageUpload (which is product-specific and
 * keys off a product slug). One file per tenant at a fixed path, so no
 * slug is needed here.
 */
function LogoUpload({
  tenantId,
  logoUrl,
  onUpload,
  onRemove,
}: {
  tenantId: string | null;
  logoUrl: string | null;
  onUpload: (url: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setError(null);
    if (!tenantId) {
      setError("No tenant resolved yet — try again in a moment.");
      return;
    }
    const accepted = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    if (!accepted.includes(file.type)) {
      setError("Please upload a JPEG, PNG, WebP, or SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadTenantLogo(file, tenantId);
      onUpload(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (logoUrl) await deleteTenantLogo(logoUrl).catch(() => {});
    onRemove();
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          e.target.value = "";
        }}
      />

      {logoUrl ? (
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-md border border-border bg-surface flex items-center justify-center overflow-hidden shrink-0">
            <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : "Replace"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={remove} disabled={uploading}>
              <X size={13} className="mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-3 rounded-md border-2 border-dashed border-border hover:border-primary/40 px-4 py-4 text-muted hover:text-text transition-colors"
        >
          {uploading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Upload size={20} className="opacity-50" />
          )}
          <span className="text-sm">
            <span className="font-medium">Upload your logo</span>
            <span className="block text-xs opacity-70">JPEG, PNG, WebP, or SVG · max 2 MB</span>
          </span>
        </button>
      )}

      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}

/**
 * A single custom-color override field: a native color swatch + hex text
 * input, kept in sync. Defaults to whatever the active preset currently
 * resolves `cssVar` to (read via getComputedStyle) so the picker starts
 * from a sensible, on-brand color rather than black.
 */
function ColorField({
  label,
  cssVar,
  theme,
  value,
  onChange,
}: {
  label: string;
  cssVar: string;
  theme: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  const [presetDefault, setPresetDefault] = useState("#000000");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const computed = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (computed) setPresetDefault(computed);
  }, [cssVar, theme]);

  const current = value || presetDefault;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : presetDefault}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded border border-border cursor-pointer bg-transparent p-0.5 shrink-0"
          aria-label={label}
        />
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder={presetDefault}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}
