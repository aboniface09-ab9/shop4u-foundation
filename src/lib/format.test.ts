import { describe, expect, it } from "vitest";
import { formatZAR } from "./format";

describe("formatZAR", () => {
  it("formats whole rand amounts with the R symbol", () => {
    const out = formatZAR(22500).replace(/\s/g, "");
    expect(out).toContain("R22");
    expect(out).toContain("500");
  });
});
