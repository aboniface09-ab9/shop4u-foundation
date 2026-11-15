import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

/**
 * Invoices (platform admins only). The browser can only READ these tables; every change goes
 * through admin-checked database functions (send_invoice, mark_invoice_paid, void_invoice) or the
 * Worker send endpoint. See supabase/migrations/20261115000005_invoices.sql.
 */

export type InvoiceKind = "deposit" | "balance" | "monthly";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type InvoiceRow = {
  id: string;
  number: string;
  client_id: string;
  project_id: string | null;
  quote_id: string | null;
  recurring_plan_id: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  period_start: string | null;
  vat_rate_bps: number;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  notes: string;
  sent_at: string | null;
  sent_to_email: string | null;
  viewed_at: string | null;
  paid_on: string | null;
  payment_reference: string | null;
  created_at: string;
};

export type InvoiceLineRow = {
  id: string;
  invoice_id: string;
  name: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  sort_order: number;
};

export type InvoiceListRow = InvoiceRow & { client: { company_name: string } | null };

export const KIND_LABEL: Record<InvoiceKind, string> = {
  deposit: "Deposit",
  balance: "Balance",
  monthly: "Monthly hosting",
};

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async (): Promise<InvoiceListRow[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, client:clients(company_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as InvoiceListRow[];
    },
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ["invoices", id],
    enabled: !!id,
    queryFn: async (): Promise<{ invoice: InvoiceRow; lines: InvoiceLineRow[] }> => {
      const [i, l] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).single(),
        supabase
          .from("invoice_lines")
          .select("*")
          .eq("invoice_id", id)
          .order("sort_order")
          .order("id"),
      ]);
      if (i.error) throw i.error;
      if (l.error) throw l.error;
      return { invoice: i.data as InvoiceRow, lines: l.data as InvoiceLineRow[] };
    },
  });
}

/** Invoices raised from one quote (shown on the quote page). */
export function useInvoicesForQuote(quoteId: string) {
  return useQuery({
    queryKey: ["invoices", "quote", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("quote_id", quoteId)
        .order("issue_date")
        .order("created_at");
      if (error) throw error;
      return data as InvoiceRow[];
    },
  });
}

export type SendInvoiceResult = {
  ok: boolean;
  emailed?: boolean;
  dryRun?: boolean;
  link?: string;
  reason?: string;
};

/** Sends (or re-sends, with a NEW link) an invoice through the Worker, which emails the PDF. */
export function useSendInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (toEmail: string): Promise<SendInvoiceResult> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("You are signed out. Sign in again.");
      const res = await fetch("/api/platform/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invoiceId, toEmail }),
      });
      const body = (await res.json().catch(() => ({}))) as SendInvoiceResult;
      if (!res.ok && !body.link) throw new Error(body.reason ?? `Send failed (${res.status})`);
      return { ...body, ok: res.ok && body.ok === true };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["activity", invoiceId] });
    },
  });
}

export function useMarkInvoicePaid(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paidOn, reference }: { paidOn: string; reference: string }) => {
      const { error } = await supabase.rpc("mark_invoice_paid", {
        p_invoice_id: invoiceId,
        p_paid_on: paidOn,
        p_reference: reference,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["activity", invoiceId] });
    },
  });
}

export function useVoidInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("void_invoice", {
        p_invoice_id: invoiceId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["activity", invoiceId] });
    },
  });
}
