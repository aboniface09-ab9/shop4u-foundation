import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useThemeStore, THEME_PRESETS, LAYOUT_PRESETS } from "@/store/theme";
import { useProducts } from "@/data/products";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/theme")({
  component: ThemeEditor,
});

function ThemeEditor() {
  const { theme, layout, storeName, logoMark, setTheme, setLayout, setStoreName, setLogoMark } = useThemeStore();
  const { data: products = [] } = useProducts();
  const previewProduct = products[0];

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-semibold">Theme & brand</h1>
        <p className="text-muted text-sm">Changes apply live across the whole storefront and this admin chrome.</p>
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-10">
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
                      active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-muted"
                    }`}
                  >
                    {active && <Check size={14} className="absolute top-2 right-2 text-primary" />}
                    <div className="flex gap-1 mb-3" data-theme={p.id} aria-hidden>
                      <span className="h-8 flex-1 rounded-sm" style={{ background: "var(--bg)", border: "1px solid var(--border)" }} />
                      <span className="h-8 flex-1 rounded-sm" style={{ background: "var(--text)" }} />
                      <span className="h-8 flex-1 rounded-sm" style={{ background: "var(--primary)" }} />
                    </div>
                    <div className="font-heading font-semibold">{p.name}</div>
                    <div className="text-xs text-muted mt-0.5">{p.tagline}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Brand */}
          <section>
            <h2 className="font-heading font-semibold mb-3">Brand</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="store">Store name</Label>
                <Input id="store" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mark">Logo mark</Label>
                <Input id="mark" value={logoMark} onChange={(e) => setLogoMark(e.target.value.slice(0, 6))} />
              </div>
            </div>
          </section>

          {/* Layout presets */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-heading font-semibold">Layout preset</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Drives data-layout (coming soon)</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {LAYOUT_PRESETS.map((l) => {
                const active = layout === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => setLayout(l.id)}
                    className={`text-left rounded-md border p-4 ${
                      active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-muted"
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
            <Button onClick={() => toast.success("Theme saved")}>Save changes</Button>
          </div>
        </div>

        {/* Live preview */}
        <aside className="lg:col-span-1">
          <div className="sticky top-6">
            <h2 className="font-heading font-semibold mb-3">Live preview</h2>
            <div className="rounded-md border border-border overflow-hidden bg-bg">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="font-heading font-bold">{storeName}<span className="text-primary">.</span></span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Bag (0)</span>
              </div>
              <div className="aspect-[4/5]">
                {previewProduct ? (
                  <ProductImage
                    name={previewProduct.name}
                    category={previewProduct.category}
                    color={previewProduct.imageColor}
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
                <Button size="sm" className="w-full mt-3">Add to bag</Button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
