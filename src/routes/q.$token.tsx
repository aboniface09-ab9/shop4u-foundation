import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeTotals, formatCents, lineTotalCents } from "@/lib/money";
import type { QuoteDocument } from "@/lib/quote-document";
import { supabase } from "@/lib/supabase";

/**
 * /q/:token: the client's private view of a quote. No sign-in; the 256-bit token IS the credential.
 * Data comes from token-keyed SECURITY DEFINER database functions (get_quote_by_token /
 * accept_quote), so nothing else is readable. The Worker adds no-store / no-referrer / noindex
 * headers to this path (see src/server.ts).
 */
export const Route = createFileRoute("/q/$token")({
  head: () => ({
    meta: [{ title: "Quotation" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PublicQuote,
});

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const REASONS: Record<string, string> = {
  invalid_name: "Please type your full name (at least 2 characters).",
  not_found: "This link is not valid.",
  expired: "This quotation has expired. Please contact us for an updated one.",
  declined: "This quotation is no longer open.",
  draft: "This quotation is not ready yet.",
};

type AcceptResult = {
  ok: boolean;
  already?: boolean;
  reason?: string;
  accepted_at?: string;
  accepted_name?: string;
};

function PublicQuote() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const valid = TOKEN_PATTERN.test(token);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["public-quote", token],
    enabled: valid,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<QuoteDocument | null> => {
      const { data, error } = await supabase.rpc("get_quote_by_token", { p_token: token });
      if (error) throw error;
      return (data as QuoteDocument | null) ?? null;
    },
  });

  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: async (): Promise<AcceptResult> => {
      const { data, error } = await supabase.rpc("accept_quote", { p_token: token, p_name: name });
      if (error) throw error;
      return data as AcceptResult;
    },
    onSuccess: async (r) => {
      if (r.ok) {
        setMessage(null);
        await qc.invalidateQueries({ queryKey: ["public-quote", token] });
        qc.refetchQueries({ queryKey: ["public-quote", token] });
      } else {
        setMessage(REASONS[r.reason ?? ""] ?? "Something went wrong. Please try again.");
      }
    },
    onError: () => setMessage("Something went wrong. Please try again."),
  });

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Fixed YouCommerce brand colours (navy + teal), not the storefront theme, to match the PDF. */}
      <header style={{ background: "#122a4d", color: "#fff", borderBottom: "4px solid #0e9e8f" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <img src="/logo-mark.png" alt="" className="h-7 w-7 rounded-sm" />
          <span className="font-heading text-lg font-semibold">YouCommerce</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {(!valid || (!isLoading && !doc)) && (
          <div className="rounded-md border border-border bg-surface p-6 text-center">
            <h1 className="font-heading text-xl font-semibold">Quotation not found</h1>
            <p className="mt-2 text-sm text-muted">
              This link is not valid, or it has been replaced by a newer one. Please contact us.
            </p>
          </div>
        )}
        {valid && isLoading && <p className="text-sm text-muted">Loading your quotation…</p>}
        {doc && (
          <QuoteView
            doc={doc}
            token={token}
            name={name}
            setName={setName}
            agreed={agreed}
            setAgreed={setAgreed}
            message={message}
            busy={accept.isPending}
            onAccept={() => accept.mutate()}
          />
        )}
      </main>
    </div>
  );
}

