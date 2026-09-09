import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Standard inner page layout used by every non-home route. */
export function PageShell({ eyebrow, title, description, actions, children, className }: PageShellProps) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 py-10 sm:py-14", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
          )}
          <h1 className="text-3xl font-semibold text-balance-tight sm:text-4xl">{title}</h1>
          {description && <p className="text-base text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}

/** Placeholder block for routes whose content lands in a later phase. */
export function ComingInNextPhase({ note }: { note: string }) {
  return (
    <div className="surface-card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-lg">🧭</span>
      <h2 className="text-lg font-semibold">Screen scaffolded</h2>
      <p className="max-w-md text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
