/**
 * WhatsApp order utility.
 *
 * Builds a pre-filled wa.me link so customers can send their order
 * summary directly to the shop. Used as a temporary checkout path
 * until the payment gateway integration is complete.
 *
 * Set VITE_WHATSAPP_NUMBER in .env.local to the shop's WhatsApp number
 * in international format WITHOUT the leading +, e.g. 27821234567
 */

import { formatZAR } from "@/lib/format";
import { calcOrderTotals } from "@/store/cart";

export type WhatsAppOrderInput = {
  orderRef?: string; // e.g. "ONX-1043" — optional if called before Supabase order is created
  items: Array<{
    name: string;
    size: string;
    qty: number;
    price: number;
  }>;
  customer?: {
    name: string;
    email: string;
    phone: string;
  };
  shipping?: {
    line1: string;
    suburb: string;
    city: string;
    postal: string;
    province: string;
  };
  /** Tenant's own WhatsApp number (international format, no +). Falls back to the env var. */
  whatsappNumber?: string | null;
  /** Defaults to true — pass the tenant's vat_registered flag. */
  vatRegistered?: boolean;
  /** Delivery fee in rand for this order. Defaults to 0. */
  shippingFee?: number;
};

const FALLBACK_WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER ?? "27000000000";

export function buildWhatsAppUrl(input: WhatsAppOrderInput): string {
  const shopWhatsapp = input.whatsappNumber || FALLBACK_WHATSAPP;
  const vatRegistered = input.vatRegistered ?? true;
  const sub = input.items.reduce((acc, i) => acc + i.price * i.qty, 0);
  const shipping = input.shippingFee ?? 0;
  // Listed prices are VAT-inclusive — VAT is extracted for display, never
  // added on top. Not-VAT-registered tenants skip the VAT line entirely.
  const { vat, total } = calcOrderTotals(sub, shipping, vatRegistered);

  const lines: string[] = [];

  lines.push("Hi! I'd like to place an order 🛒");
  lines.push("");

  if (input.orderRef) {
    lines.push(`*Order ref: ${input.orderRef}*`);
    lines.push("");
  }

  lines.push("*Items:*");
  for (const item of input.items) {
    const sizeLabel = item.size && item.size !== "Standard" ? ` (Size ${item.size})` : "";
    lines.push(`• ${item.name}${sizeLabel} × ${item.qty}  —  ${formatZAR(item.price * item.qty)}`);
  }
  lines.push("");

  lines.push(`Subtotal:  ${formatZAR(sub)}`);
  lines.push(`Delivery:  ${shipping > 0 ? formatZAR(shipping) : "Free"}`);
  lines.push(`*Total:    ${formatZAR(total)}*`);
  if (vatRegistered) {
    lines.push(`(Includes VAT (15%): ${formatZAR(vat)})`);
  }

  if (input.customer) {
    lines.push("");
    lines.push("*My details:*");
    lines.push(`Name:  ${input.customer.name}`);
    lines.push(`Phone: ${input.customer.phone}`);
    lines.push(`Email: ${input.customer.email}`);
  }

  if (input.shipping) {
    const { line1, suburb, city, postal, province } = input.shipping;
    lines.push("");
    lines.push("*Delivery address:*");
    lines.push(`${line1}, ${suburb}, ${city}, ${province} ${postal}`);
  }

  const message = lines.join("\n");
  return `https://wa.me/${shopWhatsapp}?text=${encodeURIComponent(message)}`;
}

/** Quick cart-only link — no customer details, used from the cart drawer. */
export function buildQuickCartUrl(
  items: Array<{ name: string; size: string; qty: number; price: number }>,
  whatsappNumber?: string | null,
  vatRegistered?: boolean,
  shippingFee?: number,
): string {
  return buildWhatsAppUrl({ items, whatsappNumber, vatRegistered, shippingFee });
}
