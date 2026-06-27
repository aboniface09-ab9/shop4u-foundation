import { useRef, useState, useEffect } from "react";
import { ChevronDown, Plus, Loader2 } from "lucide-react";
import { useCategories, useCreateCategory } from "@/data/categories";
import { cn } from "@/lib/utils";

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CategoryCombobox({ value, onChange, className }: CategoryComboboxProps) {
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories;

  const exactMatch = categories.some(
    (c) => c.name.toLowerCase() === query.trim().toLowerCase(),
  );

  const select = (name: string) => {
    onChange(name);
    setQuery("");
    setOpen(false);
  };

  const addNew = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const cat = await createCategory.mutateAsync(name);
      select(cat.name);
    } catch {
      // name conflict — just select it
      select(name);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 10);
        }}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-border rounded-sm bg-bg hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <span className={value ? "text-text" : "text-muted"}>
          {value || "Select category"}
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-sm border border-border bg-surface shadow-lg">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length === 1 && exactMatch) {
                    select(filtered[0].name);
                  } else if (!exactMatch && query.trim()) {
                    addNew();
                  } else if (filtered.length === 1) {
                    select(filtered[0].name);
                  }
                }
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Search or add…"
              className="w-full bg-transparent text-sm focus:outline-none placeholder:text-muted"
            />
          </div>

          <ul className="max-h-48 overflow-y-auto py-1">
            {isLoading && (
              <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </li>
            )}

            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => select(c.name)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-muted/10 transition-colors",
                    c.name === value && "font-medium text-primary",
                  )}
                >
                  {c.name}
                </button>
              </li>
            ))}

            {/* Add new option */}
            {query.trim() && !exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={addNew}
                  disabled={createCategory.isPending}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  {createCategory.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Plus size={13} />
                  )}
                  Add "{query.trim()}"
                </button>
              </li>
            )}

            {filtered.length === 0 && !query.trim() && !isLoading && (
              <li className="px-3 py-2 text-sm text-muted">No categories yet.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