function QuoteView({
  doc,
  token,
  name,
  setName,
  agreed,
  setAgreed,
  message,
  busy,
  onAccept,
}: {
  doc: QuoteDocument;
  token: string;
  name: string;
  setName: (v: string) => void;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  message: string | null;
  busy: boolean;
  onAccept: () => void;
}) {
  const t = computeTotals(doc.lines, {
    depositPercent: doc.deposit_percent,
    vatRateBps: doc.vat_rate_bps,
  });
  const hasVat = doc.vat_rate_bps > 0;
  const open = doc.status === "sent" || doc.status === "viewed";
  const validUntil = new Date(doc.valid_until + "T00:00:00Z").toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const section = (title: string, kind: "once_off" | "monthly") => {
    const rows = doc.lines.filter((l) => l.kind === kind);
    if (rows.length === 0) return null;
    const sum = rows.reduce((a, l) => a + lineTotalCents(l), 0);
    return (
      <section className="mb-6 rounded-md border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-heading text-lg font-semibold">
          {title}
        </h2>
        <ul className="divide-y divide-border">
          {rows.map((l, i) => (
            <li key={i} className="flex justify-between gap-4 px-4 py-3">
              <div>
                <div className="font-medium">
                  {l.name}
                  {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                </div>
                {l.description && <div className="text-sm text-muted">{l.description}</div>}
              </div>
              <div className="whitespace-nowrap font-mono text-sm">
                {formatCents(lineTotalCents(l))}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-border px-4 py-3 font-medium">
          <span>{kind === "monthly" ? "Total per month" : "Total once-off build"}</span>
          <span className="font-mono">{formatCents(sum)}</span>
        </div>
      </section>
    );
  };

  return (
    <article>
      <div className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          Quotation {doc.number}
        </p>
        <h1 className="font-heading text-3xl font-semibold">
          Prepared for {doc.client.company_name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          From {doc.business.legal_name}. Valid until {validUntil}.{" "}
          {hasVat
            ? `Prices exclude VAT; ${(doc.vat_rate_bps / 100).toFixed(0)}% VAT is added on invoices.`
            : "No VAT is charged."}
        </p>
        <p className="mt-3">
          <a
            href={`/api/q/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Download PDF
          </a>
        </p>
      </div>

      {doc.intro && <p className="mb-6 whitespace-pre-line">{doc.intro}</p>}

      {section("Once-off build", "once_off")}
      {section("Monthly hosting and maintenance", "monthly")}

      <section className="mb-6 rounded-md border border-border bg-surface p-4">
        <h2 className="mb-3 font-heading text-lg font-semibold">Payment terms</h2>
        <dl className="space-y-2 text-sm">
          <Row
            label={`On acceptance (${doc.deposit_percent}% deposit)`}
            value={formatCents(t.depositCents)}
          />
          <Row label="On launch (balance of build)" value={formatCents(t.balanceCents)} />
          <Row label="Monthly, starting at launch" value={formatCents(t.monthlyCents)} />
          <Row
            label="First-year total (build + 12 months)"
            value={formatCents(t.firstYearCents)}
            strong
          />
        </dl>
        {hasVat && (
          <p className="mt-3 text-xs text-muted">
            With VAT: deposit {formatCents(t.incl.deposit)}, balance {formatCents(t.incl.balance)},
            monthly {formatCents(t.incl.monthly)}.
          </p>
        )}
      </section>

      {doc.terms && (
        <section className="mb-6">
          <h2 className="mb-2 font-heading text-lg font-semibold">Terms</h2>
          <p className="whitespace-pre-line text-sm">{doc.terms}</p>
        </section>
      )}

      {doc.status === "accepted" && doc.accepted_name && doc.accepted_at && (
        <div role="status" className="rounded-md border border-border bg-surface p-4">
          <p className="font-medium">Quotation accepted</p>
          <p className="text-sm text-muted">
            Accepted by {doc.accepted_name} on{" "}
            {new Date(doc.accepted_at).toLocaleString("en-ZA", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Africa/Johannesburg",
            })}
            . We will be in touch with your deposit invoice.
          </p>
        </div>
      )}

      {doc.status === "expired" && (
        <div role="status" className="rounded-md border border-border bg-surface p-4 text-sm">
          This quotation expired on {validUntil}. Please contact us for an updated quote.
        </div>
      )}

      {open && (
        <form
          className="space-y-4 rounded-md border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!agreed) return;
            onAccept();
          }}
        >
          <h2 className="font-heading text-lg font-semibold">Accept this quotation</h2>
          <div className="space-y-1.5">
            <label htmlFor="accept-name" className="text-sm font-medium">
              Your full name
            </label>
            <Input
              id="accept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I accept this quotation and its terms on behalf of {doc.client.company_name}.
            </span>
          </label>
          {message && (
            <p role="alert" className="text-sm text-danger">
              {message}
            </p>
          )}
          <Button type="submit" disabled={busy || !agreed || name.trim().length < 2}>
            {busy ? "Submitting…" : "Accept quotation"}
          </Button>
          <p className="text-xs text-muted">
            Your name and the time of acceptance are recorded. No payment is taken here; we will
            send you an invoice.
          </p>
        </form>
      )}
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-medium" : "text-muted"}>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
