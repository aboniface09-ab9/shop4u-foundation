import { useThemeStore } from "@/store/theme";
import { cn } from "@/lib/utils";

/**
 * ProductImage — renders a real photo if `imageUrl` is supplied, otherwise
 * falls back to the CSS-gradient placeholder that doubles as branding.
 *
 * The gradient uses `color` as the seed, overlays the store wordmark +
 * category top-left, and the product name set large bottom-left.
 * Same treatment scales from cart thumb to PDP hero.
 */
export function ProductImage({
  name,
  category,
  color,
  imageUrl,
  className,
  size = "md",
}: {
  name: string;
  category: string;
  color: string;
  imageUrl?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const logoMark = useThemeStore((s) => s.logoMark);

  // Real photo — skip the gradient entirely
  if (imageUrl) {
    return (
      <div
        aria-hidden
        className={cn(
          "relative w-full h-full overflow-hidden rounded-md bg-surface",
          className,
        )}
      >
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  // Gradient placeholder — build a soft tonal gradient from the seed colour.
  const gradient = `linear-gradient(160deg, ${color} 0%, ${shade(color, -22)} 100%)`;
  const textOn = isLight(color) ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.95)";
  const subOn = isLight(color) ? "rgba(20,20,20,0.55)" : "rgba(255,255,255,0.65)";

  const padding = size === "sm" ? "p-3" : size === "lg" ? "p-8" : "p-5";
  const nameSize =
    size === "sm"
      ? "text-base leading-[0.95]"
      : size === "lg"
        ? "text-5xl md:text-6xl leading-[0.9]"
        : "text-2xl md:text-3xl leading-[0.95]";
  const metaSize = size === "sm" ? "text-[9px]" : "text-[11px]";

  return (
    <div
      aria-hidden
      className={cn(
        "relative w-full h-full overflow-hidden rounded-md",
        padding,
        className,
      )}
      style={{ background: gradient, color: textOn }}
    >
      <div
        className={cn(
          "absolute left-0 top-0 flex items-center gap-2 font-mono uppercase tracking-[0.18em]",
          padding,
          metaSize,
        )}
        style={{ color: subOn }}
      >
        <span className="font-bold" style={{ color: textOn }}>
          {logoMark}
        </span>
        <span>·</span>
        <span>{category}</span>
      </div>
      <div
        className={cn(
          "absolute left-0 bottom-0 font-heading font-semibold pr-6",
          padding,
          nameSize,
        )}
      >
        {name}
      </div>
    </div>
  );
}

// --- tiny colour utils (avoid pulling a dep) ---
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex: string, percent: number) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (percent / 100) * 255)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
function isLight(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  // Rec. 709 luma
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 170;
}
