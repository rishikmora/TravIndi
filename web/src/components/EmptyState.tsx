import type { ReactNode } from "react";

/**
 * Shared "nothing here yet" block — every page used to hand-roll its own
 * version of this with slightly different padding/icon/copy conventions.
 * Always answers the three questions an empty state owes the user: what's
 * missing, why (via `description`), and what to do next (via `action`).
 * Never a bare blank area.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center ${className}`}
    >
      {icon && <span className="text-foreground/40" aria-hidden>{icon}</span>}
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {description && <p className="max-w-sm text-sm text-foreground/55">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
