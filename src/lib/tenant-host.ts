/**
 * Resolves the tenant slug from a hostname string (pure, no framework imports
 * so it can be unit tested).
 *
 *  - onex.youcommerce.co.za   → "onex"
 *  - youcommerce.co.za / www. → VITE_TENANT_SLUG fallback (platform apex)
 *  - portal.youcommerce.co.za → fallback (reserved: operator dashboard, client links)
 *  - localhost / 127.*        → fallback (local dev)
 */
export const RESERVED_SUBDOMAINS = new Set(["www", "portal", "app", "api", "admin", "mail"]);

export function resolveTenantSlug(host: string): string {
  const fallback = import.meta.env.VITE_TENANT_SLUG ?? "foundry";

  // Strip port (e.g. localhost:3000 → localhost)
  const hostname = host.split(":")[0].toLowerCase();

  if (hostname === "youcommerce.co.za" || hostname === "localhost" || hostname.startsWith("127.")) {
    return fallback;
  }

  const parts = hostname.split(".");
  if (parts.length >= 4 && !RESERVED_SUBDOMAINS.has(parts[0])) {
    return parts[0];
  }

  return fallback;
}
