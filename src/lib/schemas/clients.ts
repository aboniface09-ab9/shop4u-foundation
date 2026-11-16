import { z } from "zod";

export const CLIENT_STATUSES = ["lead", "active", "past"] as const;
export const PROJECT_STAGES = ["discovery", "prototype", "build", "live"] as const;
export const DNS_ACCESS_STATUSES = ["unknown", "requested", "granted", "not_needed"] as const;
export const CONTENT_STATUSES = ["requested", "received", "approved", "not_needed"] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

/**
 * Text pasted from WhatsApp, iPhone contacts, Word or a web page often carries invisible formatting
 * characters (direction marks, zero-width spaces, a byte-order mark) and sometimes full-width digits.
 * They are invisible, so a value that looks perfect can fail validation. Remove them first and store the
 * clean value. Applied to single-line fields only; free-text boxes (notes, addresses) are kept exactly as typed.
 */
export function cleanPasted(value: unknown): unknown {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/\p{Cf}/gu, "")
        .trim()
    : value;
}
const clean = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(cleanPasted, schema);

/** Trimmed text as typed; empty string becomes null so the database stores NULL, not "". */
const optionalFreeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Max ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Single-line optional text, cleaned of invisible pasted characters. */
const optionalText = (max: number) => clean(optionalFreeText(max));

/** Optional https:// URL only (blocks javascript:, http:, relative paths). */
const optionalHttpsUrl = clean(
  z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null)
    .refine(
      (v) => {
        if (v === null) return true;
        try {
          return new URL(v).protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Must be a full https:// address" },
    ),
);

const optionalDate = clean(
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: "Use a valid date" }),
);

export const clientSchema = z.object({
  company_name: clean(z.string().trim().min(1, "Company name is required").max(200)),
  trading_name: optionalText(200),
  vat_number: optionalText(30),
  billing_address: optionalFreeText(500),
  status: z.enum(CLIENT_STATUSES).default("lead"),
  notes: optionalFreeText(4000),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const contactSchema = z.object({
  name: clean(z.string().trim().min(1, "Name is required").max(200)),
  email: clean(
    z
      .string()
      .trim()
      .max(254)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional()
      .transform((v) => v ?? null)
      .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
        message: "Enter a valid email",
      }),
  ),
  // South African-friendly but permissive: digits, spaces, +, -, ( )
  phone: clean(
    z
      .string()
      .trim()
      .max(40)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional()
      .transform((v) => v ?? null)
      .refine((v) => v === null || /^[0-9+\-()\s]{5,40}$/.test(v), {
        message: "Enter a valid phone number, e.g. 081 286 7121 or +27 81 286 7121",
      }),
  ),
  role: optionalText(100),
  is_primary: z.boolean().default(false),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const projectSchema = z.object({
  name: clean(z.string().trim().min(1, "Project name is required").max(200)),
  repo_url: optionalHttpsUrl,
  staging_url: optionalHttpsUrl,
  production_url: optionalHttpsUrl,
  domain_name: optionalText(253),
  registrar: optionalText(100),
  domain_expiry: optionalDate,
  nameservers: optionalText(500),
  dns_access_status: z.enum(DNS_ACCESS_STATUSES).default("unknown"),
  // Where a credential is kept (e.g. "Password manager: Afrihost - client"). NEVER the credential itself.
  credential_location: optionalText(200),
  hosting_provider: clean(z.string().trim().min(1).max(100)).default("Cloudflare"),
  hosting_plan: optionalText(100),
  hosting_monthly_cents: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  hosting_start_date: optionalDate,
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const contentItemSchema = z.object({
  item: clean(z.string().trim().min(1, "Item is required").max(200)),
  status: z.enum(CONTENT_STATUSES).default("requested"),
  due_date: optionalDate,
  note: optionalText(1000),
});
export type ContentItemInput = z.infer<typeof contentItemSchema>;

/** Starter checklist, from the quote's "What we need from you". */
export const DEFAULT_CONTENT_CHECKLIST = [
  "Logo files and brand colours",
  "Company information",
  "Product descriptions",
  "Product photos",
  "Contact details and address",
  "Certifications or permits to show (with supporting documents)",
] as const;
