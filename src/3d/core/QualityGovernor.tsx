'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useQualityStore } from '@/store/quality';

/**
 * Keeps the journey at the display's refresh rate by trading render
 * resolution only. Geometry, textures and effects are chosen once for the
 * device and never rebuilt mid-scroll — a rebuild is a guaranteed stutter,
 * while a small resolution change is invisible.
 */
export function QualityGovernor() {
  const setDpr = useThree((s) => s.setDpr);
  const [minDpr, maxDpr] = useQualityStore((s) => s.settings.dpr);
  const setFps = useQualityStore((s) => s.setFps);
  const mobile = useQualityStore((s) => s.profile?.isMobile ?? false);

  const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const ceiling = Math.min(maxDpr, device);
  const floor = Math.min(ceiling, Math.max(0.6, minDpr * 0.75));

  return (
    <PerformanceMonitor
      ms={250}
      iterations={8}
      threshold={0.75}
      step={0.1}
      factor={1}
      flipflops={Infinity}
      bounds={(refresh) => {
        const target = mobile ? Math.min(refresh, 60) : refresh;
        return [target * 0.92, target * 0.985];
      }}
      onChange={({ fps, factor }) => {
        setFps(Math.round(fps));
        setDpr(Math.round((floor + (ceiling - floor) * factor) * 100) / 100);
      }}
    />
  );
}
