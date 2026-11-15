import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { QuoteDocument } from "@/lib/quote-document";
import { sendTransactionalEmail, type BrevoEmailEnv } from "../email/brevo";
import { renderQuotePdf } from "../pdf/quote-pdf";
import {
  buildQuoteDocument,
  bytesToBase64,
  isTokenFormat,
  quoteEmailHtml,
  safeOrigin,
} from "./helpers";

/**
 * Quote endpoints handled at the Worker level (see src/server.ts).
 *
 *  POST /api/platform/quotes/send   admin only: issue a private link, email it with the PDF.
 *  GET  /api/q/:token/pdf           the client's PDF, by private token.
 *
 * No service-role key is used here. Admin calls run as the signed-in admin (their bearer token is
 * forwarded to Supabase, so RLS and the is_platform_admin() checks inside the database functions
 * apply). Public calls use the anon key and the token-keyed SECURITY DEFINER functions.
 */

export type QuotesWorkerEnv = BrevoEmailEnv & {
  /** https origin used in client links, e.g. https://portal.youcommerce.co.za. Falls back to the request origin. */
  PORTAL_ORIGIN?: string;
  /** "true" = build everything but do NOT send email (local testing). */
  QUOTE_EMAIL_DRY_RUN?: string;
};

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function supabaseFor(authorization?: string): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
  });
}

const sendBody = z.object({
  quoteId: z.string().uuid(),
  toEmail: z.string().trim().email().max(254),
});

export async function handleSendQuote(request: Request, env: QuotesWorkerEnv): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authorization))
    return json({ ok: false, reason: "Missing Authorization header" }, 401);

  let parsedBody;
  try {
    parsedBody = sendBody.safeParse(await request.json());
  } catch {
    return json({ ok: false, reason: "Invalid JSON body" }, 400);
  }
  if (!parsedBody.success)
    return json({ ok: false, reason: "quoteId and a valid toEmail are required" }, 400);
  const { quoteId, toEmail } = parsedBody.data;

  // Dry run: Worker var in any environment, or a VITE_ flag that only counts under `vite dev`
  // (import.meta.env.DEV is false in production builds, so it can never disable real email there).
  const dryRun =
    env.QUOTE_EMAIL_DRY_RUN === "true" ||
    (import.meta.env.DEV && import.meta.env.VITE_QUOTE_EMAIL_DRY_RUN === "true");
  if (!dryRun && (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL)) {
    // Checked BEFORE the quote is locked, so a missing config never leaves a sent-but-unemailed quote.
    return json(
      { ok: false, reason: "Email is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)" },
      412,
    );
  }

  const db = supabaseFor(authorization);

  // Admin-only reads (RLS): a non-admin gets nothing back here.
  const { data: quote, error: quoteError } = await db
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) return json({ ok: false, reason: "Quote not found" }, 404);

  const [{ data: client }, { data: lines }, { data: business }, { data: contacts }] =
    await Promise.all([
      db
        .from("clients")
        .select("company_name, billing_address")
        .eq("id", quote.client_id)
        .maybeSingle(),
      db
        .from("quote_lines")
        .select("kind, name, description, quantity, unit_price_cents")
        .eq("quote_id", quoteId)
        .order("kind", { ascending: false })
        .order("sort_order")
        .order("id"),
      db.from("business_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("client_contacts").select("email").eq("client_id", quote.client_id),
    ]);
  if (!client || !lines || !business)
    return json({ ok: false, reason: "Could not load quote details" }, 500);

  // The link may only go to an address that is on file for this client.
  const known = (contacts ?? []).map((c: { email: string | null }) =>
    (c.email ?? "").toLowerCase(),
  );
  if (!known.includes(toEmail.toLowerCase())) {
    return json({ ok: false, reason: "That address is not a contact of this client" }, 400);
  }

  // Issues the token and locks the quote (admin check + validation live inside the database function).
  const { data: token, error: sendError } = await db.rpc("send_quote", {
    p_quote_id: quoteId,
    p_to_email: toEmail,
  });
  if (sendError || typeof token !== "string" || !isTokenFormat(token)) {
    const forbidden = sendError?.code === "42501";
    return json(
      {
        ok: false,
        reason: forbidden ? "Not authorised" : (sendError?.message ?? "Could not send quote"),
      },
      forbidden ? 403 : 400,
    );
  }

  const origin = safeOrigin(env.PORTAL_ORIGIN, request.url);
  const link = `${origin}/q/${token}`;

  const document: QuoteDocument = buildQuoteDocument(quote, lines, client, business);
  const pdf = await renderQuotePdf(document);

  if (dryRun) {
    console.log("QUOTE_EMAIL_DRY_RUN: not sending", {
      number: document.number,
      pdfBytes: pdf.length,
    });
    return json({ ok: true, emailed: false, dryRun: true, link });
  }

  const result = await sendTransactionalEmail(env, {
    to: { email: toEmail, name: client.company_name },
    subject: `Quotation ${document.number} from ${business.legal_name}`,
    htmlContent: quoteEmailHtml({
      clientName: client.company_name,
      number: document.number,
      link,
      validUntil: new Date(document.valid_until + "T00:00:00Z").toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      senderName: business.legal_name,
    }),
    attachments: [{ name: `Quotation-${document.number}.pdf`, contentBase64: bytesToBase64(pdf) }],
  });

  if (!result.ok) {
    console.error("Quote email failed", { number: document.number, reason: result.reason });
    // The quote IS sent (locked, link issued). Return the link so the admin can pass it on, or resend.
    return json(
      {
        ok: false,
        emailed: false,
        reason: "The quote was locked but the email failed. Copy the link or resend.",
        link,
      },
      502,
    );
  }

  return json({ ok: true, emailed: true, link });
}

export async function handleQuotePdf(request: Request, token: string): Promise<Response> {
  if (!isTokenFormat(token))
    return new Response("Not found", { status: 404, headers: NO_STORE_HEADERS });

  const { data, error } = await supabaseFor().rpc("get_quote_by_token", { p_token: token });
  if (error || !data) return new Response("Not found", { status: 404, headers: NO_STORE_HEADERS });

  const doc = data as QuoteDocument;
  const pdf = await renderQuotePdf(doc);
  void request;
  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Quotation-${doc.number.replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
    },
  });
}
