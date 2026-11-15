import { describe, expect, it } from "vitest";
import { resolveTenantSlug } from "./tenant-host";

const fallback = import.meta.env.VITE_TENANT_SLUG ?? "foundry";

describe("resolveTenantSlug", () => {
  it("resolves merchant subdomains", () => {
    expect(resolveTenantSlug("onex.youcommerce.co.za")).toBe("onex");
    expect(resolveTenantSlug("Onex.YouCommerce.co.za:443")).toBe("onex");
  });
  it("falls back for apex, www, localhost", () => {
    expect(resolveTenantSlug("youcommerce.co.za")).toBe(fallback);
    expect(resolveTenantSlug("www.youcommerce.co.za")).toBe(fallback);
    expect(resolveTenantSlug("localhost:8080")).toBe(fallback);
  });
  it("never treats reserved subdomains as a tenant", () => {
    expect(resolveTenantSlug("portal.youcommerce.co.za")).toBe(fallback);
    expect(resolveTenantSlug("api.youcommerce.co.za")).toBe(fallback);
  });
});
