import { INDIA_MAP_LITE, INDIA_VIEWBOX } from '@/data/generated/india-map';

interface IndiaOutlineProps {
  className?: string;
  /** Animate each state's border drawing itself in. */
  draw?: boolean;
  strokeWidth?: number;
}

export function IndiaOutline({ className, draw = true, strokeWidth = 0.8 }: IndiaOutlineProps) {
  return (
    <svg viewBox={INDIA_VIEWBOX} className={className} aria-hidden="true" focusable="false" fill="none">
      {INDIA_MAP_LITE.map((region, i) => (
        <path
          key={region.id}
          d={region.d}
          pathLength={1}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={draw ? 'outline-draw' : undefined}
          style={draw ? { animationDelay: `${120 + i * 38}ms` } : undefined}
        />
      ))}
    </svg>
  );
}
