import { useRef, useState, useCallback } from "react";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { uploadProductImage } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  /** Existing image URL (edit form pre-population) */
  currentUrl?: string | null;
  tenantId: string;
  /** Product slug — used as the storage filename. For new products,
   *  generate the slug from the name before calling upload. */
  slug: string;
  /** Called with the new public URL after a successful upload */
  onUpload: (url: string) => void;
  /** Called when the user removes the current image */
  onRemove: () => void;
  className?: string;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function ImageUpload({
  currentUrl,
  tenantId,
  slug,
  onUpload,
  onRemove,
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!ACCEPTED.includes(file.type)) {
        setError("Please upload a JPEG, PNG, WebP, or GIF.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("Image must be under 5 MB.");
        return;
      }
      if (!slug.trim()) {
        setError("Enter a product name first so we can generate the filename.");
        return;
      }

      // Instant local preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      setUploading(true);
      try {
        const url = await uploadProductImage(file, tenantId, slug);
        onUpload(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setPreview(currentUrl ?? null);
      } finally {
        setUploading(false);
      }
    },
    [slug, tenantId, onUpload, currentUrl],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so re-selecting the same file still triggers onChange
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const remove = () => {
    setPreview(null);
    setError(null);
    onRemove();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={onInputChange}
      />

      {preview ? (
        /* ── Preview state ── */
        <div className="relative w-full aspect-square max-w-[240px] rounded-md overflow-hidden border border-border group">
          <img
            src={preview}
            alt="Product"
            className="w-full h-full object-cover"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 size={24} className="text-white animate-spin" />
            </div>
          )}
          {!uploading && (
            <div className="absolute inset-0 flex items-end justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-[11px] font-mono uppercase tracking-wide text-white/90 hover:text-white"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={remove}
                className="p-1 rounded bg-black/40 hover:bg-danger/80 text-white transition-colors"
                aria-label="Remove image"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Drop zone state ── */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "w-full max-w-[240px] aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors text-muted hover:text-text",
            dragging
              ? "border-primary bg-primary/5 text-text"
              : "border-border hover:border-primary/40",
          )}
        >
          {uploading ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <>
              <ImageIcon size={22} className="opacity-40" />
              <span className="font-mono text-[10px] uppercase tracking-[0.15em]">
                Drop image or click
              </span>
              <span className="text-[11px] opacity-50">JPEG, PNG, WebP · max 5 MB</span>
            </>
          )}
        </button>
      )}

      {error && (
        <p className="text-danger text-xs">{error}</p>
      )}
    </div>
  );
}
