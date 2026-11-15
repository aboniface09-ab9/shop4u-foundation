/**
 * Turns ticked price-list items into quote lines. Lines are COPIES of the price list at this moment,
 * so later price-list edits never change a quote. Items already on the quote are skipped (add a second
 * unit by raising the quantity on the existing line instead of duplicating it).
 */
export type PriceItemLike = {
  id: string;
  kind: "once_off" | "monthly";
  name: string;
  description: string;
  unit_price_cents: number;
  sort_order: number;
  active: boolean;
};

export type NewQuoteLine = {
  kind: "once_off" | "monthly";
  name: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  price_item_id: string;
  sort_order: number;
};

export function linesFromPriceItems(
  items: PriceItemLike[],
  selectedIds: ReadonlySet<string>,
  alreadyOnQuote: ReadonlySet<string>,
): NewQuoteLine[] {
  return items
    .filter((i) => i.active && selectedIds.has(i.id) && !alreadyOnQuote.has(i.id))
    .sort((a, b) =>
      a.kind === b.kind ? a.sort_order - b.sort_order : a.kind === "once_off" ? -1 : 1,
    )
    .map((i) => ({
      kind: i.kind,
      name: i.name,
      description: i.description,
      quantity: 1,
      unit_price_cents: i.unit_price_cents,
      price_item_id: i.id,
      sort_order: i.sort_order,
    }));
}

/** Ids a "Select all" in one group should tick: active items not already on the quote. */
export function selectableIds(
  items: PriceItemLike[],
  kind: PriceItemLike["kind"],
  alreadyOnQuote: ReadonlySet<string>,
): string[] {
  return items
    .filter((i) => i.active && i.kind === kind && !alreadyOnQuote.has(i.id))
    .map((i) => i.id);
}
