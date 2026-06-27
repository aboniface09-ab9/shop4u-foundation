import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenantId } from "@/store/tenant";

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

// =========================================================================
// Hooks
// =========================================================================

export function useCategories() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["categories", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort_order")
        .eq("tenant_id", tenantId!)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        sortOrder: r.sort_order,
      }));
    },
  });
}

export function useCreateCategory() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<Category> => {
      if (!tenantId) throw new Error("No tenant resolved");
      const { data, error } = await supabase
        .from("categories")
        .insert({ tenant_id: tenantId, name: name.trim() })
        .select("id, name, sort_order")
        .single();
      if (error) throw error;
      return { id: data.id, name: data.name, sortOrder: data.sort_order };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories", tenantId] });
    },
  });
}

export function useDeleteCategory() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories", tenantId] });
    },
  });
}
