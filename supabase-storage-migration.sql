-- =============================================================================
-- Supabase Storage: product-images bucket + RLS
-- Run this in the Supabase SQL editor (or via supabase db push if using CLI).
-- =============================================================================

-- 1. Create the bucket (public = images are readable without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,                          -- public read
  5242880,                       -- 5 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. RLS policies
--
-- Storage path convention: product-images/{tenant_id}/{slug}.{ext}
-- storage.foldername(name) returns ARRAY['{tenant_id}', '{slug}.{ext}']
-- so (storage.foldername(name))[1] is the tenant_id segment.
-- =============================================================================

-- Public can read all product images (needed for storefront)
CREATE POLICY "product_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Authenticated merchants can upload — but only into their own tenant folder.
-- Checks that the first path segment matches a tenant_id the user belongs to.
CREATE POLICY "product_images_tenant_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM public.tenant_users
    WHERE auth_user_id = auth.uid()
  )
);

-- Merchants can update (overwrite) images in their own tenant folder
CREATE POLICY "product_images_tenant_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM public.tenant_users
    WHERE auth_user_id = auth.uid()
  )
);

-- Merchants can delete images in their own tenant folder
CREATE POLICY "product_images_tenant_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM public.tenant_users
    WHERE auth_user_id = auth.uid()
  )
);
