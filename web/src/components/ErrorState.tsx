import type { ReactNode } from "react";
import { AlertTriangleIcon } from "@/components/icons";

/**
 * Shared "something went wrong" block. Never a raw stack trace or a bare
 * red line of text — always a plain-language statement of what failed,
 * plus a way forward. `onRetry` covers the common case; pass `action` for
 * anything more specific ("Choose another option", "Continue manually").
 */
export function ErrorState({
  title = "Something went wrong.",
  description,
  onRetry,
  action,
  className = "",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-2 rounded-card border border-danger/25 bg-danger/5 px-6 py-8 text-center ${className}`}
    >
      <AlertTriangleIcon width={22} height={22} className="text-danger" />
      <p className="text-sm font-medium text-foreground/85">{title}</p>
      {description && <p className="max-w-sm text-sm text-foreground/60">{description}</p>}
      {(onRetry || action) && (
        <div className="mt-2 flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-pill bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Try again
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
