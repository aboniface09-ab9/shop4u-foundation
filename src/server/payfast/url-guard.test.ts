import { describe, expect, it } from "vitest";
import { isSameOriginUrl } from "./url-guard";

const req = "https://example-store.youcommerce.co.za/api/payment/payfast/checkout-fields";

describe("isSameOriginUrl", () => {
  it("accepts URLs on the same origin", () => {
    expect(isSameOriginUrl("https://example-store.youcommerce.co.za/order/ABC", req)).toBe(true);
  });
  it("rejects other hosts, lookalikes, schemes and garbage", () => {
    expect(isSameOriginUrl("https://evil.example.com/order/ABC", req)).toBe(false);
    expect(isSameOriginUrl("https://example-store.youcommerce.co.za.evil.com/", req)).toBe(false);
    expect(isSameOriginUrl("javascript:alert(1)", req)).toBe(false);
    expect(isSameOriginUrl("/relative", req)).toBe(false);
    expect(isSameOriginUrl("", req)).toBe(false);
  });
});
