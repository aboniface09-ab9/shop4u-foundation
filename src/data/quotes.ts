import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { NewQuoteLine } from "@/lib/quote-lines";
import type {
  BusinessSettingsInput,
  LineKind,
  PriceItemInput,
  QuoteLineInput,
  QuoteSettingsInput,
} from "@/lib/schemas/quotes";

/**
 * Price list, quotes and business settings (platform admins only). The security
 * boundary is RLS in supabase/migrations/20261115000003_quotes.sql. Inputs must
 * already be parsed by the zod schemas in lib/schemas/quotes.
 */

export type PriceItemRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  unit_price_cents: number;
  kind: LineKind;
  active: boolean;
  sort_order: number;
};

export type QuoteRow = {
  id: string;
  number: string;
  client_id: string;
  project_id: string | null;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  valid_until: string;
  deposit_percent: number;
  vat_rate_bps: number;
  intro: string;
  terms: string;
  created_at: string;
  sent_at: string | null;
  sent_to_email: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
};

export type SendQuoteResult = {
  ok: boolean;
  emailed?: boolean;
  dryRun?: boolean;
  link?: string;
  reason?: string;
};

/**
 * Sends (or re-sends, issuing a NEW link) a quote via the Worker endpoint, which locks the quote,
 * emails the client the private link plus PDF, and returns the link. Resolves with the Worker's
 * JSON even on a partial failure (quote locked but email failed) so the page can show the link.
 */
export function useSendQuote(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (toEmail: string): Promise<SendQuoteResult> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("You are signed out. Sign in again.");
      const res = await fetch("/api/platform/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId, toEmail }),
      });
      const body = (await res.json().catch(() => ({}))) as SendQuoteResult;
      if (!res.ok && !body.link) throw new Error(body.reason ?? `Send failed (${res.status})`);
      return { ...body, ok: res.ok && body.ok === true };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["activity", quoteId] });
    },
  });
}

export type QuoteLineRow = {
  id: string;
  quote_id: string;
  kind: LineKind;
  name: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  sort_order: number;
  price_item_id: string | null;
};

export type BusinessSettingsRow = BusinessSettingsInput & { id: 1 };

// ── price list ─────────────────────────────────────────────────────────────

export function usePriceList() {
  return useQuery({
    queryKey: ["price-list"],
    queryFn: async (): Promise<PriceItemRow[]> => {
      const { data, error } = await supabase
        .from("price_list_items")
        .select("*")
        .order("kind", { ascending: false })
        .order("sort_order");
      if (error) throw error;
      return data as PriceItemRow[];
    },
  });
}

export function useSavePriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: PriceItemInput }) => {
      const { error } = id
        ? await supabase.from("price_list_items").update(input).eq("id", id)
        : await supabase
            .from("price_list_items")
            .insert({ ...input, sort_order: input.kind === "monthly" ? 150 : 90 });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-list"] }),
  });
}

// ── business settings ──────────────────────────────────────────────────────

export function useBusinessSettings() {
  return useQuery({
    queryKey: ["business-settings"],
    queryFn: async (): Promise<BusinessSettingsRow> => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as BusinessSettingsRow;
    },
  });
}

export function useSaveBusinessSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BusinessSettingsInput) => {
      const { error } = await supabase.from("business_settings").update(input).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-settings"] }),
  });
}

// ── quotes ─────────────────────────────────────────────────────────────────

export type QuoteListRow = QuoteRow & { client: { company_name: string } | null };

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: async (): Promise<QuoteListRow[]> => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, client:clients(company_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as QuoteListRow[];
    },
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: ["quotes", id],
    enabled: !!id,
    queryFn: async (): Promise<{ quote: QuoteRow; lines: QuoteLineRow[] }> => {
      const [q, l] = await Promise.all([
        supabase.from("quotes").select("*").eq("id", id).single(),
        supabase
          .from("quote_lines")
          .select("*")
          .eq("quote_id", id)
          .order("kind", { ascending: false })
          .order("sort_order")
          .order("id"),
      ]);
      if (q.error) throw q.error;
      if (l.error) throw l.error;
      return { quote: q.data as QuoteRow, lines: l.data as QuoteLineRow[] };
    },
  });
}

/** Creates a draft quote using the business defaults (validity, deposit, VAT, terms). */
export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      projectId,
    }: {
      clientId: string;
      projectId: string | null;
    }): Promise<QuoteRow> => {
      const { data: settings, error: sErr } = await supabase
        .from("business_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (sErr) throw sErr;
      const s = settings as BusinessSettingsRow;

      const { data: number, error: nErr } = await supabase.rpc("next_document_number", {
        p_kind: "quote",
      });
      if (nErr) throw nErr;

      const valid = new Date();
      valid.setDate(valid.getDate() + s.default_validity_days);

      const { data, error } = await supabase
        .from("quotes")
        .insert({
          number: number as string,
          client_id: clientId,
          project_id: projectId,
          valid_until: valid.toISOString().slice(0, 10),
          deposit_percent: s.default_deposit_percent,
          vat_rate_bps: s.vat_registered ? 1500 : 0,
          terms: s.default_terms,
        })
        .select()
        .single();
      if (error) throw error;
      return data as QuoteRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useUpdateQuote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteSettingsInput) => {
      const { error } = await supabase.from("quotes").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

// ── lines (always COPIES: later price-list edits never change a quote) ─────

export function useAddLine(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: QuoteLineInput & { price_item_id?: string | null; sort_order?: number },
    ) => {
      const { error } = await supabase.from("quote_lines").insert({ ...input, quote_id: quoteId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", quoteId] }),
  });
}

/** Adds several lines in ONE request, so a multi-select either fully works or adds nothing. */
export function useAddLines(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lines: NewQuoteLine[]) => {
      if (lines.length === 0) return;
      const { error } = await supabase
        .from("quote_lines")
        .insert(lines.map((l) => ({ ...l, quote_id: quoteId })));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", quoteId] }),
  });
}

export function useUpdateLine(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: QuoteLineInput }) => {
      const { error } = await supabase.from("quote_lines").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", quoteId] }),
  });
}

export function useDeleteLine(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quote_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", quoteId] }),
  });
}
