export type OrderStatus = "pending" | "paid" | "fulfilled" | "refunded" | "cancelled";

export type OrderItem = {
  productId: string;
  name: string;
  size: string;
  qty: number;
  price: number;
};

export type Order = {
  id: string;
  customer: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  date: string; // ISO
};

export const orders: Order[] = [
  {
    id: "FND-1042",
    customer: "Thandi Nkosi",
    items: [{ productId: "heritage-hoodie", name: "Heritage Hoodie", size: "M", qty: 1, price: 1290 }],
    total: 1365,
    status: "paid",
    date: "2026-05-15T09:14:00Z",
  },
  {
    id: "FND-1041",
    customer: "Liam van der Merwe",
    items: [
      { productId: "block-tee", name: "Block Tee", size: "L", qty: 2, price: 420 },
      { productId: "court-socks", name: "Court Socks", size: "L/XL", qty: 1, price: 120 },
    ],
    total: 1035,
    status: "fulfilled",
    date: "2026-05-14T16:02:00Z",
  },
  {
    id: "FND-1040",
    customer: "Aisha Patel",
    items: [{ productId: "stadium-jacket", name: "Stadium Jacket", size: "S", qty: 1, price: 2490 }],
    total: 2565,
    status: "pending",
    date: "2026-05-14T11:48:00Z",
  },
  {
    id: "FND-1039",
    customer: "Sipho Dlamini",
    items: [
      { productId: "court-cap", name: "Court Cap", size: "One Size", qty: 1, price: 380 },
      { productId: "studio-tote", name: "Studio Tote", size: "One Size", qty: 1, price: 540 },
    ],
    total: 995,
    status: "paid",
    date: "2026-05-13T19:21:00Z",
  },
  {
    id: "FND-1038",
    customer: "Megan Pillay",
    items: [{ productId: "watch-beanie", name: "Watch Beanie", size: "One Size", qty: 2, price: 290 }],
    total: 655,
    status: "refunded",
    date: "2026-05-12T08:55:00Z",
  },
  {
    id: "FND-1037",
    customer: "Kabelo Mokoena",
    items: [{ productId: "cargo-shorts", name: "Cargo Shorts", size: "32", qty: 1, price: 890 }],
    total: 965,
    status: "cancelled",
    date: "2026-05-11T14:10:00Z",
  },
];
