import { supabase } from "@/lib/supabase";

const BUCKET = "product-images";
const LOGO_BUCKET = "tenant-logos";

/**
 * Upload a product image to Supabase Storage and return the public URL.
 *
 * Path: product-images/{tenantId}/{slug}.{ext}
 * Upsert is true so re-uploading replaces the existing file cleanly.
 *
 * Throws on any Supabase error so callers can catch and toast.
 */
export async function uploadProductImage(
  file: File,
  tenantId: string,
  slug: string,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${tenantId}/${slug}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Bust the browser cache when the same path is overwritten
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Delete a product image from Storage by its full public URL.
 * Silently ignores errors (non-fatal — DB row will just keep a stale URL).
 */
export async function deleteProductImage(publicUrl: string): Promise<void> {
  // Extract the path segment after "/product-images/"
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length).split("?")[0];
  await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * Upload a tenant's logo to Supabase Storage and return the public URL.
 *
 * Path: tenant-logos/{tenantId}/logo.{ext} — always the same filename per
 * tenant (upsert true) so re-uploading just replaces it in place.
 *
 * Throws on any Supabase error so callers can catch and toast. Requires
 * the "tenant-logos" public bucket to exist (see
 * supabase-logo-migration.sql for the one-time setup).
 */
export async function uploadTenantLogo(file: File, tenantId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${tenantId}/logo.${ext}`;

  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  // Bust the browser cache when the same path is overwritten
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Delete a tenant's logo from Storage by its full public URL.
 * Silently ignores errors (non-fatal — DB row will just keep a stale URL).
 */
export async function deleteTenantLogo(publicUrl: string): Promise<void> {
  const marker = `/${LOGO_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length).split("?")[0];
  await supabase.storage.from(LOGO_BUCKET).remove([path]);
}
