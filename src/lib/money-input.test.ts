import { describe, expect, it } from "vitest";
import { centsToRandInput, randToCents } from "./money-input";

describe("randToCents", () => {
  it("converts valid rand amounts exactly", () => {
    expect(randToCents("250")).toBe(25000);
    expect(randToCents("250.5")).toBe(25050);
    expect(randToCents(" 11 250.00 ")).toBe(1125000);
    expect(randToCents("0.07")).toBe(7);
  });
  it("returns null for blank and undefined for invalid", () => {
    expect(randToCents("")).toBeNull();
    for (const bad of ["abc", "-5", "1.234", "R250", "1e3"]) expect(randToCents(bad)).toBeUndefined();
  });
  it("round-trips for display", () => {
    expect(centsToRandInput(75000)).toBe("750.00");
    expect(centsToRandInput(null)).toBe("");
  });
});
