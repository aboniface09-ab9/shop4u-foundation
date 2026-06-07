import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

/**
 * /mock-gateway/:ref — fake hosted payment page for local dev.
 *
 * Stands in for a real gateway (TJ / Yoco / Peach / Paystack). Lets the
 * customer click Pay or Cancel. On Pay we update the order's status to
 * 'paid' directly in Supabase and redirect to the return URL. On Cancel
 * we just redirect to the cancel URL.
 *
 * ⚠️ This route should be removed before any production deploy, or
 * gated behind import.meta.env.DEV at minimum. There's a big warning
 * banner so it's obvious this is a fake.
 */

const searchSchema = z.object({
  // TanStack Router parses numeric-looking search params as numbers,
  // so we coerce both to be safe.
  amount: z.coerce.number().optional(),
  currency: z.string().optional(),
  email: z.string().optional(),
  return: z.string().optional(),
  cancel: z.string().optional(),
});

export const Route = createFileRoute("/mock-gateway/$ref")({
  validateSearch: searchSchema,
  component: MockGateway,
});

function MockGateway() {
  const { ref } = Route.useParams();
  const search = useSearch({ from: "/mock-gateway/$ref" });
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "processing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const amountRand =
    search.amount !== undefined
      ? (search.amount / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
      : "—";

  const handlePay = async () => {
    setStatus("processing");
    setError(null);

    // Brief artificial delay so the spinner is visible — matches the
    // feel of a real gateway round-trip.
    await new Promise((r) => setTimeout(r, 800));

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_reference: `MOCK-${Date.now()}`,
      })
      .eq("order_number", ref);

    if (updateError) {
      setStatus("error");
      setError(updateError.message);
      return;
    }

    // Off to the success page.
    const returnUrl = search.return ?? `/order/${ref}`;
    window.location.href = returnUrl;
  };

  const handleCancel = () => {
    const cancelUrl = search.cancel ?? "/checkout";
    window.location.href = cancelUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        {/* Loud demo banner */}
        <div className="rounded-t-md bg-primary text-on-primary px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-center">
          ⚠ Mock gateway · demo only · no real charge
        </div>

        <div className="rounded-b-md border border-border bg-surface p-6 space-y-6">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-success" />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              Hosted payment page
            </span>
          </div>

          <div>
            <h1 className="font-heading text-2xl font-semibold mb-1">
              Confirm payment
            </h1>
            <p className="text-sm text-muted">
              Pretending to be your gateway&apos;s hosted page. In production this
              would be TJ&apos;s actual hosted page running on their infrastructure.
            </p>
          </div>

          <div className="rounded-sm border border-border bg-bg p-4 space-y-2 text-sm">
            <Row label="Order" value={ref} mono />
            <Row label="Amount" value={`${search.currency ?? "ZAR"} ${amountRand}`} mono />
            {search.email && <Row label="Email" value={search.email} mono />}
          </div>

          {/* Fake card fields — purely cosmetic, never read */}
          <div className="space-y-3 opacity-60 pointer-events-none">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Card number</label>
              <div className="mt-1 px-3 py-2.5 border border-border rounded-sm bg-bg font-mono text-sm">
                4111 1111 1111 1111
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Expiry</label>
                <div className="mt-1 px-3 py-2.5 border border-border rounded-sm bg-bg font-mono text-sm">12 / 28</div>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">CVV</label>
                <div className="mt-1 px-3 py-2.5 border border-border rounded-sm bg-bg font-mono text-sm">•••</div>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-danger border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1"
              disabled={status === "processing"}
            >
              <XCircle size={16} className="mr-2" /> Cancel
            </Button>
            <Button
              onClick={handlePay}
              className="flex-1"
              disabled={status === "processing"}
            >
              {status === "processing" ? (
                "Processing…"
              ) : (
                <>
                  <CheckCircle2 size={16} className="mr-2" /> Pay {search.currency ?? "ZAR"} {amountRand}
                </>
              )}
            </Button>
          </div>

          <p className="text-[11px] text-muted text-center">
            No card data is collected or transmitted. This page exists for
            local development only.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}
