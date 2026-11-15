import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Field,
  formToObject,
  Panel,
  selectClass,
  zodFieldErrors,
  type FieldErrors,
} from "@/components/platform/form-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActivity, useClient, useContacts } from "@/data/clients";
import {
  useAddLine,
  useDeleteLine,
  useDeleteQuote,
  usePriceList,
  useQuote,
  useSendQuote,
  useUpdateLine,
  useUpdateQuote,
  type QuoteLineRow,
  type QuoteRow,
} from "@/data/quotes";
import { computeTotals, formatCents, lineTotalCents } from "@/lib/money";
import { centsToRandInput, randToCents } from "@/lib/money-input";
import { LINE_KINDS, quoteLineSchema, quoteSettingsSchema } from "@/lib/schemas/quotes";

export const Route = createFileRoute("/platform/quotes/$id")({
  component: QuoteBuilder,
});

function QuoteBuilder() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuote(id);
  const { data: client } = useClient(data?.quote.client_id ?? "");

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error || !data) return <p className="text-sm text-danger">Quote not found.</p>;

  const { quote, lines } = data;
  const locked = quote.status !== "draft";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/platform/quotes" className="text-xs text-muted hover:text-text">
          ← All quotes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold font-mono">{quote.number}</h1>
          <Badge variant="outline" className="capitalize">
            {quote.status}
          </Badge>
        </div>
        <p className="text-sm text-muted">
          For{" "}
          <Link to="/platform/clients/$id" params={{ id: quote.client_id }} className="underline">
            {client?.company_name ?? "client"}
          </Link>
        </p>
      </div>

      {locked && (
        <p className="rounded-md border border-border bg-surface p-3 text-sm">
          This quote has been sent, so it is locked. To change anything, create a new quote.
        </p>
      )}

      <LinesPanel quote={quote} lines={lines} locked={locked} />
      <TotalsPanel quote={quote} lines={lines} />
      <SettingsPanel quote={quote} locked={locked} />
      <SendPanel quote={quote} lineCount={lines.length} />
      <QuoteActivity quoteId={quote.id} />
      {!locked && <DeleteDraft quoteId={quote.id} />}
    </div>
  );
}

