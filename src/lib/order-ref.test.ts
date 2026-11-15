import { describe, expect, it } from "vitest";

import { generateOrderRef, ORDER_REF_PATTERN } from "./order-ref";

describe("generateOrderRef", () => {
  it("has the expected shape and avoids look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const ref = generateOrderRef();
      expect(ref).toMatch(ORDER_REF_PATTERN);
      expect(ref.slice(4)).not.toMatch(/[01OI]/);
    }
  });
  it("does not repeat across a large sample (60 random bits)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateOrderRef());
    expect(seen.size).toBe(5000);
  });
  it("is not derived from the clock", () => {
    const a = generateOrderRef();
    const b = generateOrderRef();
    expect(a).not.toBe(b);
  });
  it("maps bytes evenly and honours a custom prefix (deterministic input)", () => {
    const fixed = (n: number) => new Uint8Array(n).fill(32); // 32 % 32 = 0 -> first letter
    expect(generateOrderRef("ABC", fixed)).toBe("ABC-AAAAAAAAAAAA");
    const last = (n: number) => new Uint8Array(n).fill(255); // 255 % 32 = 31 -> last letter
    expect(generateOrderRef("ABC", last)).toBe("ABC-999999999999");
  });
});
