import { z } from "zod";

export const LINE_KINDS = ["once_off", "monthly"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

const text = (max: number) => z.string().trim().max(max, `Max ${max} characters`).default("");

export const priceItemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: text(1000),
  kind: z.enum(LINE_KINDS),
  unit_price_cents: z.number().int("Whole cents only").min(0, "Can't be negative").max(100_000_000),
  active: z.boolean().default(true),
});
export type PriceItemInput = z.infer<typeof priceItemSchema>;

export const quoteLineSchema = z.object({
  kind: z.enum(LINE_KINDS),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: text(1000),
  quantity: z.coerce.number().int("Whole number").min(1, "At least 1").max(1000),
  unit_price_cents: z.number().int().min(0, "Can't be negative").max(100_000_000),
});
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

export const quoteSettingsSchema = z.object({
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date"),
  deposit_percent: z.coerce.number().int("Whole number").min(0).max(100),
  vat_rate_bps: z.coerce.number().int().min(0).max(3000),
  intro: text(4000),
  terms: text(8000),
});
export type QuoteSettingsInput = z.infer<typeof quoteSettingsSchema>;

export const businessSettingsSchema = z.object({
  legal_name: z.string().trim().min(1, "Legal name is required").max(200),
  registration_number: text(50),
  vat_registered: z.boolean().default(false),
  vat_number: text(30),
  address: text(500),
  email: z
    .string()
    .trim()
    .max(254)
    .default("")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Enter a valid email",
    }),
  phone: text(40),
  bank_name: text(100),
  account_holder: text(200),
  account_number: z
    .string()
    .trim()
    .max(30)
    .default("")
    .refine((v) => v === "" || /^[0-9 ]{5,30}$/.test(v), { message: "Digits only" }),
  branch_code: text(20),
  default_validity_days: z.coerce.number().int().min(1).max(365),
  default_deposit_percent: z.coerce.number().int().min(0).max(100),
  default_terms: text(8000),
});
export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;
