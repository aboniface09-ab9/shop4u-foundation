import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  id: string; // productId
  name: string;
  size: string;
  qty: number;
  price: number;
  imageColor: string;
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
    { name: "shop4u-cart", partialize: (s) => ({ items: s.items }) },
  ),
);

export const SHIPPING_FLAT = 75;
export const VAT_RATE = 0.15;
