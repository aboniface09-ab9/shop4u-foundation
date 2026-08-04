import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/data/categories";
import { useProducts } from "@/data/products";
import { supabase } from "@/lib/supabase";
import { useTenant, useTenantId } from "@/store/tenant";
import { useAuthStore } from "@/store/auth";
import { startSubscriptionSignup } from "@/lib/billing";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/admin/settings")({
  component: Settings,
});

function Settings() {
  const tenant = useTenant();
  const tenantId = useTenantId();
  const qc = useQueryClient();
  // Local toggle state mirrors the tenant row; defaults to true (VAT-
  // registered) until the tenant loads, then syncs to the real value.
  const [vat, setVat] = useState(true);
  useEffect(() => {
    if (tenant) setVat(tenant.vat_registered);
  }, [tenant]);

  const saveVat = useMutation({
    mutationFn: async (vatRegistered: boolean) => {
      if (!tenantId) throw new Error("No tenant resolved");
      const { error } = await supabase
        .from("tenants")
        .update({ vat_registered: vatRegistered })
        .eq("id", tenantId);
      if (error) throw error;
    },
    onSuccess: (_data, vatRegistered) => {
      qc.invalidateQueries({ queryKey: ["tenant"] });
      toast.success(vatRegistered ? "VAT enabled" : "VAT disabled");
    },
    onError: (err) => {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-10">
      <header>
        <h1 className="font-heading text-3xl font-semibold">Settings</h1>
        <p className="text-muted text-sm">Storefront, payments, tax, shipping, team.</p>
      </header>

      <BillingCard />

      <Card title="Custom domain">
        <div className="space-y-2">
          <Label htmlFor="domain">Domain</Label>
          <Input id="domain" placeholder="yourstore.co.za" />
          <p className="text-xs text-muted">Point a CNAME at shops.youcommerce.co.za to activate.</p>
        </div>
      </Card>

      <Card title="Payments">
        <div className="space-y-3">
          {[
            { name: "PayFast", note: "Cards + Instant EFT + more", selected: tenant?.payfast_enabled ?? false },
            { name: "Transaction Junction", note: "Card payments" },
            { name: "Yoco", note: "Recommended for ZA card payments" },
            { name: "Peach Payments", note: "Cards + Instant EFT" },
            { name: "Paystack", note: "Cards, EFT, mobile money" },
          ].map((p) => (
            <div key={p.name} className="flex items-center justify-between border border-border rounded-sm p-3">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted">{p.note}</div>
              </div>
              <Badge
                variant={p.selected ? "default" : "outline"}
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
              >
                {p.selected ? "Selected" : "Coming soon"}
              </Badge>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-3">
          We're currently integrated with PayFast only — the other providers above are on the way.
        </p>
      </Card>

      <Card title="Tax">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">VAT registered</div>
            <p className="text-xs text-muted">
              On: your listed prices already include 15% VAT (shown as a
              breakdown at checkout, never added on top). Off: turn this
              off if you're not VAT registered — you can't legally charge
              VAT, so prices are just the price, no VAT line shown anywhere.
            </p>
          </div>
          <Switch
            checked={vat}
            onCheckedChange={(checked) => {
              setVat(checked);
              saveVat.mutate(checked);
            }}
            disabled={saveVat.isPending}
          />
        </div>
      </Card>

      <Card title="Shipping zones">
        <p className="text-sm text-muted">
          Shipping zone management isn't set up yet — this is a placeholder
          for a future release. If you need delivery zones and pricing
          configured now, email hello@youcommerce.co.za.
        </p>
      </Card>

      <Card title="Team">
        <p className="text-sm text-muted">
          You're the only person on this account right now. Team invites
          aren't wired up yet — email hello@youcommerce.co.za to add someone.
        </p>
      </Card>

      <HeroProductsCard />

      <CategoriesCard />

      <Button onClick={() => toast.success("Settings saved")}>Save settings</Button>
    </div>
  );
}

function HeroProductsCard() {
  const tenant = useTenant();
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();

  const saved = tenant?.content?.hero_product_slugs ?? [];
  const [selected, setSelected] = useState<string[]>(saved);

  // Re-sync local selection if the saved value changes underneath us
  // (e.g. tenant record reloads after a save elsewhere).
  useEffect(() => {
    setSelected(tenant?.content?.hero_product_slugs ?? []);
  }, [tenant?.content?.hero_product_slugs]);

  const save = useMutation({
    mutationFn: async (slugs: string[]) => {
      if (!tenantId) throw new Error("No tenant resolved");
      const { error } = await supabase
        .from("tenants")
        .update({ content: { ...(tenant?.content ?? {}), hero_product_slugs: slugs } })
        .eq("id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant"] });
      toast.success("Homepage hero updated");
    },
    onError: (err) => {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  const toggle = (slug: string) => {
    setSelected((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const dirty = JSON.stringify(selected) !== JSON.stringify(saved);

  return (
    <Card title="Homepage hero">
      <p className="text-xs text-muted mb-4">
        Pick which products rotate through the big image on your homepage.
        Leave nothing selected to just show your first product, like before.
        They cycle in the order you check them below.
      </p>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted mb-3">
          <Loader2 size={13} className="animate-spin" /> Loading products…
        </div>
      )}
      <ul className="divide-y divide-border max-h-72 overflow-y-auto mb-4">
        {products.map((p) => {
          const checked = selected.includes(p.id);
          const order = checked ? selected.indexOf(p.id) + 1 : null;
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <input
                type="checkbox"
                id={`hero-${p.id}`}
                checked={checked}
                onChange={() => toggle(p.id)}
                className="size-4 accent-primary"
              />
              <label htmlFor={`hero-${p.id}`} className="flex-1 text-sm cursor-pointer">
                {p.name}
              </label>
              {order && (
                <span className="font-mono text-[10px] text-muted border border-border rounded-sm px-1.5 py-0.5">
                  {order}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {products.length === 0 && !isLoading && (
        <p className="text-sm text-muted mb-4">Add some products first, then come back here.</p>
      )}
      <Button
        type="button"
        onClick={() => save.mutate(selected)}
        disabled={!dirty || save.isPending}
      >
        {save.isPending ? <Loader2 size={14} className="animate-spin" /> : "Save hero selection"}
      </Button>
    </Card>
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

// Plan pricing shown here for display only — matches
// PLAN_MONTHLY_CENTS in src/server/payfast/handlers.ts, which is the
// actual source of truth used when a subscription row is created.
// Duplicated intentionally rather than fetched, since this never needs
// to change without a code deploy anyway.
const PLAN_PRICE_CENTS: Record<string, number> = { starter: 24900, growth: 59900, pro: 129900 };

/**
 * "Set up billing" — a merchant paying THEIR YouCommerce subscription fee
 * to Adam. Separate concern from the "Payments" card above (which is
 * about their own customers' checkout options).
 *
 * Two different things happen behind the same PayFast hosted-page flow,
 * distinguished by amountCents:
 *   - First-time signup (not yet active/past_due): charges the real plan
 *     price immediately AND tokenizes the card in the same step. Paying
 *     whenever they click this always buys a fresh month starting today —
 *     no proration, no "unfair mid-month" issue, regardless of where in
 *     the trial (or after suspension) they do it.
 *   - Already active/past_due, just refreshing their card on file
 *     (expired card, etc.): amountCents 0 — a real re-charge here would
 *     double-bill them for a month they're already paying for via the
 *     normal monthly billing run.
 */
function BillingCard() {
  const tenant = useTenant();
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);

  const plan = tenant?.plan ?? "starter";
  const priceCents = PLAN_PRICE_CENTS[plan] ?? PLAN_PRICE_CENTS.starter;
  const billingState = tenant?.billing_state ?? "trialing";
  const hasBillingSetUp = billingState === "active" || billingState === "past_due";

  const setUpBilling = async () => {
    setBusy(true);
    try {
      await startSubscriptionSignup({
        amountCents: hasBillingSetUp ? 0 : priceCents,
        itemName: `YouCommerce — ${plan} plan`,
        customerEmail: user?.email,
      });
      // startSubscriptionSignup redirects the browser away — nothing
      // after this line runs on success.
    } catch (err) {
      setBusy(false);
      toast.error("Couldn't start billing setup", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <Card title="Billing — your YouCommerce subscription">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm">
            <span className="font-medium capitalize">{plan}</span> plan ·{" "}
            <span className="font-mono">{formatZAR(priceCents / 100)}/mo</span>
          </div>
          <div className="mt-1">
            <Badge
              variant={billingState === "active" ? "default" : billingState === "past_due" ? "destructive" : "outline"}
              className="capitalize"
            >
              {billingState.replace("_", " ")}
            </Badge>
          </div>
        </div>
        <Button onClick={setUpBilling} disabled={busy} variant={hasBillingSetUp ? "outline" : "default"}>
          {busy
            ? "Redirecting…"
            : hasBillingSetUp
              ? "Update card"
              : `Pay ${formatZAR(priceCents / 100)} & set up billing`}
        </Button>
      </div>
      <p className="text-xs text-muted mt-3">
        You'll be redirected to PayFast to securely enter your card details — YouCommerce never
        sees or stores your card number.{" "}
        {hasBillingSetUp
          ? "Updating your card doesn't charge you again — your normal monthly billing continues as usual."
          : `By continuing, you'll be charged ${formatZAR(priceCents / 100)} now for your first month, and you're
             agreeing to be billed ${formatZAR(priceCents / 100)}/month for your ${plan} plan going forward until
             you cancel.`}
      </p>
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
