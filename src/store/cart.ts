import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  id: string; // productId
  name: string;
  size: string;
  qty: number;
  price: number;
  imageColor: string;
  imageUrl?: string | null;
  category: string;
};

type CartState = {
  items: CartItem[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  add: (item: CartItem) => void;
  remove: (id: string, size: string) => void;
  setQty: (id: string, size: string, qty: number) => void;
  clear: () => void;
  subtotal: () => number;
  count: () => number;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      add: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.id === item.id && i.size === item.size);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i === existing ? { ...i, qty: i.qty + item.qty } : i,
              ),
              isOpen: true,
            };
          }
          return { items: [...s.items, item], isOpen: true };
        }),
      remove: (id, size) =>
        set((s) => ({ items: s.items.filter((i) => !(i.id === id && i.size === size)) })),
      setQty: (id, size, qty) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.id === id && i.size === size ? { ...i, qty: Math.max(0, qty) } : i))
            .filter((i) => i.qty > 0),
        })),
      clear: () => set({ items: [] }),
      subtotal: () => get().items.reduce((acc, i) => acc + i.price * i.qty, 0),
      count: () => get().items.reduce((acc, i) => acc + i.qty, 0),
    }),
    { name: "youcommerce-cart", partialize: (s) => ({ items: s.items }) },
  ),
);

export const VAT_RATE = 0.15;

/**
 * Order totals — VAT-inclusive by default.
 *
 * Listed product prices already include VAT (the SA retail convention:
 * the sticker price is what the customer pays). VAT is never added on
 * top at checkout — it's only ever *extracted* from the inclusive total
 * for display/record-keeping, using total × rate / (1 + rate).
 *
 * If the tenant isn't VAT-registered, they can't legally charge VAT at
 * all: `vatRegistered = false` skips the VAT line entirely and the
 * listed price is simply the price, full stop.
 */
export function calcOrderTotals(
  subtotal: number,
  shipping: number,
  vatRegistered: boolean,
) {
  const total = subtotal + shipping; // already inclusive — no add-on
  const vat = vatRegistered ? Math.round(total * (VAT_RATE / (1 + VAT_RATE))) : 0;
  return { subtotal, shipping, vat, total };
}
