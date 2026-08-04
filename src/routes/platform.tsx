import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ExternalLink, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuthLoading, useAuthStore, useIsAuthenticated, signOut } from "@/store/auth";
import {
  useIsPlatformAdmin,
  usePlatformTenants,
  usePlatformSubscriptionsDue,
  useChargeSubscription,
} from "@/data/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatZAR } from "@/lib/format";
import type { TenantRow } from "@/lib/supabase";

/**
 * /platform — YOUR dashboard as the YouCommerce owner, across every
 * tenant. Deliberately separate from /admin, which is always scoped to
 * one merchant (whoever's signed in). Gated by the platform_admins table
 * (see supabase-platform-admins-migration.sql) — a signed-in merchant
 * admin who isn't in that table sees "Not authorized", not a data leak;
 * the underlying tenants read is public RLS-wise (same as the storefront
 * uses), so the real access boundary is this page/route, not the query.
 */
export const Route = createFileRoute("/platform")({
  component: PlatformDashboard,
});

const BILLING_BADGE: Record<TenantRow["billing_state"], "default" | "secondary" | "destructive" | "outline"> = {
  trialing: "outline",
  active: "default",
  past_due: "destructive",
  soft_suspended: "destructive",
  hard_suspended: "destructive",
  churned: "secondary",
  cancelled: "secondary",
};

function PlatformDashboard() {
  const isAuthed = useIsAuthenticated();
  const authLoading = useAuthLoading();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthed) {
      navigate({ to: "/login", search: { redirect: "/platform" }, replace: true });
    }
  }, [authLoading, isAuthed, navigate]);

  const { data: isPlatformAdmin, isLoading: checkingAdmin } = useIsPlatformAdmin();
  const { data: tenants = [], isLoading: loadingTenants } = usePlatformTenants();

  if (authLoading || !isAuthed || checkingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
        Checking access…
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-heading text-xl font-semibold">Not authorized</h1>
          <p className="mt-2 text-sm text-muted">
            This account ({user?.email}) isn&apos;t on the platform admin list.
          </p>
          <Link to="/admin" className="mt-6 inline-block text-sm underline">
            Back to your store admin
          </Link>
        </div>
      </div>
    );
  }

  const counts = tenants.reduce<Record<string, number>>((acc, t) => {
    acc[t.billing_state] = (acc[t.billing_state] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-bg p-6 md:p-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-1">
            <img src="/logo-mark.png" alt="" className="h-4 w-4 rounded-sm" />
            YouCommerce · Platform
          </p>
          <h1 className="font-heading text-3xl font-semibold">Merchants</h1>
          <p className="text-muted text-sm mt-1">
            {tenants.length} tenant{tenants.length === 1 ? "" : "s"} total
            {Object.entries(counts).map(([state, n]) => ` · ${n} ${state}`).join("")}
          </p>
        </div>
        <button
          onClick={() => signOut().then(() => navigate({ to: "/login" }))}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text"
        >
          <LogOut size={12} /> Sign out
        </button>
      </header>

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Billing state</TableHead>
              <TableHead>Trial ends</TableHead>
              <TableHead>PayFast</TableHead>
              <TableHead>Signed up</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingTenants && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted text-sm py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loadingTenants && tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted text-sm py-8">
                  No tenants yet.
                </TableCell>
              </TableRow>
            )}
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  {t.store_name ?? t.name}
                  <div className="font-mono text-[10px] text-muted">{t.slug}</div>
                </TableCell>
                <TableCell className="capitalize">{t.plan}</TableCell>
                <TableCell>
                  <Badge variant={BILLING_BADGE[t.billing_state]} className="capitalize">
                    {t.billing_state.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  {t.payfast_enabled ? (
                    <Badge variant="default">On</Badge>
                  ) : (
                    <Badge variant="secondary">Off</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {new Date(t.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <a
                    href={`https://${t.slug}.youcommerce.co.za`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                  >
                    Visit <ExternalLink size={11} />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted mt-4 mb-10">
        This lists every tenant row (no filtering by whether they've formally signed off as
        commercially live) — cross-check against your own notes for who's actually a paying
        customer versus a pilot still in setup.
      </p>

      <BillingRunSection />
    </div>
  );
}

/**
 * Manual billing run — tokenization means nothing charges itself, so this
 * is the actual "click to charge each merchant" screen scoped out in
 * payfast-subscription-billing-brief.md. NOT tested end-to-end yet
 * (blocked on Adam's own PayFast account existing) — the charge button
 * will error clearly if PLATFORM_PAYFAST_* Worker secrets aren't set.
 */
function BillingRunSection() {
  const { data: subscriptions = [], isLoading } = usePlatformSubscriptionsDue();
  const charge = useChargeSubscription();

  const today = new Date().toISOString().slice(0, 10);
  const due = subscriptions.filter((s) => s.nextChargeDate <= today);
  const upcoming = subscriptions.filter((s) => s.nextChargeDate > today);

  const handleCharge = (id: string, label: string) => {
    charge.mutate(id, {
      onSuccess: () => toast.success(`Charged ${label}`),
      onError: (err) => toast.error(`Charge failed for ${label}`, { description: err.message }),
    });
  };

  return (
    <section>
      <header className="mb-4">
        <h2 className="font-heading text-2xl font-semibold">Billing run</h2>
        <p className="text-muted text-sm mt-1">
          Merchants paying <em>you</em> their YouCommerce subscription — tokenization means you
          trigger every charge yourself, nothing bills automatically.{" "}
          {due.length > 0 && <span className="text-text font-medium">{due.length} due today.</span>}
        </p>
      </header>

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Next charge</TableHead>
              <TableHead>Card on file</TableHead>
              <TableHead>Last charge</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted text-sm py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && subscriptions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted text-sm py-8">
                  No merchants have signed up for billing yet.
                </TableCell>
              </TableRow>
            )}
            {[...due, ...upcoming].map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  {s.tenant?.store_name ?? s.tenant?.name ?? "—"}
                  <div className="font-mono text-[10px] text-muted">{s.tenant?.slug}</div>
                </TableCell>
                <TableCell className="capitalize">{s.plan}</TableCell>
                <TableCell className="font-mono">{formatZAR(s.monthlyAmountCents / 100)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {new Date(s.nextChargeDate).toLocaleDateString()}
                  {s.nextChargeDate <= today && (
                    <Badge variant="destructive" className="ml-2">
                      Due
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {s.hasCardToken ? (
                    <Badge variant="default">Yes</Badge>
                  ) : (
                    <Badge variant="secondary">No card</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs capitalize">{s.lastChargeStatus ?? "—"}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!s.hasCardToken || charge.isPending}
                    onClick={() => handleCharge(s.id, s.tenant?.store_name ?? s.tenant?.slug ?? s.id)}
                  >
                    {charge.isPending ? <Loader2 size={13} className="animate-spin" /> : "Charge"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