function LinesPanel({
  quote,
  lines,
  locked,
}: {
  quote: QuoteRow;
  lines: QuoteLineRow[];
  locked: boolean;
}) {
  const { data: priceList = [] } = usePriceList();
  const add = useAddLine(quote.id);
  const [pickId, setPickId] = useState("");
  const active = priceList.filter((p) => p.active);

  const sections = [
    { kind: "once_off" as const, title: "Once-off build" },
    { kind: "monthly" as const, title: "Monthly hosting and maintenance" },
  ];

  return (
    <Panel title="Line items">
      <div className="space-y-6">
        {sections.map((s) => {
          const rows = lines.filter((l) => l.kind === s.kind);
          return (
            <div key={s.kind}>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                {s.title}
              </h3>
              {rows.length === 0 && <p className="text-sm text-muted">None yet.</p>}
              <ul className="divide-y divide-border">
                {rows.map((l) => (
                  <LineRow key={l.id} line={l} quoteId={quote.id} locked={locked} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {!locked && (
        <div className="mt-6 space-y-6 border-t border-border pt-6">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const item = active.find((p) => p.id === pickId);
              if (!item) return toast.error("Choose an item first");
              add.mutate(
                {
                  kind: item.kind,
                  name: item.name,
                  description: item.description,
                  quantity: 1,
                  unit_price_cents: item.unit_price_cents,
                  price_item_id: item.id,
                  sort_order: item.sort_order,
                },
                {
                  onSuccess: () => setPickId(""),
                  onError: (err) => toast.error("Couldn't add", { description: err.message }),
                },
              );
            }}
          >
            <div className="flex-1">
              <Field label="Add from price list" name="pick">
                <select
                  id="pick"
                  className={selectClass}
                  value={pickId}
                  onChange={(e) => setPickId(e.target.value)}
                >
                  <option value="">Choose an item…</option>
                  {active.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatCents(p.unit_price_cents)}{" "}
                      {p.kind === "monthly" ? "/mo" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button type="submit" variant="outline" disabled={add.isPending}>
              Add
            </Button>
          </form>
          <CustomLineForm quoteId={quote.id} />
        </div>
      )}
    </Panel>
  );
}

function LineRow({
  line,
  quoteId,
  locked,
}: {
  line: QuoteLineRow;
  quoteId: string;
  locked: boolean;
}) {
  const update = useUpdateLine(quoteId);
  const remove = useDeleteLine(quoteId);
  const [errors, setErrors] = useState<FieldErrors>({});

  if (locked) {
    return (
      <li className="flex justify-between gap-4 py-2 text-sm">
        <div>
          <div className="font-medium">{line.name}</div>
          <div className="text-xs text-muted">{line.description}</div>
        </div>
        <div className="font-mono">{formatCents(lineTotalCents(line))}</div>
      </li>
    );
  }

  return (
    <li className="py-3">
      <form
        noValidate
        className="grid gap-2 md:grid-cols-[1fr_5rem_9rem_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = formToObject(e.currentTarget);
          const cents = randToCents(raw.price_rand ?? "");
          if (cents === undefined || cents === null)
            return setErrors({ unit_price_cents: "Enter a rand amount" });
          const parsed = quoteLineSchema.safeParse({
            kind: line.kind,
            name: raw.name,
            description: line.description,
            quantity: raw.quantity,
            unit_price_cents: cents,
          });
          if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
          setErrors({});
          update.mutate(
            { id: line.id, input: parsed.data },
            {
              onSuccess: () => toast.success("Line saved"),
              onError: (err) => toast.error("Couldn't save line", { description: err.message }),
            },
          );
        }}
      >
        <Field label="Item" name={`n-${line.id}`} error={errors.name}>
          <Input id={`n-${line.id}`} name="name" defaultValue={line.name} maxLength={200} />
        </Field>
        <Field label="Qty" name={`q-${line.id}`} error={errors.quantity}>
          <Input
            id={`q-${line.id}`}
            name="quantity"
            inputMode="numeric"
            defaultValue={String(line.quantity)}
          />
        </Field>
        <Field label="Unit price (rand)" name={`p-${line.id}`} error={errors.unit_price_cents}>
          <Input
            id={`p-${line.id}`}
            name="price_rand"
            inputMode="decimal"
            defaultValue={centsToRandInput(line.unit_price_cents)}
          />
        </Field>
        <div className="flex gap-1">
          <Button type="submit" size="sm" variant="outline" disabled={update.isPending}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Remove ${line.name}`}
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(line.id, {
                onError: (err) => toast.error("Couldn't remove", { description: err.message }),
              })
            }
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </form>
      <div className="mt-1 text-right font-mono text-xs text-muted">
        Line total {formatCents(lineTotalCents(line))}
      </div>
    </li>
  );
}

function CustomLineForm({ quoteId }: { quoteId: string }) {
  const add = useAddLine(quoteId);
  const [errors, setErrors] = useState<FieldErrors>({});

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-[1fr_9rem_5rem_9rem_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const raw = formToObject(form);
        const cents = randToCents(raw.price_rand ?? "");
        if (cents === undefined || cents === null)
          return setErrors({ unit_price_cents: "Enter a rand amount" });
        const parsed = quoteLineSchema.safeParse({
          kind: raw.kind,
          name: raw.name,
          description: "",
          quantity: raw.quantity || "1",
          unit_price_cents: cents,
        });
        if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
        setErrors({});
        add.mutate(
          { ...parsed.data, sort_order: 200 },
          {
            onSuccess: () => form.reset(),
            onError: (err) => toast.error("Couldn't add", { description: err.message }),
          },
        );
      }}
    >
      <Field label="Custom line" name="custom_name" error={errors.name}>
        <Input id="custom_name" name="name" maxLength={200} placeholder="e.g. Extra page" />
      </Field>
      <Field label="Type" name="custom_kind">
        <select id="custom_kind" name="kind" className={selectClass} defaultValue="once_off">
          {LINE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k === "monthly" ? "Monthly" : "Once-off"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Qty" name="custom_qty" error={errors.quantity}>
        <Input id="custom_qty" name="quantity" inputMode="numeric" defaultValue="1" />
      </Field>
      <Field label="Unit price (rand)" name="custom_price" error={errors.unit_price_cents}>
        <Input id="custom_price" name="price_rand" inputMode="decimal" />
      </Field>
      <Button type="submit" variant="outline" disabled={add.isPending}>
        Add
      </Button>
    </form>
  );
}

function TotalsPanel({ quote, lines }: { quote: QuoteRow; lines: QuoteLineRow[] }) {
  const t = useMemo(
    () =>
      computeTotals(lines, {
        depositPercent: quote.deposit_percent,
        vatRateBps: quote.vat_rate_bps,
      }),
    [lines, quote.deposit_percent, quote.vat_rate_bps],
  );
  const hasVat = quote.vat_rate_bps > 0;

  const rows: { label: string; value: number; strong?: boolean }[] = [
    { label: "Total once-off build (ex VAT)", value: t.onceOffCents, strong: true },
    { label: `Deposit on acceptance (${quote.deposit_percent}%)`, value: t.depositCents },
    { label: "Balance on launch", value: t.balanceCents },
    { label: "Monthly hosting and maintenance (ex VAT)", value: t.monthlyCents, strong: true },
    { label: "First-year total (build + 12 months)", value: t.firstYearCents },
  ];

  return (
    <Panel title="Summary">
      <dl className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt className={r.strong ? "font-medium" : "text-muted"}>{r.label}</dt>
            <dd className="font-mono">{formatCents(r.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        {hasVat
          ? `VAT at ${(quote.vat_rate_bps / 100).toFixed(0)}% is added to invoices: deposit ${formatCents(t.incl.deposit)}, monthly ${formatCents(t.incl.monthly)}.`
          : "No VAT is charged on this quote."}
      </p>
    </Panel>
  );
}

function SettingsPanel({ quote, locked }: { quote: QuoteRow; locked: boolean }) {
  const update = useUpdateQuote(quote.id);
  const [errors, setErrors] = useState<FieldErrors>({});

  return (
    <Panel title="Terms of this quote">
      <form
        noValidate
        className="grid gap-4 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = quoteSettingsSchema.safeParse(formToObject(e.currentTarget));
          if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
          setErrors({});
          update.mutate(parsed.data, {
            onSuccess: () => toast.success("Saved"),
            onError: (err) => toast.error("Couldn't save", { description: err.message }),
          });
        }}
      >
        <fieldset disabled={locked} className="contents">
          <Field label="Valid until" name="valid_until" error={errors.valid_until}>
            <Input
              id="valid_until"
              name="valid_until"
              type="date"
              defaultValue={quote.valid_until}
            />
          </Field>
          <Field label="Deposit %" name="deposit_percent" error={errors.deposit_percent}>
            <Input
              id="deposit_percent"
              name="deposit_percent"
              inputMode="numeric"
              defaultValue={String(quote.deposit_percent)}
            />
          </Field>
          <Field label="VAT" name="vat_rate_bps" error={errors.vat_rate_bps}>
            <select
              id="vat_rate_bps"
              name="vat_rate_bps"
              className={selectClass}
              defaultValue={String(quote.vat_rate_bps)}
            >
              <option value="0">No VAT</option>
              <option value="1500">15% VAT added</option>
            </select>
          </Field>
          <div className="md:col-span-3">
            <Field label="Introduction" name="intro" error={errors.intro}>
              <Textarea
                id="intro"
                name="intro"
                rows={3}
                defaultValue={quote.intro}
                maxLength={4000}
              />
            </Field>
          </div>
          <div className="md:col-span-3">
            <Field label="Terms" name="terms" error={errors.terms}>
              <Textarea
                id="terms"
                name="terms"
                rows={6}
                defaultValue={quote.terms}
                maxLength={8000}
              />
            </Field>
          </div>
          {!locked && (
            <div className="md:col-span-3">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save terms"}
              </Button>
            </div>
          )}
        </fieldset>
      </form>
    </Panel>
  );
}

const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";

function SendPanel({ quote, lineCount }: { quote: QuoteRow; lineCount: number }) {
  const { data: contacts = [] } = useContacts(quote.client_id);
  const send = useSendQuote(quote.id);
  const withEmail = contacts.filter((c) => c.email);
  const [recipient, setRecipient] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const chosen =
    recipient || withEmail.find((c) => c.is_primary)?.email || withEmail[0]?.email || "";

  const resend = quote.status === "sent" || quote.status === "viewed";
  const canSend = quote.status === "draft" || resend;

  const submit = () => {
    if (!chosen) return;
    const warning = resend
      ? "Re-send issues a NEW link and the old link stops working. Continue?"
      : `Send ${quote.number} to ${chosen}? The quote will be locked and can't be edited afterwards.`;
    if (!window.confirm(warning)) return;
    send.mutate(chosen, {
      onSuccess: (r) => {
        if (r.link) setLink(r.link);
        if (r.ok && r.emailed) toast.success("Quote emailed to the client");
        else if (r.ok && r.dryRun)
          toast.success("Dry run: quote locked and link created, no email sent");
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
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Status</dt>
          <dd className="capitalize">{quote.status}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Sent</dt>
          <dd>
            {fmtWhen(quote.sent_at)}
            {quote.sent_to_email ? ` to ${quote.sent_to_email}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">First viewed</dt>
          <dd>{fmtWhen(quote.viewed_at)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Accepted</dt>
          <dd>
            {quote.accepted_at ? `${quote.accepted_name} on ${fmtWhen(quote.accepted_at)}` : "—"}
          </dd>
        </div>
      </dl>

      {canSend ? (
        <div className="space-y-3">
          {withEmail.length === 0 ? (
            <p className="text-sm text-danger">
              Add a contact with an email address to the client first. The link can only be sent to
              a contact on file.
            </p>
          ) : (
            <Field label="Send to" name="recipient">
              <select
                id="recipient"
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
          {lineCount === 0 && (
            <p className="text-sm text-danger">Add at least one line item first.</p>
          )}
          <Button onClick={submit} disabled={send.isPending || !chosen || lineCount === 0}>
            {send.isPending ? "Sending…" : resend ? "Re-send with a new link" : "Send quote"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">This quote can no longer be sent.</p>
      )}

      {link && (
        <div className="mt-4 rounded-md border border-border bg-bg p-3">
          <p className="mb-1 text-xs text-muted">
            Private link (anyone with it can view and accept this quote):
          </p>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full bg-transparent font-mono text-xs"
            aria-label="Private quote link"
          />
        </div>
      )}
    </Panel>
  );
}

function QuoteActivity({ quoteId }: { quoteId: string }) {
  const { data: rows = [] } = useActivity(quoteId);
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

function DeleteDraft({ quoteId }: { quoteId: string }) {
  const navigate = useNavigate();
  const remove = useDeleteQuote();
  return (
    <div>
      <Button
        variant="ghost"
        className="text-danger"
        disabled={remove.isPending}
        onClick={() => {
          if (!window.confirm("Delete this draft quote? This can't be undone.")) return;
          remove.mutate(quoteId, {
            onSuccess: () => navigate({ to: "/platform/quotes" }),
            onError: (err) => toast.error("Couldn't delete", { description: err.message }),
          });
        }}
      >
        Delete draft
      </Button>
    </div>
  );
}
