import { supabase } from "@/lib/supabase";

const BUCKET = "product-images";

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

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
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
