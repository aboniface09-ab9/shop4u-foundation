import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuotes } from "@/data/quotes";

export const Route = createFileRoute("/platform/quotes/")({
  component: QuotesList,
});

function QuotesList() {
  const { data: quotes = [], isLoading, error } = useQuotes();

  return (
    <div>
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Quotes</h1>
          <p className="text-muted text-sm mt-1">Built from the price list.</p>
        </div>
        <Button asChild>
          <Link to="/platform/quotes/new">New quote</Link>
        </Button>
      </header>

      {error && <p className="mb-4 text-sm text-danger">Couldn&apos;t load quotes: {error.message}</p>}

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valid until</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted text-sm py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && quotes.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted text-sm py-8">
                  No quotes yet.
                </TableCell>
              </TableRow>
            )}
            {quotes.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-sm">
                  <Link to="/platform/quotes/$id" params={{ id: q.id }} className="hover:underline">
                    {q.number}
                  </Link>
                </TableCell>
                <TableCell>{q.client?.company_name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={q.status === "accepted" ? "default" : "outline"} className="capitalize">
                    {q.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{new Date(q.valid_until).toLocaleDateString("en-ZA")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
