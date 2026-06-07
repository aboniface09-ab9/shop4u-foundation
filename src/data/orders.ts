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
 * Insert a new order at checkout.
 *
 * Notes on RLS-safety:
 * - The customer is anonymous (no auth) so we can't SELECT orders before
 *   or after the INSERT — the v1 RLS only lets authenticated merchants
 *   read orders. We therefore (a) generate the order_number client-side
 *   without counting, and (b) don't try to read back the inserted row.
 * - The returned Order is shaped from the input + the generated
 *   reference; the merchant admin will see the real row once they next
 *   load /admin/orders (which runs under their authenticated session).
 *
 * Future: when a server-side webhook receiver exists (Cloudflare Worker
 * with service-role key), order_number generation can move to a Postgres
 * sequence and the INSERT can use the service role to bypass RLS.
 */
export function useCreateOrder() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<Order> => {
      if (!tenantId) throw new Error("No tenant resolved");

      // Compact, sortable-ish reference that doesn't require a SELECT
      // to generate. e.g. "FND-LX2N9K". Collision-resistant in practice.
      const orderNumber = `FND-${Date.now().toString(36).toUpperCase()}`;

      const items: OrderItemJson[] = input.items.map((i) => ({
        product_slug: i.productSlug,
        name: i.name,
        size: i.size,
        qty: i.qty,
        price_cents: Math.round(i.price * 100),
      }));

      const { error } = await supabase
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
        });
      if (error) throw error;

      // Synthesize the Order from input — no read-back needed.
      return {
        id: orderNumber,
        customer: input.customerName,
        items: items.map((i) => ({
          productId: i.product_slug,
          name: i.name,
          size: i.size,
          qty: i.qty,
          price: i.price_cents / 100,
        })),
        total: input.total,
        status: "pending",
        date: new Date().toISOString(),
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders", tenantId] });
    },
  });
}
