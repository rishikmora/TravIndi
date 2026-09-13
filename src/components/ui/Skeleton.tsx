import { cn } from '@/utils/cn';

/** Placeholder shape while content loads. Hidden from assistive technology. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-[pulse-soft_1.8s_ease-in-out_infinite] rounded-lg bg-[var(--hairline)]', className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('grid gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

/** A labelled loading region: skeletons for sighted users, a status message for screen readers. */
export function LoadingBlock({ label, className, children }: { label: string; className?: string; children?: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children ?? <SkeletonText />}
    </div>
  );
}
