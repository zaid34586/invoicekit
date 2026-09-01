import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_CATALOG } from "../lib/countryCatalog";

interface CountrySelectProps {
  value: string;
  onChange: (country: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

function flagFromIso2(iso2: string) {
  return String.fromCodePoint(...iso2.toUpperCase().split("").map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

export default function CountrySelect({
  value,
  onChange,
  placeholder = "Select country",
  disabled = false,
  required = false,
  className = "",
  id,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = COUNTRY_CATALOG.find((country) => country.name === value);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return COUNTRY_CATALOG;
    return COUNTRY_CATALOG.filter((country) =>
      `${country.name} ${country.iso2} ${country.callingCode}`.toLowerCase().includes(search)
    );
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((current) => !current)}
        className="input flex min-h-12 w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className={selected ? "flex min-w-0 items-center gap-2 text-slate-900" : "text-slate-400"}>
          {selected && <span aria-hidden="true" className="text-lg">{flagFromIso2(selected.iso2)}</span>}
          <span className="truncate">{selected?.name ?? placeholder}</span>
          {selected?.callingCode && <span className="flex-none text-xs text-slate-400">{selected.callingCode}</span>}
        </span>
        <span aria-hidden="true" className="text-slate-400">⌄</span>
      </button>

      {required && <input tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" value={value} onChange={() => undefined} required />}

      {open && (
        <div className="absolute z-50 mt-2 w-full min-w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-3">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input h-10"
              placeholder="Search country, code or calling code..."
            />
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            {filtered.map((country) => (
              <button
                key={country.iso2}
                type="button"
                role="option"
                aria-selected={country.name === value}
                onClick={() => {
                  onChange(country.name);
                  setQuery("");
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-violet-50 ${country.name === value ? "bg-violet-50 font-semibold text-violet-700" : "text-slate-700"}`}
              >
                <span aria-hidden="true" className="text-lg">{flagFromIso2(country.iso2)}</span>
                <span className="min-w-0 flex-1 truncate">{country.name}</span>
                <span className="flex-none text-xs text-slate-400">{country.callingCode || country.iso2}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">No country found.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
