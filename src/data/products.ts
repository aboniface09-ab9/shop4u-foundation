import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase, type ProductRow } from "@/lib/supabase";
import { useTenantId } from "@/store/tenant";

// =========================================================================
// App-level Product type. Kept identical to what the rest of the app
// already uses, so consumers don't need to change anything except their
// data source. Prices stay in ZAR rand (not cents) at the app boundary;
// the mapper below converts from the DB's price_cents.
// =========================================================================

/** Dynamic — stored per-tenant in the categories table. String alias kept for compatibility. */
export type ProductCategory = string;

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number; // ZAR
  description: string;
  sizes: string[];
  stock: number;
  imageColor: string; // hex — drives gradient placeholder
  imageUrl: string | null; // real product photo from Supabase Storage
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
    imageUrl: row.image_url ?? null,
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

// =========================================================================
// Mutations
// =========================================================================

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export type CreateProductInput = {
  name: string;
  description: string;
  category: ProductCategory;
  priceCents: number;
  sizes: string[];
  stock: number;
  imageColor: string;
  imageUrl?: string | null;
};

export type UpdateProductInput = Partial<Omit<CreateProductInput, "name">> & {
  slug: string;
  name?: string;
  imageUrl?: string | null;
};

/** Insert a new product for the current tenant. */
export function useCreateProduct() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      if (!tenantId) throw new Error("No tenant resolved");
      const { error } = await supabase.from("products").insert({
        tenant_id: tenantId,
        slug: slugify(input.name),
        name: input.name,
        description: input.description || null,
        category: input.category,
        price_cents: input.priceCents,
        currency: "ZAR",
        sizes: input.sizes,
        stock: input.stock,
        image_color: input.imageColor || null,
        image_url: input.imageUrl ?? null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", tenantId] });
    },
  });
}

/** Update an existing product by slug. */
export function useUpdateProduct() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, ...input }: UpdateProductInput) => {
      if (!tenantId) throw new Error("No tenant resolved");
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description || null;
      if (input.category !== undefined) updates.category = input.category;
      if (input.priceCents !== undefined) updates.price_cents = input.priceCents;
      if (input.sizes !== undefined) updates.sizes = input.sizes;
      if (input.stock !== undefined) updates.stock = input.stock;
      if (input.imageColor !== undefined) updates.image_color = input.imageColor || null;
      if (input.imageUrl !== undefined) updates.image_url = input.imageUrl ?? null;
      const { error } = await supabase
        .from("products")
        .update(updates)
        .eq("tenant_id", tenantId)
        .eq("slug", slug);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", tenantId] });
    },
  });
}

/** Archive (soft-delete) a product so it no longer appears on the storefront. */
export function useArchiveProduct() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      if (!tenantId) throw new Error("No tenant resolved");
      const { error } = await supabase
        .from("products")
        .update({ status: "archived" })
        .eq("tenant_id", tenantId)
        .eq("slug", slug);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", tenantId] });
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
