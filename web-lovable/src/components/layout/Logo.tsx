import { Link } from "@tanstack/react-router";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="TravIndi home">
      <span className="relative flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-transform group-hover:-rotate-6">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">
          Trav<span className="text-primary">Indi</span>
        </span>
      )}
    </Link>
  );
}
