// South African Rand formatter — used everywhere prices are displayed.
const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

export const formatZAR = (n: number) => zar.format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
