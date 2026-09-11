/**
 * Loading placeholder — replaces bare "Loading…" text across the app.
 * Skeleton screens read as fast because they mirror the real content's
 * shape immediately (no layout shift when data arrives) and communicate
 * *what* is loading, not just *that* something is — the reasoning behind
 * every page swapping a text string for one of these.
 *
 * Respects `data-a11y-reduce-motion` (globals.css already zeroes animation
 * durations under that attribute) and prefers-reduced-motion by default.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-surface-muted motion-reduce:animate-none ${className}`}
    />
  );
}

/** A grid of card-shaped skeletons — destinations/businesses/guides-style listings. */
export function CardGridSkeleton({ count = 6, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** A stack of row-shaped skeletons — trip/message/notification-style lists. */
export function ListSkeleton({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <ul className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}
