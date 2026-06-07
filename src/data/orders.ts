import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  supabase,
  type OrderItemJson,
  type OrderRow,
  type ShippingAddressJson,
} from "@/lib/supabase";
import { useTenantId } from "@/store/tenant";

// =========================================================================
// App-level Order type — same shape the existing components already
// consume. Prices stay in ZAR rand; mapper converts from DB cents.
// =========================================================================

export type OrderStatus =
  | "pending"
  | "paid"
  | "fulfilled"
  | "refunded"
  | "cancelled";

export type OrderItem = {
  productId: string;
  name: string;
  size: string;
  qty: number;
  price: number;
};

export type Order = {
  id: string; // order_number, e.g. "FND-1042"
  customer: string;
  items: OrderItem[];
  total: number; // ZAR
  status: OrderStatus;
  date: string; // ISO timestamp from created_at
};

function mapOrder(row: OrderRow): Order {
  return {
    id: row.order_number,
    customer: row.customer_name,
    items: (row.items ?? []).map((i) => ({
      productId: i.product_slug,
      name: i.name,
      size: i.size,
      qty: i.qty,
      price: i.price_cents / 100,
    })),
    total: row.total_cents / 100,
    status: row.status,
    date: row.created_at,
  };
}

// =========================================================================
// Hooks
// =========================================================================

/** All orders for the current tenant, newest first. */
export function useOrders() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["orders", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as OrderRow[]).map(mapOrder);
    },
  });
}

// =========================================================================
// Mutations
// =========================================================================

export type CreateOrderInput = {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress: ShippingAddressJson;
  items: { productSlug: string; name: string; size: string; qty: number; price: number }[];
  subtotal: number;
  shipping: number;
  vat: number;
  total: number;
};

/**
 * Insert a new order. The order_number is computed on the client as
 * "FND-" + (1042 + existing count). Good enough for v1; switch to a
 * Postgres sequence when concurrency matters.
 */
export function useCreateOrder() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<Order> => {
      if (!tenantId) throw new Error("No tenant resolved");

      // Compute order_number from current count.
      const { count, error: countError } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (countError) throw countError;
      const orderNumber = `FND-${1042 + (count ?? 0)}`;

      const items: OrderItemJson[] = input.items.map((i) => ({
        product_slug: i.productSlug,
        name: i.name,
        size: i.size,
        qty: i.qty,
        price_cents: Math.round(i.price * 100),
      }));

      const { data, error } = await supabase
        .from("orders")
        .insert({
          tenant_id: tenantId,
          order_number: orderNumber,
          customer_name: input.customerName,
          customer_email: input.customerEmail,
          customer_phone: input.customerPhone ?? null,
          shipping_address: input.shippingAddress,
          items,
          subtotal_cents: Math.round(input.subtotal * 100),
          shipping_cents: Math.round(input.shipping * 100),
          vat_cents: Math.round(input.vat * 100),
          total_cents: Math.round(input.total * 100),
          status: "pending",
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapOrder(data as OrderRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders", tenantId] });
    },
  });
}
