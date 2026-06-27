import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/data/categories";

export const Route = createFileRoute("/admin/settings")({
  component: Settings,
});

function Settings() {
  const [vat, setVat] = useState(true);

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-10">
      <header>
        <h1 className="font-heading text-3xl font-semibold">Settings</h1>
        <p className="text-muted text-sm">Storefront, payments, tax, shipping, team.</p>
      </header>

      <Card title="Custom domain">
        <div className="space-y-2">
          <Label htmlFor="domain">Domain</Label>
          <Input id="domain" placeholder="shop.foundry.co.za" />
          <p className="text-xs text-muted">Point a CNAME at shops.shop4u.app to activate.</p>
        </div>
      </Card>

      <Card title="Payments">
        <div className="space-y-3">
          {[
            { name: "Yoco", note: "Recommended for ZA card payments" },
            { name: "Peach Payments", note: "Cards + Instant EFT" },
            { name: "Paystack", note: "Cards, EFT, mobile money" },
          ].map((p) => (
            <div key={p.name} className="flex items-center justify-between border border-border rounded-sm p-3">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted">{p.note}</div>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.18em]">Connect</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Tax">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Charge VAT (15%)</div>
            <p className="text-xs text-muted">Required if your turnover exceeds R1m / year.</p>
          </div>
          <Switch checked={vat} onCheckedChange={setVat} />
        </div>
      </Card>

      <Card title="Shipping zones">
        <ul className="divide-y divide-border">
          {[
            { name: "Cape Town metro", price: "R75", days: "1–2 days" },
            { name: "Rest of South Africa", price: "R120", days: "2–5 days" },
            { name: "International", price: "On request", days: "—" },
          ].map((z) => (
            <li key={z.name} className="flex justify-between py-3 text-sm">
              <span>{z.name}</span>
              <span className="font-mono text-muted">{z.price} · {z.days}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Team">
        <ul className="space-y-2">
          {[
            { name: "Naledi Khumalo", role: "Owner" },
            { name: "Tom Williams", role: "Fulfilment" },
          ].map((m) => (
            <li key={m.name} className="flex justify-between border border-border rounded-sm p-3">
              <span>{m.name}</span>
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted">{m.role}</span>
            </li>
          ))}
        </ul>
      </Card>

      <CategoriesCard />

      <Button onClick={() => toast.success("Settings saved")}>Save settings</Button>
    </div>
  );
}

function CategoriesCard() {
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const [newName, setNewName] = useState("");

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createCategory.mutateAsync(name);
      setNewName("");
    } catch (err) {
      toast.error("Failed to add category", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <Card title="Product categories">
      <div className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        )}
        <ul className="divide-y divide-border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{c.name}</span>
              <button
                type="button"
                onClick={() => deleteCategory.mutate(c.id)}
                disabled={deleteCategory.isPending}
                className="p-1 rounded text-muted hover:text-danger transition-colors disabled:opacity-40"
                aria-label={`Remove ${c.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
          <Button
            type="button"
            variant="outline"
            onClick={add}
            disabled={createCategory.isPending || !newName.trim()}
          >
            {createCategory.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </Button>
        </div>
        <p className="text-xs text-muted">Categories are shared across all your products.</p>
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-5">
      <h2 className="font-heading font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}
