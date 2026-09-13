'use client';

import { Canvas } from '@react-three/fiber';
import { Component, type ReactNode, type RefObject, useCallback, useState } from 'react';
import { CinematicCamera } from '@/3d/camera/CinematicCamera';
import { EnvironmentController } from '@/3d/environment/EnvironmentController';
import { Sky } from '@/3d/environment/Sky';
import { PostStack } from '@/3d/post/PostStack';
import { ParticleLayers } from '@/3d/systems/particles/ParticleLayers';
import { SetManager } from '@/scenes/SetManager';
import { useJourneyStore } from '@/store/journey';
import { useQualityStore } from '@/store/quality';
import { FrameDriver } from './FrameDriver';
import { QualityGovernor } from './QualityGovernor';

class StageBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface StageProps {
  eventSource: RefObject<HTMLElement | null>;
}

/**
 * The single WebGL canvas behind the journey. Fixed to the viewport; the
 * scrolling copy is layered above it and forwards pointer events into it.
 *
 * If rendering fails, the stage first retries at the lowest quality preset
 * (dropping every optional effect); only a second failure falls back to the
 * static journey. A broken canvas is never left on screen.
 */
export default function Stage({ eventSource }: StageProps) {
  const settings = useQualityStore((s) => s.settings);
  const setRenderMode = useJourneyStore((s) => s.setRenderMode);
  const [attempt, setAttempt] = useState(0);

  const fail = useCallback(
    (reason: string, error?: unknown) => {
      if (process.env.NODE_ENV !== 'production') console.error('[stage]', reason, error);
      if (attempt === 0 && reason !== 'context-lost') {
        const quality = useQualityStore.getState();
        quality.setLevel('low', 'fallback');
        quality.lock();
        setAttempt(1);
        return;
      }
      setRenderMode('static', reason);
    },
    [attempt, setRenderMode],
  );

  return (
    <div className="pointer-events-none fixed inset-0 h-lvh w-full" aria-hidden="true">
      <StageBoundary key={attempt} onError={(error) => fail('render-error', error)}>
        <Canvas
          frameloop="never"
          dpr={settings.dpr}
          shadows={settings.shadows ? 'percentage' : false}
          gl={{
            antialias: false,
            alpha: false,
            stencil: false,
            depth: true,
            powerPreference: 'high-performance',
          }}
          camera={{ fov: 38, near: 2, far: 26000, position: [-80, 820, 2650] }}
          eventSource={eventSource as RefObject<HTMLElement>}
          eventPrefix="client"
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 1);
            const canvas = gl.domElement;
            let timer: number | undefined;
            canvas.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              timer = window.setTimeout(() => fail('context-lost'), 2500);
            });
            canvas.addEventListener('webglcontextrestored', () => window.clearTimeout(timer));
          }}
        >
          <FrameDriver />
          <QualityGovernor />
          <CinematicCamera />
          <EnvironmentController />
          <Sky />
          <SetManager />
          <ParticleLayers />
          <PostStack />
        </Canvas>
      </StageBoundary>
    </div>
  );
}
