import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field, Panel, selectClass } from "@/components/platform/form-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActivity, useClient, useContacts } from "@/data/clients";
import {
  KIND_LABEL,
  useInvoice,
  useMarkInvoicePaid,
  useSendInvoice,
  useVoidInvoice,
  type InvoiceLineRow,
  type InvoiceRow,
} from "@/data/invoices";
import { formatCents } from "@/lib/money";

export const Route = createFileRoute("/platform/invoices/$id")({
  component: InvoicePage,
});

const sastToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
const fmtDate = (d: string | null) =>
  d
    ? new Date(d + "T00:00:00Z").toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";

function InvoicePage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useInvoice(id);
  const { data: client } = useClient(data?.invoice.client_id ?? "");

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error || !data) return <p className="text-sm text-danger">Invoice not found.</p>;
  const { invoice, lines } = data;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/platform/invoices" className="text-xs text-muted hover:text-text">
          ← All invoices
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl font-semibold">{invoice.number}</h1>
          <Badge variant="outline" className="capitalize">
            {invoice.status}
          </Badge>
          <Badge variant="secondary">{KIND_LABEL[invoice.kind]}</Badge>
        </div>
        <p className="text-sm text-muted">
          For{" "}
          <Link to="/platform/clients/$id" params={{ id: invoice.client_id }} className="underline">
            {client?.company_name ?? "client"}
          </Link>
          {invoice.quote_id && (
            <>
              {" · from "}
              <Link
                to="/platform/quotes/$id"
                params={{ id: invoice.quote_id }}
                className="underline"
              >
                quote
              </Link>
            </>
          )}
        </p>
      </div>

      <Panel title="Invoice">
        <dl className="mb-4 grid gap-1 text-sm sm:grid-cols-3">
          <Info label="Issued" value={fmtDate(invoice.issue_date)} />
          <Info label="Due" value={fmtDate(invoice.due_date)} />
          <Info label="Period" value={invoice.period_start ? fmtDate(invoice.period_start) : "—"} />
        </dl>
        <ul className="divide-y divide-border">
          {lines.map((l) => (
            <LineItem key={l.id} line={l} />
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          <Row label="Subtotal (ex VAT)" value={formatCents(invoice.subtotal_cents)} />
          <Row
            label={
              invoice.vat_rate_bps > 0 ? `VAT (${(invoice.vat_rate_bps / 100).toFixed(0)}%)` : "VAT"
            }
            value={invoice.vat_rate_bps > 0 ? formatCents(invoice.vat_cents) : "Not charged"}
          />
          <Row label="Total due" value={formatCents(invoice.total_cents)} strong />
        </dl>
      </Panel>

      <SendPanel invoice={invoice} />
      {(invoice.status === "draft" || invoice.status === "sent") && <PayPanel invoice={invoice} />}
      <InvoiceActivity invoiceId={invoice.id} />
      {(invoice.status === "draft" || invoice.status === "sent") && (
        <VoidPanel invoiceId={invoice.id} />
      )}
    </div>
  );
}

function LineItem({ line }: { line: InvoiceLineRow }) {
  return (
    <li className="flex justify-between gap-4 py-2 text-sm">
      <div>
        <div className="font-medium">
          {line.name}
          {line.quantity > 1 ? ` × ${line.quantity}` : ""}
        </div>
        {line.description && <div className="text-xs text-muted">{line.description}</div>}
      </div>
      <div className="whitespace-nowrap font-mono">
        {formatCents(line.quantity * line.unit_price_cents)}
      </div>
    </li>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
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

function SendPanel({ invoice }: { invoice: InvoiceRow }) {
  const { data: contacts = [] } = useContacts(invoice.client_id);
  const send = useSendInvoice(invoice.id);
  const withEmail = contacts.filter((c) => c.email);
  const [recipient, setRecipient] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const chosen =
    recipient || withEmail.find((c) => c.is_primary)?.email || withEmail[0]?.email || "";

  const resend = invoice.status === "sent";
  const canSend = invoice.status === "draft" || resend;

  const submit = () => {
    if (!chosen) return;
    const warning = resend
      ? "Re-send issues a NEW link and the old link stops working. Continue?"
      : `Send ${invoice.number} (${formatCents(invoice.total_cents)}) to ${chosen}?`;
    if (!window.confirm(warning)) return;
    send.mutate(chosen, {
      onSuccess: (r) => {
        if (r.link) setLink(r.link);
        if (r.ok && r.emailed) toast.success("Invoice emailed to the client");
        else if (r.ok && r.dryRun) toast.success("Dry run: link created, no email sent");
        else
          toast.error(r.reason ?? "Email failed", {
            description: r.link ? "The link is shown below." : undefined,
          });
      },
      onError: (err) => toast.error("Couldn't send", { description: err.message }),
    });
  };

  return (
    <Panel title="Send to client">
      <dl className="mb-4 grid gap-1 text-sm sm:grid-cols-2">
        <Info
          label="Sent"
          value={`${fmtWhen(invoice.sent_at)}${invoice.sent_to_email ? ` to ${invoice.sent_to_email}` : ""}`}
        />
        <Info label="First viewed" value={fmtWhen(invoice.viewed_at)} />
        <Info
          label="Paid"
          value={
            invoice.paid_on
              ? `${fmtDate(invoice.paid_on)}${invoice.payment_reference ? ` · ${invoice.payment_reference}` : ""}`
              : "—"
          }
        />
      </dl>

      {canSend ? (
        <div className="space-y-3">
          {withEmail.length === 0 ? (
            <p className="text-sm text-danger">
              Add a contact with an email address to the client first.
            </p>
          ) : (
            <Field label="Send to" name="invoice-recipient">
              <select
                id="invoice-recipient"
                className={selectClass}
                value={chosen}
                onChange={(e) => setRecipient(e.target.value)}
              >
                {withEmail.map((c) => (
                  <option key={c.id} value={c.email ?? ""}>
                    {c.name} ({c.email}){c.is_primary ? " · primary" : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="text-xs text-muted">
            The email carries a private link and the PDF, including your EFT bank details from
            Settings.
          </p>
          <Button onClick={submit} disabled={send.isPending || !chosen}>
            {send.isPending ? "Sending…" : resend ? "Re-send with a new link" : "Send invoice"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          This invoice is {invoice.status} and can no longer be sent.
        </p>
      )}

      {link && (
        <div className="mt-4 rounded-md border border-border bg-bg p-3">
          <p className="mb-1 text-xs text-muted">
            Private link (anyone with it can view this invoice and your bank details):
          </p>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full bg-transparent font-mono text-xs"
            aria-label="Private invoice link"
          />
        </div>
      )}
    </Panel>
  );
}

function PayPanel({ invoice }: { invoice: InvoiceRow }) {
  const pay = useMarkInvoicePaid(invoice.id);
  const [date, setDate] = useState(sastToday());
  const [reference, setReference] = useState("");

  return (
    <Panel title="Record payment (EFT)">
      <form
        className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!window.confirm(`Mark ${invoice.number} as paid on ${fmtDate(date)}?`)) return;
          pay.mutate(
            { paidOn: date, reference },
            {
              onSuccess: () => toast.success("Marked as paid"),
              onError: (err) =>
                toast.error("Couldn't record payment", { description: err.message }),
            },
          );
        }}
      >
        <Field label="Paid on" name="paid_on">
          <Input
            id="paid_on"
            type="date"
            value={date}
            max={sastToday()}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <Field label="Bank reference (optional)" name="payment_reference">
          <Input
            id="payment_reference"
            value={reference}
            maxLength={100}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={pay.isPending}>
          {pay.isPending ? "Saving…" : "Mark paid"}
        </Button>
      </form>
    </Panel>
  );
}

function InvoiceActivity({ invoiceId }: { invoiceId: string }) {
  const { data: rows = [] } = useActivity(invoiceId);
  return (
    <Panel title="Activity">
      <ul className="space-y-1 text-sm">
        {rows.length === 0 && <li className="text-muted">Nothing yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span>{r.event.replace(/_/g, " ")}</span>
            <span className="font-mono text-xs text-muted">
              {new Date(r.created_at).toLocaleString("en-ZA")}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function VoidPanel({ invoiceId }: { invoiceId: string }) {
  const voidInvoice = useVoidInvoice(invoiceId);
  const [reason, setReason] = useState("");
  return (
    <Panel title="Void this invoice">
      <p className="mb-3 text-xs text-muted">
        Voiding cannot be undone, and a voided deposit or balance is not re-created automatically.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Reason" name="void_reason">
            <Input
              id="void_reason"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
        <Button
          variant="outline"
          className="text-danger"
          disabled={voidInvoice.isPending || reason.trim().length < 3}
          onClick={() => {
            if (!window.confirm("Void this invoice? This can't be undone.")) return;
            voidInvoice.mutate(reason.trim(), {
              onSuccess: () => toast.success("Invoice voided"),
              onError: (err) => toast.error("Couldn't void", { description: err.message }),
            });
          }}
        >
          Void invoice
        </Button>
      </div>
    </Panel>
  );
}
