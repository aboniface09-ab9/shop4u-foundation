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
  onceOffCents: number;
  monthlyCents: number;
  depositCents: number;
  balanceCents: number;
  firstYearCents: number; // once-off + 12 months, ex VAT
  vat: { onceOff: number; deposit: number; balance: number; monthly: number };
  incl: { onceOff: number; deposit: number; balance: number; monthly: number; firstYear: number };
};

export function computeTotals(
  lines: MoneyLine[],
  opts: { depositPercent: number; vatRateBps: number },
): QuoteTotals {
  const sum = (kind: MoneyLine["kind"]) =>
    lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + lineTotalCents(l), 0);

  const onceOffCents = sum("once_off");
  const monthlyCents = sum("monthly");
  const depositCents = percentOfCents(onceOffCents, opts.depositPercent * 100);
  const balanceCents = onceOffCents - depositCents;
  const firstYearCents = onceOffCents + 12 * monthlyCents;

  // VAT on the whole once-off, split so deposit VAT + balance VAT = once-off VAT exactly.
  const vatOnceOff = percentOfCents(onceOffCents, opts.vatRateBps);
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
    monthlyCents,
    depositCents,
    balanceCents,
    firstYearCents,
    vat,
    incl: {
      onceOff: onceOffCents + vat.onceOff,
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
