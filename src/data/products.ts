export type ProductCategory = "Tops" | "Bottoms" | "Headwear" | "Accessories";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number; // ZAR
  description: string;
  sizes: string[];
  stock: number;
  imageColor: string; // hex — drives gradient placeholder
};

export const products: Product[] = [
  {
    id: "heritage-hoodie",
    name: "Heritage Hoodie",
    category: "Tops",
    price: 1290,
    description:
      "Heavyweight 400gsm loopback cotton, boxy cut, garment-dyed in small batches at our Salt River workshop.",
    sizes: ["S", "M", "L", "XL"],
    stock: 24,
    imageColor: "#C25E2B",
  },
  {
    id: "block-tee",
    name: "Block Tee",
    category: "Tops",
    price: 420,
    description:
      "Mid-weight 240gsm jersey with a dropped shoulder and ribbed crew. The everyday Foundry staple.",
    sizes: ["XS", "S", "M", "L", "XL"],
    stock: 62,
    imageColor: "#1A1714",
  },
  {
    id: "court-cap",
    name: "Court Cap",
    category: "Headwear",
    price: 380,
    description: "Six-panel unstructured cap in washed cotton twill. Brass buckle strap.",
    sizes: ["One Size"],
    stock: 41,
    imageColor: "#2D4A3E",
  },
  {
    id: "cargo-shorts",
    name: "Cargo Shorts",
    category: "Bottoms",
    price: 890,
    description: "Relaxed mid-length cargo cut from washed ripstop. Six pockets, taped seams.",
    sizes: ["28", "30", "32", "34", "36"],
    stock: 18,
    imageColor: "#8A6F4A",
  },
  {
    id: "stadium-jacket",
    name: "Stadium Jacket",
    category: "Tops",
    price: 2490,
    description: "Bonded wool-blend body, leather sleeves, ribbed cuffs. Snap front, lined.",
    sizes: ["S", "M", "L", "XL"],
    stock: 6,
    imageColor: "#3B2A1F",
  },
  {
    id: "studio-tote",
    name: "Studio Tote",
    category: "Accessories",
    price: 540,
    description: "20L waxed canvas tote with leather grips. Built to outlast the season.",
    sizes: ["One Size"],
    stock: 33,
    imageColor: "#D9C7A6",
  },
  {
    id: "court-socks",
    name: "Court Socks",
    category: "Accessories",
    price: 120,
    description: "Combed cotton crew socks with terry footbed. Pack of two.",
    sizes: ["S/M", "L/XL"],
    stock: 88,
    imageColor: "#E7E1D6",
  },
  {
    id: "watch-beanie",
    name: "Watch Beanie",
    category: "Headwear",
    price: 290,
    description: "Fine-gauge merino watch cap. Folded cuff, woven Foundry label.",
    sizes: ["One Size"],
    stock: 4,
    imageColor: "#0E0E0F",
  },
];

export const getProduct = (id: string) => products.find((p) => p.id === id);
