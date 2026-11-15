import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PriceItemRow } from "@/data/quotes";
import { formatCents } from "@/lib/money";
import { linesFromPriceItems, selectableIds, type NewQuoteLine } from "@/lib/quote-lines";

const GROUPS = [
  { kind: "once_off" as const, title: "Once-off build" },
  { kind: "monthly" as const, title: "Monthly hosting and maintenance" },
];

/**
 * Tick any number of price-list items and add them to the quote in one click.
 * Items already on the quote are shown but can't be ticked again (raise the quantity on the existing
 * line instead), which also stops an accidental double-add.
 */
export function PriceItemPicker({
  items,
  alreadyOnQuote,
  busy,
  onAdd,
}: {
  items: PriceItemRow[];
  alreadyOnQuote: ReadonlySet<string>;
  busy: boolean;
  /** Resolve true when the lines were added, so the ticks can be cleared. */
  onAdd: (lines: NewQuoteLine[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const active = items.filter((i) => i.active);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const setGroup = (kind: "once_off" | "monthly", on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds(active, kind, alreadyOnQuote)) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const toAdd = linesFromPriceItems(active, selected, alreadyOnQuote);

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted">
        No price list items yet. Add some on the Price list page, then come back.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (toAdd.length === 0) return;
        if (await onAdd(toAdd)) setSelected(new Set());
      }}
    >
      <h3 className="font-heading text-base font-semibold">Add from price list</h3>

      {GROUPS.map((g) => {
        const groupItems = active.filter((i) => i.kind === g.kind);
        if (groupItems.length === 0) return null;
        const ids = selectableIds(active, g.kind, alreadyOnQuote);
        const allTicked = ids.length > 0 && ids.every((id) => selected.has(id));
        return (
          <fieldset key={g.kind} className="rounded-md border border-border">
            <legend className="ml-3 px-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              {g.title}
            </legend>
            <div className="flex justify-end px-3 pt-1">
              <button
                type="button"
                className="text-xs underline disabled:no-underline disabled:opacity-40"
                disabled={ids.length === 0}
                onClick={() => setGroup(g.kind, !allTicked)}
              >
                {allTicked ? "Clear" : "Select all"}
              </button>
            </div>
            <ul className="divide-y divide-border">
              {groupItems.map((p) => {
                const added = alreadyOnQuote.has(p.id);
                return (
                  <li key={p.id}>
                    <label
                      className={`flex items-start gap-3 px-3 py-2 ${added ? "opacity-50" : "cursor-pointer hover:bg-bg"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={added}
                        checked={added || selected.has(p.id)}
                        onChange={(e) => toggle(p.id, e.target.checked)}
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{p.name}</span>
                        {p.description && (
                          <span className="block text-xs text-muted">{p.description}</span>
                        )}
                      </span>
                      <span className="whitespace-nowrap text-right font-mono text-sm">
                        {added ? (
                          <span className="font-sans text-xs text-muted">On this quote</span>
                        ) : (
                          <>
                            {formatCents(p.unit_price_cents)}
                            {p.kind === "monthly" ? (
                              <span className="text-xs text-muted"> /mo</span>
                            ) : null}
                          </>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={busy || toAdd.length === 0}>
          {busy
            ? "Adding…"
            : toAdd.length === 0
              ? "Add selected"
              : `Add ${toAdd.length} selected item${toAdd.length === 1 ? "" : "s"}`}
        </Button>
        <span className="text-xs text-muted" aria-live="polite">
          {toAdd.length === 0 ? "Tick one or more items above." : `${toAdd.length} ticked`}
        </span>
      </div>
    </form>
  );
}
