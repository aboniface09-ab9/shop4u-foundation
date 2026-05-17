import { useThemeStore } from "@/store/theme";

export function Footer() {
  const storeName = useThemeStore((s) => s.storeName);
  return (
    <footer className="border-t border-border bg-surface mt-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-12 grid gap-10 md:grid-cols-4">
        <div>
          <div className="font-heading text-xl font-bold">
            {storeName}<span className="text-primary">.</span>
          </div>
          <p className="mt-3 text-sm text-muted max-w-xs">
            Small-batch streetwear, cut and sewn in Salt River, Cape Town.
          </p>
        </div>
        {[
          { title: "Shop", items: ["New", "Tops", "Bottoms", "Headwear"] },
          { title: "Studio", items: ["About", "Journal", "Stockists", "Contact"] },
          { title: "Help", items: ["Shipping", "Returns", "Size guide", "FAQ"] },
        ].map((col) => (
          <div key={col.title}>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted mb-3">
              {col.title}
            </h4>
            <ul className="space-y-2 text-sm">
              {col.items.map((i) => (
                <li key={i}><a href="#" className="hover:text-primary transition-colors">{i}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-4 flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          <span>© {new Date().getFullYear()} {storeName}</span>
          <span>Powered by Shop4U</span>
        </div>
      </div>
    </footer>
  );
}
