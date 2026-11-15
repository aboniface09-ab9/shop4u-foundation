import { describe, expect, it } from "vitest";

import { linesFromPriceItems, selectableIds, type PriceItemLike } from "./quote-lines";

const item = (
  id: string,
  kind: "once_off" | "monthly",
  sort: number,
  cents: number,
  active = true,
): PriceItemLike => ({
  id,
  kind,
  name: `Item ${id}`,
  description: `About ${id}`,
  unit_price_cents: cents,
  sort_order: sort,
  active,
});

const list = [
  item("hosting", "monthly", 110, 25000),
  item("design", "once_off", 20, 500000),
  item("build", "once_off", 30, 800000),
  item("old", "once_off", 40, 100000, false),
  item("discovery", "once_off", 10, 250000),
];

describe("linesFromPriceItems", () => {
  it("copies every ticked item in one go, once-off first, each group in price-list order", () => {
    const out = linesFromPriceItems(
      list,
      new Set(["hosting", "build", "design", "discovery"]),
      new Set(),
    );
    expect(out.map((l) => l.price_item_id)).toEqual(["discovery", "design", "build", "hosting"]);
    expect(out.every((l) => l.quantity === 1)).toBe(true);
  });
  it("copies name, description, price and kind so later price-list edits cannot change the quote", () => {
    const [l] = linesFromPriceItems(list, new Set(["design"]), new Set());
    expect(l).toEqual({
      kind: "once_off",
      name: "Item design",
      description: "About design",
      quantity: 1,
      unit_price_cents: 500000,
      price_item_id: "design",
      sort_order: 20,
    });
  });
  it("skips items already on the quote and inactive items, even if ticked", () => {
    const out = linesFromPriceItems(list, new Set(["design", "build", "old"]), new Set(["design"]));
    expect(out.map((l) => l.price_item_id)).toEqual(["build"]);
  });
  it("returns nothing when nothing is ticked", () => {
    expect(linesFromPriceItems(list, new Set(), new Set())).toEqual([]);
  });
  it("ignores ids that are not in the price list", () => {
    expect(linesFromPriceItems(list, new Set(["nope"]), new Set())).toEqual([]);
  });
});

describe("selectableIds", () => {
  it("returns active, not-yet-added items of one kind", () => {
    expect(selectableIds(list, "once_off", new Set(["design"]))).toEqual(["build", "discovery"]);
    expect(selectableIds(list, "monthly", new Set())).toEqual(["hosting"]);
  });
  it("is empty when everything in the group is already on the quote", () => {
    expect(selectableIds(list, "monthly", new Set(["hosting"]))).toEqual([]);
  });
});
