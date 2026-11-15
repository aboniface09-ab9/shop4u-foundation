/**
 * Order references are the only thing standing between a stranger and an order's status page, so they
 * must be unguessable. The old format was a base-36 timestamp (guessable and enumerable).
 *
 * 12 characters from a 32-letter alphabet = 60 random bits, from the browser's cryptographic generator.
 * The alphabet drops look-alike characters (0/O, 1/I) so it can be read out over the phone.
 * 256 is a multiple of 32, so taking each byte modulo 32 introduces no bias.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateOrderRef(
  prefix = "FND",
  random: (n: number) => Uint8Array = defaultRandom,
): string {
  const bytes = random(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % 32];
  return `${prefix}-${out}`;
}

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export const ORDER_REF_PATTERN = /^[A-Z]{2,5}-[A-HJ-NP-Z2-9]{12}$/;
