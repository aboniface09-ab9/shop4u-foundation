import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field, formToObject, Panel, selectClass, zodFieldErrors, type FieldErrors } from "@/components/platform/form-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePriceList, useSavePriceItem, type PriceItemRow } from "@/data/quotes";
import { centsToRandInput, randToCents } from "@/lib/money-input";
import { formatCents } from "@/lib/money";
import { LINE_KINDS, priceItemSchema } from "@/lib/schemas/quotes";

export const Route = createFileRoute("/platform/price-list")({
  component: PriceListPage,
});

function PriceListPage() {
  const { data: items = [], isLoading, error } = usePriceList();
  const [editing, setEditing] = useState<PriceItemRow | "new" | null>(null);
  const save = useSavePriceItem();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Price list</h1>
          <p className="text-muted text-sm mt-1">
            Reusable line items for quotes. Prices are ex VAT. Changing a price here never changes a quote that already
            has the line.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>New item</Button>
      </header>

      {error && <p className="text-sm text-danger">Couldn&apos;t load: {error.message}</p>}

      {editing && (
        <ItemForm
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? undefined : editing}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            save.mutate(
              { id: editing === "new" ? undefined : editing.id, input },
              {
                onSuccess: () => {
                  toast.success("Saved");
                  setEditing(null);
                },
                onError: (err) => toast.error("Couldn't save", { description: err.message }),
              },
            )
          }
        />
      )}

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Price (ex VAT)</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted text-sm py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {items.map((i) => (
              <TableRow key={i.id} className={i.active ? "" : "opacity-50"}>
                <TableCell className="font-mono text-xs">{i.code}</TableCell>
                <TableCell>
                  <div className="font-medium">{i.name}</div>
                  <div className="max-w-md truncate text-xs text-muted">{i.description}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{i.kind === "monthly" ? "Monthly" : "Once-off"}</Badge>
                  {!i.active && <Badge variant="secondary" className="ml-1">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCents(i.unit_price_cents)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ItemForm({
  item,
  busy,
  onSubmit,
  onCancel,
}: {
  item?: PriceItemRow;
  busy: boolean;
  onSubmit: (input: ReturnType<typeof priceItemSchema.parse>) => void;
  onCancel: () => void;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});

  return (
    <Panel title={item ? `Edit ${item.code}` : "New price list item"}>
      <form
        noValidate
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = formToObject(e.currentTarget);
          const cents = randToCents(raw.price_rand ?? "");
          if (cents === undefined || cents === null) {
            return setErrors({ unit_price_cents: "Enter a rand amount like 2500 or 2500.50" });
          }
          const parsed = priceItemSchema.safeParse({
            code: raw.code,
            name: raw.name,
            description: raw.description,
            kind: raw.kind,
            unit_price_cents: cents,
            active: raw.active === "on",
          });
          if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
          setErrors({});
          onSubmit(parsed.data);
        }}
      >
        <Field label="Code *" name="code" error={errors.code}>
          <Input id="code" name="code" defaultValue={item?.code ?? ""} maxLength={40} />
        </Field>
        <Field label="Type" name="kind" error={errors.kind}>
          <select id="kind" name="kind" defaultValue={item?.kind ?? "once_off"} className={selectClass}>
            {LINE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === "monthly" ? "Monthly" : "Once-off"}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Name *" name="name" error={errors.name}>
            <Input id="name" name="name" defaultValue={item?.name ?? ""} maxLength={200} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="What it covers" name="description" error={errors.description}>
            <Textarea id="description" name="description" defaultValue={item?.description ?? ""} rows={2} maxLength={1000} />
          </Field>
        </div>
        <Field label="Price in rand (ex VAT)" name="price_rand" error={errors.unit_price_cents}>
          <Input id="price_rand" name="price_rand" inputMode="decimal" defaultValue={centsToRandInput(item?.unit_price_cents)} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Active (shown when building quotes)
        </label>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
