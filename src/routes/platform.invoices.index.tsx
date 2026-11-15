import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KIND_LABEL, useInvoices, type InvoiceStatus } from "@/data/invoices";
import { formatCents } from "@/lib/money";

export const Route = createFileRoute("/platform/invoices/")({
  component: InvoicesList,
});

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
  void: "outline",
};

function InvoicesList() {
  const { data: invoices = [], isLoading, error } = useInvoices();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

  const drafts = invoices.filter((i) => i.status === "draft");
  const outstanding = invoices.filter((i) => i.status === "sent");
  const overdue = outstanding.filter((i) => i.due_date < today);
  const sum = (rows: typeof invoices) => rows.reduce((a, i) => a + i.total_cents, 0);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-semibold">Invoices</h1>
        <p className="text-muted text-sm mt-1">
          Created as drafts when a quote is accepted, when a project goes live, and each month.
          Review, then send.
        </p>
      </header>

      <dl className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Drafts to review" value={String(drafts.length)} />
        <Stat
          label="Awaiting payment"
          value={`${outstanding.length} · ${formatCents(sum(outstanding))}`}
        />
        <Stat
          label="Overdue"
          value={`${overdue.length} · ${formatCents(sum(overdue))}`}
          danger={overdue.length > 0}
        />
      </dl>

      {error && (
        <p className="mb-4 text-sm text-danger">Couldn&apos;t load invoices: {error.message}</p>
      )}

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted text-sm py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted text-sm py-8">
                  No invoices yet.
                </TableCell>
              </TableRow>
            )}
            {invoices.map((i) => (
              <TableRow key={i.id} className={i.status === "void" ? "opacity-50" : ""}>
                <TableCell className="font-mono text-sm">
                  <Link
                    to="/platform/invoices/$id"
                    params={{ id: i.id }}
                    className="hover:underline"
                  >
                    {i.number}
                  </Link>
                </TableCell>
                <TableCell>{i.client?.company_name ?? "—"}</TableCell>
                <TableCell>
                  {KIND_LABEL[i.kind]}
                  {i.period_start && (
                    <span className="ml-1 text-xs text-muted">
                      {new Date(i.period_start + "T00:00:00Z").toLocaleDateString("en-ZA", {
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[i.status]} className="capitalize">
                    {i.status}
                  </Badge>
                  {i.status === "sent" && i.due_date < today && (
                    <Badge variant="destructive" className="ml-1">
                      Overdue
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {new Date(i.due_date + "T00:00:00Z").toLocaleDateString("en-ZA", {
                    timeZone: "UTC",
                  })}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCents(i.total_cents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 font-mono text-lg ${danger ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}
