import { cn } from '@/utils/cn';

/**
 * TravIndi mark: a route circling a destination, with a single saffron point
 * travelling the gap — the journey that adapts as it goes.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <circle
        cx="16"
        cy="16"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeDasharray="56 13.1"
        strokeLinecap="round"
        transform="rotate(-62 16 16)"
      />
      <circle cx="16" cy="16" r="3.1" fill="currentColor" />
      <circle cx="14.9" cy="5.1" r="2.3" fill="#E8A04B" />
    </svg>
  );
}
