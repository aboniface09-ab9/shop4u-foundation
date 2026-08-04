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
    persistSession: true, // merchant logins survive page refresh
    autoRefreshToken: true, // refresh JWTs automatically before expiry
    detectSessionInUrl: false, // we don't use OAuth redirects yet
  },
});

// =========================================================================
// DB row types — mirror the Postgres schema exactly. App-level types
// (Product, Order) live in src/data/* and are mapped from these.
// =========================================================================

export type ThemePreset = "heritage" | "onyx" | "volt";
export type LayoutPreset = "boutique" | "catalogue" | "specialist";

// Keys map 1:1 to the CSS custom properties defined per-preset in
// styles.css (onPrimary -> --on-primary). Any subset may be present —
// unset keys fall back to whatever the active preset already defines.
export type ThemeColorKey =
  | "bg"
  | "surface"
  | "text"
  | "muted"
  | "border"
  | "primary"
  | "onPrimary"
  | "accent";

export type ThemeColors = Partial<Record<ThemeColorKey, string>>;

export type TenantTheme = {
  preset?: ThemePreset;
  colors?: ThemeColors;
  fonts?: Record<string, string>;
  radius?: Record<string, number>;
};

export type TenantContent = {
  hero_eyebrow?: string;
  hero_headline?: string;
  hero_description?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;
  // Product slugs the merchant has chosen to rotate through in the
  // homepage hero (Admin → Settings → Homepage hero). Order in this array
  // is the rotation order. Empty/unset falls back to a single static
  // product (the old behaviour) rather than an arbitrary auto-pick, so a
  // merchant who's never touched this setting sees no surprise changes.
  hero_product_slugs?: string[];
  studio_headline?: string;
  studio_body?: string;
};

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  store_name: string | null;
  logo_mark: string | null;
  // Public URL of the merchant's uploaded logo image (Supabase Storage,
  // "tenant-logos" bucket). Null until they upload one — logo_mark (short
  // text wordmark) remains the fallback shown in its place.
  logo_url: string | null;
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
  content: TenantContent;
  // Not VAT-registered businesses can't legally charge VAT at all, so
  // this fully disables the VAT line rather than toggling inclusive/
  // exclusive display. Defaults to true (most merchants are registered
  // or will be once they cross the R1m turnover threshold).
  vat_registered: boolean;
  // International format, no leading + (e.g. "27795055741"). Falls back
  // to VITE_WHATSAPP_NUMBER if not set on the tenant.
  whatsapp_number: string | null;
  // Per-tenant scoping for the "Pay by card" checkout button. Deliberately
  // a plain public boolean on `tenants` (read via the anon client, same as
  // everything else here) — NOT the same thing as having real PayFast
  // credentials, which live in the separate, service-role-only
  // `tenant_payfast_config` table. Set this to true only after that config
  // row actually exists for the tenant; otherwise the button shows but
  // errors on click. Toggled manually via SQL for now (see
  // supabase-payfast-enabled-migration.sql) — no admin UI yet.
  payfast_enabled: boolean;
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
