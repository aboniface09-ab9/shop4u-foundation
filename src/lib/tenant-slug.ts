import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Resolves the tenant slug from a hostname string.
 *
 * Rules:
 *  - onex.youcommerce.co.za  → "onex"
 *  - qbear.youcommerce.co.za → "qbear"
 *  - youcommerce.co.za       → VITE_TENANT_SLUG fallback (platform apex)
 *  - www.youcommerce.co.za   → VITE_TENANT_SLUG fallback
 *  - localhost / 127.*       → VITE_TENANT_SLUG fallback (local dev)
 *
 * The fallback is useful during local development — set VITE_TENANT_SLUG
 * in .env.local to whichever tenant you're working on.
 */
export function resolveTenantSlug(host: string): string {
  const fallback = import.meta.env.VITE_TENANT_SLUG ?? "foundry";

  // Strip port (e.g. localhost:3000 → localhost)
  const hostname = host.split(":")[0];

  const APEX_HOSTNAMES = new Set([
    "youcommerce.co.za",
    "www.youcommerce.co.za",
  ]);

  if (
    APEX_HOSTNAMES.has(hostname) ||
    hostname === "localhost" ||
    hostname.startsWith("127.")
  ) {
    return fallback;
  }

  // onex.youcommerce.co.za → ["onex", "youcommerce", "co", "za"] → "onex"
  const parts = hostname.split(".");
  if (parts.length >= 4) {
    return parts[0];
  }

  return fallback;
}

/**
 * Server function — reads the Host header from the live request and
 * returns the resolved tenant slug. Call this from the root route loader
 * so every SSR render knows which merchant's storefront to show.
 */
export const getTenantSlugFromHost = createServerFn({ method: "GET" }).handler(
  () => {
    const request = getRequest();
    // Use the full request URL to extract the hostname — more reliable on
    // Cloudflare Workers than header-based helpers.
    const hostname = request ? new URL(request.url).hostname : "";
    return resolveTenantSlug(hostname);
  },
);
