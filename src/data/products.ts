import { useQuery } from "@tanstack/react-query";

import { supabase, type ProductRow } from "@/lib/supabase";
import { useTenantId } from "@/store/tenant";

// =========================================================================
// App-level Product type. Kept identical to what the rest of the app
// already uses, so consumers don't need to change anything except their
// data source. Prices stay in ZAR rand (not cents) at the app boundary;
// the mapper below converts from the DB's price_cents.
// =========================================================================

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

function mapProduct(row: ProductRow): Product {
  return {
    id: row.slug, // app addresses products by slug ("heritage-hoodie"), not uuid
    name: row.name,
    category: row.category as ProductCategory,
    price: row.price_cents / 100,
    description: row.description ?? "",
    sizes: row.sizes ?? [],
    stock: row.stock,
    imageColor: row.image_color ?? "#1A1714",
  };
}

// =========================================================================
// Hooks
// =========================================================================

/** All active products for the current tenant. */
export function useProducts() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["products", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data as ProductRow[]).map(mapProduct);
    },
  });
}

/** A single product by slug (the app-level id). */
export function useProduct(id: string | undefined) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["product", tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("slug", id!)
        .maybeSingle();
      if (error) throw error;
      return data ? mapProduct(data as ProductRow) : null;
    },
  });
}
