import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export { resolveTenantSlug } from "./tenant-host";
import { resolveTenantSlug } from "./tenant-host";

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
