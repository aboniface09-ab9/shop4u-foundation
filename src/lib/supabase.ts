import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — single instance shared across the app.
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local at
 * build time. If either is missing, fail loudly at startup rather than
 * silently making broken queries.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,        // merchant logins survive page refresh
    autoRefreshToken: true,      // refresh JWTs automatically before expiry
    detectSessionInUrl: false,   // we don't use OAuth redirects yet
  },
});

/**
 * The slug of the current tenant. Until multi-tenant hostname routing
 * lands (later iteration), the app resolves to a single tenant via this
 * env var. Set in .env.local — defaults to "foundry" for the demo brand.
 */
export const CURRENT_TENANT_SLUG =
  import.meta.env.VITE_TENANT_SLUG ?? "foundry";

// =========================================================================
// DB row types — mirror the Postgres schema exactly. App-level types
// (Product, Order) live in src/data/* and are mapped from these.
// =========================================================================

export type ThemePreset = "heritage" | "onyx" | "volt";
export type LayoutPreset = "boutique" | "catalogue" | "specialist";

export type TenantTheme = {
  preset?: ThemePreset;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  radius?: Record<string, number>;
};

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  store_name: string | null;
  logo_mark: string | null;
  custom_domain: string | null;
  plan: "starter" | "growth" | "pro";
  billing_state:
    | "trialing"
    | "active"
    | "past_due"
    | "soft_suspended"
    | "hard_suspended"
    | "churned"
    | "cancelled";
  trial_ends_at: string | null;
  theme: TenantTheme;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  currency: string;
  sizes: string[];
  stock: number;
  image_color: string | null;
  image_url: string | null;
  status: "active" | "draft" | "archived";
  created_at: string;
  updated_at: string;
};

export type OrderItemJson = {
  product_slug: string;
  name: string;
  size: string;
  qty: number;
  price_cents: number;
};

export type ShippingAddressJson = {
  line1: string;
  suburb: string;
  city: string;
  postal: string;
  province: string;
};

export type OrderRow = {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string | null;
  shipping_address: ShippingAddressJson;
  items: OrderItemJson[];
  subtotal_cents: number;
  shipping_cents: number;
  vat_cents: number;
  total_cents: number;
  currency: string;
  status: "pending" | "paid" | "fulfilled" | "refunded" | "cancelled";
  payment_reference: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
};
