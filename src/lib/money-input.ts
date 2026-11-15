/** Rand text ("250" or "250.50") to integer cents. Empty → null. Invalid → undefined. */
export function randToCents(input: string): number | null | undefined {
  const v = input.trim().replace(/\s/g, "");
  if (v === "") return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) return undefined;
  const [rand, cents = ""] = v.split(".");
  return Number(rand) * 100 + Number(cents.padEnd(2, "0"));
}

export function centsToRandInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}
