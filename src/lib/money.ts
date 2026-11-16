/**
 * Money maths for quotes and invoices. Everything is integer cents; no floats
 * touch a stored amount. Prices on lines are EX VAT; VAT (if any) is added on top.
 */
export type MoneyLine = {
  kind: "once_off" | "monthly";
  quantity: number;
  unit_price_cents: number;
};

export const lineTotalCents = (l: Pick<MoneyLine, "quantity" | "unit_price_cents">) =>
  l.quantity * l.unit_price_cents;

/** amount × bps/10000, rounded half up, in integers. */
export function percentOfCents(amountCents: number, basisPoints: number): number {
  return Math.floor((amountCents * basisPoints + 5000) / 10000);
}

export type QuoteTotals = {
  /** Once-off build BEFORE any discount (the sum of the once-off lines). */
  onceOffCents: number;
  /** The discount taken off the once-off build (0 when there is none). Never applies to the monthly fee. */
  discountCents: number;
  /** Once-off build AFTER the discount: the amount the deposit, balance, VAT and first-year total are based on. */
  onceOffNetCents: number;
  monthlyCents: number;
  depositCents: number;
  balanceCents: number;
  firstYearCents: number; // once-off (after discount) + 12 months, ex VAT
  vat: { onceOff: number; deposit: number; balance: number; monthly: number };
  incl: { onceOff: number; deposit: number; balance: number; monthly: number; firstYear: number };
};

export function computeTotals(
  lines: MoneyLine[],
  opts: { depositPercent: number; vatRateBps: number; discountPercent?: number },
): QuoteTotals {
  const sum = (kind: MoneyLine["kind"]) =>
    lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + lineTotalCents(l), 0);

  const onceOffCents = sum("once_off");
  const monthlyCents = sum("monthly");

  // The discount comes off the once-off build first; the deposit split and VAT work on what is left.
  // (Mirrors the database: see migration 20261115000009_quote_discount.sql.)
  const discountCents = percentOfCents(onceOffCents, (opts.discountPercent ?? 0) * 100);
  const onceOffNetCents = onceOffCents - discountCents;

  const depositCents = percentOfCents(onceOffNetCents, opts.depositPercent * 100);
  const balanceCents = onceOffNetCents - depositCents;
  const firstYearCents = onceOffNetCents + 12 * monthlyCents;

  // VAT on the whole discounted once-off, split so deposit VAT + balance VAT = once-off VAT exactly.
  const vatOnceOff = percentOfCents(onceOffNetCents, opts.vatRateBps);
  const vatDeposit = percentOfCents(depositCents, opts.vatRateBps);
  const vatMonthly = percentOfCents(monthlyCents, opts.vatRateBps);
  const vat = {
    onceOff: vatOnceOff,
    deposit: vatDeposit,
    balance: vatOnceOff - vatDeposit,
    monthly: vatMonthly,
  };

  return {
    onceOffCents,
    discountCents,
    onceOffNetCents,
    monthlyCents,
    depositCents,
    balanceCents,
    firstYearCents,
    vat,
    incl: {
      onceOff: onceOffNetCents + vat.onceOff,
      deposit: depositCents + vat.deposit,
      balance: balanceCents + vat.balance,
      monthly: monthlyCents + vat.monthly,
      firstYear: firstYearCents + vat.onceOff + 12 * vat.monthly,
    },
  };
}

const zarWithCents = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
/** 2250000 → "R 22 500,00" (locale formatting; non-breaking spaces). */
export const formatCents = (cents: number) => zarWithCents.format(cents / 100);
