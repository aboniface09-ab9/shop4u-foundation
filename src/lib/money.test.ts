import { describe, expect, it } from "vitest";
import { computeTotals, formatCents, percentOfCents, type MoneyLine } from "./money";

const once = (cents: number): MoneyLine => ({ kind: "once_off", quantity: 1, unit_price_cents: cents });
const monthly = (cents: number): MoneyLine => ({ kind: "monthly", quantity: 1, unit_price_cents: cents });

// The Ultra Fish Traders quote (fictional-safe: amounts only), ex VAT.
const ufo: MoneyLine[] = [
  once(250000), once(500000), once(800000), once(150000), once(200000), once(200000), once(150000),
  monthly(25000), monthly(25000), monthly(25000),
];

describe("computeTotals: Ultra Fish quote, no VAT", () => {
  const t = computeTotals(ufo, { depositPercent: 50, vatRateBps: 0 });
  it("matches the quote document", () => {
    expect(t.onceOffCents).toBe(2_250_000); // R22,500
    expect(t.monthlyCents).toBe(75_000); // R750
    expect(t.depositCents).toBe(1_125_000); // R11,250
    expect(t.balanceCents).toBe(1_125_000); // R11,250
    expect(t.firstYearCents).toBe(3_150_000); // R31,500
  });
  it("adds no VAT", () => {
    expect(t.vat).toEqual({ onceOff: 0, deposit: 0, balance: 0, monthly: 0 });
    expect(t.incl.deposit).toBe(t.depositCents);
  });
});

describe("computeTotals: 15% VAT", () => {
  const t = computeTotals(ufo, { depositPercent: 50, vatRateBps: 1500 });
  it("adds VAT on top of ex-VAT prices", () => {
    expect(t.incl.deposit).toBe(1_293_750); // R12,937.50
    expect(t.incl.monthly).toBe(86_250); // R862.50
    expect(t.incl.onceOff).toBe(2_587_500);
  });
  it("deposit VAT + balance VAT equals once-off VAT exactly", () => {
    expect(t.vat.deposit + t.vat.balance).toBe(t.vat.onceOff);
  });
});

describe("rounding and edge cases", () => {
  it("rounds half up on odd amounts and keeps deposit + balance = total", () => {
    const t = computeTotals([once(100_001)], { depositPercent: 50, vatRateBps: 0 });
    expect(t.depositCents + t.balanceCents).toBe(100_001);
    expect(percentOfCents(1, 5000)).toBe(1);
  });
  it("handles no lines and 0% / 100% deposit", () => {
    expect(computeTotals([], { depositPercent: 50, vatRateBps: 0 }).firstYearCents).toBe(0);
    expect(computeTotals([once(1000)], { depositPercent: 0, vatRateBps: 0 }).depositCents).toBe(0);
    expect(computeTotals([once(1000)], { depositPercent: 100, vatRateBps: 0 }).balanceCents).toBe(0);
  });
  it("multiplies by quantity", () => {
    const t = computeTotals([{ kind: "once_off", quantity: 3, unit_price_cents: 1500 }], { depositPercent: 50, vatRateBps: 0 });
    expect(t.onceOffCents).toBe(4500);
  });
  it("formats rand with cents", () => {
    expect(formatCents(2_250_000).replace(/\s/g, "")).toMatch(/^R22500[,.]00$/);
  });
});
