import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { INVOICE_KIND_TITLE, invoiceHeading, type InvoiceDocument } from "@/lib/invoice-document";
import { formatCents } from "@/lib/money";
import { supabase } from "@/lib/supabase";

/**
 * /i/:token: the client's private view of an invoice. No sign-in; the 256-bit token IS the
 * credential. Data comes from the token-keyed SECURITY DEFINER function get_invoice_by_token, which
 * returns the EFT details only while the invoice is awaiting payment. The Worker adds no-store /
 * no-referrer / noindex headers to this path (see src/server.ts). No payment is taken here.
 */
export const Route = createFileRoute("/i/$token")({
  head: () => ({
    meta: [{ title: "Invoice" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PublicInvoice,
});

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function PublicInvoice() {
  const { token } = Route.useParams();
  const valid = TOKEN_PATTERN.test(token);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["public-invoice", token],
    enabled: valid,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<InvoiceDocument | null> => {
      const { data, error } = await supabase.rpc("get_invoice_by_token", { p_token: token });
      if (error) throw error;
      return (data as InvoiceDocument | null) ?? null;
    },
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
            <h1 className="font-heading text-xl font-semibold">Invoice not found</h1>
            <p className="mt-2 text-sm text-muted">
              This link is not valid, or it has been replaced by a newer one. Please contact us.
            </p>
          </div>
        )}
        {valid && isLoading && <p className="text-sm text-muted">Loading your invoice…</p>}
        {doc && <InvoiceView doc={doc} token={token} />}
      </main>
    </div>
  );
}

function InvoiceView({ doc, token }: { doc: InvoiceDocument; token: string }) {
  const b = doc.business;
  return (
    <article>
      <div className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          {invoiceHeading(doc)} {doc.number}
        </p>
        <h1 className="font-heading text-3xl font-semibold">
          {INVOICE_KIND_TITLE[doc.kind]}
          {doc.period_start
            ? ` (${new Date(doc.period_start + "T00:00:00Z").toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" })})`
            : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">
          For {doc.client.company_name}. From {b.legal_name}
          {b.vat_registered && b.vat_number ? ` (VAT no ${b.vat_number})` : ""}. Issued{" "}
          {fmtDate(doc.issue_date)}.
        </p>
        <p className="mt-3">
          <a
            href={`/api/i/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Download PDF
          </a>
        </p>
      </div>

      {doc.status === "void" && (
        <div role="status" className="mb-6 rounded-md border border-border bg-surface p-4 text-sm">
          This invoice has been cancelled. Please contact us if you have a question.
        </div>
      )}
      {doc.status === "paid" && doc.paid_on && (
        <div role="status" className="mb-6 rounded-md border border-border bg-surface p-4">
          <p className="font-medium">Paid, thank you</p>
          <p className="text-sm text-muted">Payment received on {fmtDate(doc.paid_on)}.</p>
        </div>
      )}

      <section className="mb-6 rounded-md border border-border bg-surface">
        <ul className="divide-y divide-border">
          {doc.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4 px-4 py-3">
              <div>
                <div className="font-medium">
                  {l.name}
                  {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                </div>
                {l.description && <div className="text-sm text-muted">{l.description}</div>}
              </div>
              <div className="whitespace-nowrap font-mono text-sm">
                {formatCents(l.quantity * l.unit_price_cents)}
              </div>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-border px-4 py-3 text-sm">
          <Row label="Subtotal (ex VAT)" value={formatCents(doc.subtotal_cents)} />
          <Row
            label={doc.vat_rate_bps > 0 ? `VAT (${(doc.vat_rate_bps / 100).toFixed(0)}%)` : "VAT"}
            value={doc.vat_rate_bps > 0 ? formatCents(doc.vat_cents) : "Not charged"}
          />
          <Row
            label={doc.status === "paid" ? "Total" : "Total due"}
            value={formatCents(doc.total_cents)}
            strong
          />
          {doc.status === "sent" && <Row label="Due by" value={fmtDate(doc.due_date)} />}
        </dl>
      </section>

      {doc.status === "sent" && doc.bank && (
        <section className="mb-6 rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 font-heading text-lg font-semibold">Pay by EFT</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Bank" value={doc.bank.bank_name} />
            <Row label="Account holder" value={doc.bank.account_holder} />
            <Row label="Account number" value={doc.bank.account_number} />
            <Row label="Branch code" value={doc.bank.branch_code} />
            <Row label="Payment reference" value={doc.number} strong />
          </dl>
          <p className="mt-3 text-xs text-muted">
            Please use the invoice number as your payment reference so we can match your payment. We
            do not take card payments on this page.
          </p>
        </section>
      )}

      {doc.notes && <p className="whitespace-pre-line text-sm text-muted">{doc.notes}</p>}
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-medium" : "text-muted"}>{label}</dt>
      <dd className={`font-mono ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
