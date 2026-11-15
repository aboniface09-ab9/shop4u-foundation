import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClients } from "@/data/clients";

export const Route = createFileRoute("/platform/clients/")({
  component: ClientsList,
});

function ClientsList() {
  const { data: clients = [], isLoading, error } = useClients();

  return (
    <div>
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Clients</h1>
          <p className="text-muted text-sm mt-1">Custom-build website clients.</p>
        </div>
        <Button asChild>
          <Link to="/platform/clients/new">New client</Link>
        </Button>
      </header>

      {error && (
        <p className="mb-4 text-sm text-danger">Couldn&apos;t load clients: {error.message}</p>
      )}

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted text-sm py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted text-sm py-8">
                  No clients yet.
                </TableCell>
              </TableRow>
            )}
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/platform/clients/$id"
                    params={{ id: c.id }}
                    className="hover:underline"
                  >
                    {c.company_name}
                  </Link>
                  {c.trading_name && <div className="text-xs text-muted">{c.trading_name}</div>}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={c.status === "active" ? "default" : "outline"}
                    className="capitalize"
                  >
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {new Date(c.created_at).toLocaleDateString("en-ZA")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
