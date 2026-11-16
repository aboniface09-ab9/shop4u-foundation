import { describe, expect, it } from "vitest";
import { computeTotals, formatCents, percentOfCents, type MoneyLine } from "./money";

const once = (cents: number): MoneyLine => ({
  kind: "once_off",
  quantity: 1,
  unit_price_cents: cents,
});
const monthly = (cents: number): MoneyLine => ({
  kind: "monthly",
  quantity: 1,
  unit_price_cents: cents,
});

// The Ultra Fish Traders quote (fictional-safe: amounts only), ex VAT.
const ufo: MoneyLine[] = [
  once(250000),
  once(500000),
  once(800000),
  once(150000),
  once(200000),
  once(200000),
  once(150000),
  monthly(25000),
  monthly(25000),
  monthly(25000),
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
    expect(computeTotals([once(1000)], { depositPercent: 100, vatRateBps: 0 }).balanceCents).toBe(
      0,
    );
  });
  it("multiplies by quantity", () => {
    const t = computeTotals([{ kind: "once_off", quantity: 3, unit_price_cents: 1500 }], {
      depositPercent: 50,
      vatRateBps: 0,
    });
    expect(t.onceOffCents).toBe(4500);
  });
  it("formats rand with cents", () => {
    expect(formatCents(2_250_000).replace(/\s/g, "")).toMatch(/^R22500[,.]00$/);
  });
});

describe("computeTotals: discount on the once-off build", () => {
  const withDiscount = (discountPercent: number, vatRateBps = 0, depositPercent = 50) =>
    computeTotals(ufo, { depositPercent, vatRateBps, discountPercent });

  it("15% off the Ultra Fish quote: R22,500 becomes R19,125, deposit and balance R9,562.50 each", () => {
    const t = withDiscount(15);
    expect(t.onceOffCents).toBe(2_250_000); // before discount, unchanged
    expect(t.discountCents).toBe(337_500); // R3,375
    expect(t.onceOffNetCents).toBe(1_912_500); // R19,125
    expect(t.depositCents).toBe(956_250); // R9,562.50
    expect(t.balanceCents).toBe(956_250); // R9,562.50
    expect(t.firstYearCents).toBe(2_812_500); // R19,125 + 12 x R750 = R28,125
  });

  it("never discounts the monthly fee", () => {
    expect(withDiscount(15).monthlyCents).toBe(75_000);
    expect(withDiscount(100).monthlyCents).toBe(75_000);
    expect(withDiscount(100).onceOffNetCents).toBe(0);
    expect(withDiscount(100).firstYearCents).toBe(900_000); // 12 x R750 only
  });

  it("0% (and no discount supplied at all) behaves exactly as before", () => {
    const none = computeTotals(ufo, { depositPercent: 50, vatRateBps: 0 });
    const zero = withDiscount(0);
    expect(zero).toEqual(none);
    expect(none.discountCents).toBe(0);
    expect(none.onceOffNetCents).toBe(none.onceOffCents);
  });

  it("deposit + balance always equals the discounted once-off total, even with awkward cents", () => {
    for (const pct of [1, 3, 7, 12, 15, 33, 50, 99]) {
      const t = computeTotals([once(100_001), monthly(33_333)], {
        depositPercent: 50,
        vatRateBps: 0,
        discountPercent: pct,
      });
      expect(t.depositCents + t.balanceCents, `${pct}%`).toBe(t.onceOffNetCents);
      expect(t.onceOffCents - t.discountCents, `${pct}%`).toBe(t.onceOffNetCents);
    }
  });

  it("charges VAT on the discounted amounts, and the VAT split still adds up exactly", () => {
    const t = withDiscount(15, 1500);
    expect(t.vat.onceOff).toBe(286_875); // 15% of R19,125 = R2,868.75
    expect(t.vat.deposit + t.vat.balance).toBe(t.vat.onceOff);
    expect(t.incl.onceOff).toBe(1_912_500 + 286_875);
    expect(t.incl.deposit + t.incl.balance).toBe(t.incl.onceOff);
  });

  it("matches the database rounding (half up on the discount itself)", () => {
    // 15% of R1,000.01 = 15000.15 cents -> 15000; 15% of 100,003 cents = 15000.45 -> 15000; of 100,004 = 15000.6 -> 15001
    expect(
      computeTotals([once(100_001)], { depositPercent: 50, vatRateBps: 0, discountPercent: 15 })
        .discountCents,
    ).toBe(15_000);
    expect(
      computeTotals([once(100_004)], { depositPercent: 50, vatRateBps: 0, discountPercent: 15 })
        .discountCents,
    ).toBe(15_001);
  });
});
