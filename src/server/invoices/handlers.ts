import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { InvoiceDocument } from "@/lib/invoice-document";
import { formatCents } from "@/lib/money";
import { sendTransactionalEmail } from "../email/brevo";
import { renderInvoicePdf } from "../pdf/invoice-pdf";
import { safeText } from "../pdf/quote-pdf";
import { bytesToBase64, isTokenFormat, safeOrigin } from "../quotes/helpers";
import type { QuotesWorkerEnv } from "../quotes/handlers";
import { buildInvoiceDocument, invoiceEmailHtml } from "./helpers";

/**
 * Invoice endpoints handled at the Worker level (see src/server.ts).
 *
 *  POST /api/platform/invoices/send   admin only: issue a private link, email it with the PDF.
 *  GET  /api/i/:token/pdf             the client's PDF, by private token.
 *
 * Same model as the quote endpoints: no service-role key. Admin calls run AS the signed-in admin
 * (their bearer token is forwarded, so RLS and the is_platform_admin() checks inside the database
 * functions apply); public calls use the anon key and the token-keyed SECURITY DEFINER function.
 */

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function supabaseFor(authorization?: string): SupabaseClient {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: authorization ? { headers: { Authorization: authorization } } : undefined,
    },
  );
}

const sendBody = z.object({
  invoiceId: z.string().uuid(),
  toEmail: z.string().trim().email().max(254),
});

const dateZA = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export async function handleSendInvoice(request: Request, env: QuotesWorkerEnv): Promise<Response> {
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
    return json({ ok: false, reason: "invoiceId and a valid toEmail are required" }, 400);
  const { invoiceId, toEmail } = parsedBody.data;

  const dryRun =
    env.QUOTE_EMAIL_DRY_RUN === "true" ||
    (import.meta.env.DEV && import.meta.env.VITE_QUOTE_EMAIL_DRY_RUN === "true");
  if (!dryRun && (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL)) {
    return json(
      { ok: false, reason: "Email is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)" },
      412,
    );
  }

  const db = supabaseFor(authorization);

  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) return json({ ok: false, reason: "Invoice not found" }, 404);

  const [{ data: client }, { data: lines }, { data: business }, { data: contacts }] =
    await Promise.all([
      db
        .from("clients")
        .select("company_name, billing_address, vat_number")
        .eq("id", invoice.client_id)
        .maybeSingle(),
      db
        .from("invoice_lines")
        .select("name, description, quantity, unit_price_cents")
        .eq("invoice_id", invoiceId)
        .order("sort_order")
        .order("id"),
      db.from("business_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("client_contacts").select("email").eq("client_id", invoice.client_id),
    ]);
  if (!client || !lines || !business)
    return json({ ok: false, reason: "Could not load invoice details" }, 500);

  const known = (contacts ?? []).map((c: { email: string | null }) =>
    (c.email ?? "").toLowerCase(),
  );
  if (!known.includes(toEmail.toLowerCase())) {
    return json({ ok: false, reason: "That address is not a contact of this client" }, 400);
  }

  // Issues the token, marks the invoice sent (admin check, status and bank-details validation are in the function).
  const { data: token, error: sendError } = await db.rpc("send_invoice", {
    p_invoice_id: invoiceId,
    p_to_email: toEmail,
  });
  if (sendError || typeof token !== "string" || !isTokenFormat(token)) {
    const forbidden = sendError?.code === "42501";
    return json(
      {
        ok: false,
        reason: forbidden ? "Not authorised" : (sendError?.message ?? "Could not send invoice"),
      },
      forbidden ? 403 : 400,
    );
  }

  const origin = safeOrigin(env.PORTAL_ORIGIN, request.url);
  const link = `${origin}/i/${token}`;

  const document: InvoiceDocument = buildInvoiceDocument(
    { ...invoice, status: "sent" },
    lines,
    client,
    business,
    {
      bank_name: business.bank_name,
      account_holder: business.account_holder,
      account_number: business.account_number,
      branch_code: business.branch_code,
    },
  );
  const pdf = await renderInvoicePdf(document);

  if (dryRun) {
    console.log("EMAIL_DRY_RUN: not sending invoice", {
      number: document.number,
      pdfBytes: pdf.length,
    });
    return json({ ok: true, emailed: false, dryRun: true, link });
  }

  const result = await sendTransactionalEmail(env, {
    to: { email: toEmail, name: client.company_name },
    subject: `Invoice ${document.number} from ${business.legal_name}`,
    htmlContent: invoiceEmailHtml({
      clientName: client.company_name,
      number: document.number,
      link,
      totalFormatted: safeText(formatCents(document.total_cents)),
      dueFormatted: dateZA(document.due_date),
      senderName: business.legal_name,
    }),
    attachments: [{ name: `Invoice-${document.number}.pdf`, contentBase64: bytesToBase64(pdf) }],
  });

  if (!result.ok) {
    console.error("Invoice email failed", { number: document.number, reason: result.reason });
    return json(
      {
        ok: false,
        emailed: false,
        reason: "The invoice is marked sent but the email failed. Copy the link or resend.",
        link,
      },
      502,
    );
  }
  return json({ ok: true, emailed: true, link });
}

export async function handleInvoicePdf(token: string): Promise<Response> {
  if (!isTokenFormat(token))
    return new Response("Not found", { status: 404, headers: NO_STORE_HEADERS });

  const { data, error } = await supabaseFor().rpc("get_invoice_by_token", { p_token: token });
  if (error || !data) return new Response("Not found", { status: 404, headers: NO_STORE_HEADERS });

  const doc = data as InvoiceDocument;
  const pdf = await renderInvoicePdf(doc);
  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Invoice-${doc.number.replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
    },
  });
}
