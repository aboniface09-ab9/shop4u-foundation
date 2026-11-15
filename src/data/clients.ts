import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import {
  DEFAULT_CONTENT_CHECKLIST,
  type ClientInput,
  type ContactInput,
  type ContentItemInput,
  type ProjectInput,
  type ProjectStage,
} from "@/lib/schemas/clients";

/**
 * Custom-build client data (platform admins only). The security boundary is
 * RLS in supabase/migrations/20261115000002_clients_projects.sql — these hooks
 * only run queries; a non-admin gets empty results / permission errors.
 * Inputs MUST already have been parsed by the zod schemas in lib/schemas/clients.
 */

export type ClientRow = {
  id: string;
  company_name: string;
  trading_name: string | null;
  vat_number: string | null;
  billing_address: string | null;
  status: "lead" | "active" | "past";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactRow = {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
};

export type ProjectRow = {
  id: string;
  client_id: string;
  name: string;
  stage: ProjectStage;
  repo_url: string | null;
  staging_url: string | null;
  production_url: string | null;
  domain_name: string | null;
  registrar: string | null;
  domain_expiry: string | null;
  nameservers: string | null;
  dns_access_status: "unknown" | "requested" | "granted" | "not_needed";
  credential_location: string | null;
  hosting_provider: string;
  hosting_plan: string | null;
  hosting_monthly_cents: number | null;
  hosting_start_date: string | null;
  launched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentItemRow = {
  id: string;
  project_id: string;
  item: string;
  status: "requested" | "received" | "approved" | "not_needed";
  due_date: string | null;
  note: string | null;
  sort_order: number;
};

export type ActivityRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  event: string;
  detail: Record<string, unknown>;
  created_at: string;
};

// ── clients ────────────────────────────────────────────────────────────────

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase.from("clients").select("*").order("company_name");
      if (error) throw error;
      return data as ClientRow[];
    },
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ["clients", id],
    enabled: !!id,
    queryFn: async (): Promise<ClientRow> => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data as ClientRow;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientInput): Promise<ClientRow> => {
      const { data, error } = await supabase.from("clients").insert(input).select().single();
      if (error) throw error;
      return data as ClientRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientInput) => {
      const { error } = await supabase.from("clients").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// ── contacts ───────────────────────────────────────────────────────────────

export function useContacts(clientId: string) {
  return useQuery({
    queryKey: ["contacts", clientId],
    queryFn: async (): Promise<ContactRow[]> => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as ContactRow[];
    },
  });
}

export function useAddContact(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput) => {
      // Only one primary per client (unique index): demote the current one first.
      if (input.is_primary) {
        const { error: demoteError } = await supabase
          .from("client_contacts")
          .update({ is_primary: false })
          .eq("client_id", clientId)
          .eq("is_primary", true);
        if (demoteError) throw demoteError;
      }
      const { error } = await supabase
        .from("client_contacts")
        .insert({ ...input, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", clientId] }),
  });
}

export function useDeleteContact(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from("client_contacts").delete().eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", clientId] }),
  });
}

// ── projects ───────────────────────────────────────────────────────────────

export function useProjects(clientId: string) {
  return useQuery({
    queryKey: ["projects", "client", clientId],
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProjectRow[];
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: async (): Promise<ProjectRow> => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) throw error;
      return data as ProjectRow;
    },
  });
}

async function logActivity(
  entityType: string,
  entityId: string,
  event: string,
  detail: Record<string, unknown> = {},
) {
  const { data } = await supabase.auth.getUser();
  const actor = data.user?.id;
  if (!actor) return;
  await supabase
    .from("activity_log")
    .insert({ entity_type: entityType, entity_id: entityId, event, detail, actor });
}

/** Creates the project and seeds the starter content checklist. */
export function useCreateProject(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectInput): Promise<ProjectRow> => {
      const { data, error } = await supabase
        .from("projects")
        .insert({ ...input, client_id: clientId })
        .select()
        .single();
      if (error) throw error;
      const project = data as ProjectRow;
      const { error: itemsError } = await supabase
        .from("content_items")
        .insert(
          DEFAULT_CONTENT_CHECKLIST.map((item, i) => ({
            project_id: project.id,
            item,
            sort_order: i,
          })),
        );
      if (itemsError) throw itemsError;
      await logActivity("project", project.id, "project_created");
      return project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      const { error } = await supabase.from("projects").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useSetProjectStage(project: Pick<ProjectRow, "id" | "stage">) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stage: ProjectStage) => {
      if (stage === project.stage) return;
      const patch: { stage: ProjectStage; launched_at?: string } = { stage };
      if (stage === "live") patch.launched_at = new Date().toISOString();
      const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
      if (error) throw error;
      await logActivity("project", project.id, "stage_changed", { from: project.stage, to: stage });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["activity", project.id] });
    },
  });
}

export function useActivity(entityId: string) {
  return useQuery({
    queryKey: ["activity", entityId],
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as ActivityRow[];
    },
  });
}

// ── content checklist ──────────────────────────────────────────────────────

export function useContentItems(projectId: string) {
  return useQuery({
    queryKey: ["content", projectId],
    queryFn: async (): Promise<ContentItemRow[]> => {
      const { data, error } = await supabase
        .from("content_items")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data as ContentItemRow[];
    },
  });
}

export function useAddContentItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContentItemInput) => {
      const { error } = await supabase
        .from("content_items")
        .insert({ ...input, project_id: projectId, sort_order: 100 });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content", projectId] }),
  });
}

export function useUpdateContentItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ContentItemInput> }) => {
      const { error } = await supabase.from("content_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content", projectId] }),
  });
}

export function useDeleteContentItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content", projectId] }),
  });
}
