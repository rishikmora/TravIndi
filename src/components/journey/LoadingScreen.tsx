'use client';

import { useEffect, useState } from 'react';
import { IndiaOutline } from '@/components/map/IndiaOutline';
import { useTranslation } from '@/i18n/react';
import { type LoadSteps, useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

const ROWS: Array<{ key: keyof LoadSteps }> = [{ key: 'models' }, { key: 'environment' }, { key: 'stories' }];

const MINIMUM_MS = 2600;
const WELCOME_MS = 1800;
const SAFETY_MS = 20000;

export function LoadingScreen() {
  const phase = useJourneyStore((s) => s.loadPhase);
  const steps = useJourneyStore((s) => s.loadSteps);
  const renderMode = useJourneyStore((s) => s.renderMode);
  const setLoadPhase = useJourneyStore((s) => s.setLoadPhase);
  const setLoadStep = useJourneyStore((s) => s.setLoadStep);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [removed, setRemoved] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const skip = new URLSearchParams(window.location.search).get('intro') === 'skip';
    const timer = window.setTimeout(() => setMinimumElapsed(true), skip ? 0 : MINIMUM_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const done = () => !cancelled && setLoadStep('stories', 1);
    if (document.fonts?.ready) document.fonts.ready.then(done, done);
    else done();
    return () => {
      cancelled = true;
    };
  }, [setLoadStep]);

  useEffect(() => {
    if (renderMode !== 'static') return;
    setLoadStep('models', 1);
    setLoadStep('environment', 1);
  }, [renderMode, setLoadStep]);

  // Never trap anyone behind the loader.
  useEffect(() => {
    const timer = window.setTimeout(() => ROWS.forEach((row) => setLoadStep(row.key, 1)), SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [setLoadStep]);

  const ready = minimumElapsed && ROWS.every((row) => steps[row.key] >= 1);

  useEffect(() => {
    if (ready && phase === 'loading') setLoadPhase('welcome');
  }, [ready, phase, setLoadPhase]);

  useEffect(() => {
    if (phase === 'welcome') {
      const timer = window.setTimeout(() => setLoadPhase('entered'), WELCOME_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'entered') {
      const timer = window.setTimeout(() => setRemoved(true), 1600);
      return () => window.clearTimeout(timer);
    }
  }, [phase, setLoadPhase]);

  if (removed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={phase === 'loading'}
      className={cn(
        'fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink text-paper transition-opacity duration-[1400ms] ease-cinematic',
        phase === 'entered' && 'pointer-events-none opacity-0',
      )}
    >
      <div
        className={cn(
          'w-[min(44vw,14rem)] text-saffron/80 transition-[opacity,transform] duration-[1200ms] ease-cinematic',
          phase !== 'loading' && 'scale-[0.96] opacity-40',
        )}
      >
        <IndiaOutline className="h-auto w-full" />
      </div>

      <div className="relative mt-10 h-9 w-full overflow-hidden text-center">
        <p
          className={cn(
            'editorial absolute inset-0 text-[1.65rem] italic transition-[opacity,transform] duration-700 ease-cinematic',
            phase === 'loading' ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0',
          )}
        >
          {t('journey.loading.preparing')}
        </p>
        <p
          className={cn(
            'editorial absolute inset-0 text-[1.65rem] italic transition-[opacity,transform] duration-700 ease-cinematic',
            phase === 'loading' ? 'translate-y-6 opacity-0' : 'translate-y-0 opacity-100',
          )}
        >
          {t('journey.loading.welcome')}
        </p>
      </div>

      <ul
        className={cn(
          'mt-8 grid w-[min(80vw,18.5rem)] gap-3.5 transition-opacity duration-700',
          phase !== 'loading' && 'opacity-0',
        )}
      >
        {ROWS.map((row) => {
          const done = steps[row.key] >= 1;
          return (
            <li key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5">
              <span className="label text-paper/55">{t(`journey.loading.${row.key}`)}</span>
              <span className={cn('label transition-colors duration-500', done ? 'text-paper/85' : 'text-paper/30')}>
                {done ? t('journey.loading.ready') : t('journey.loading.loading')}
              </span>
              <span className="col-span-2 block h-px overflow-hidden bg-paper/10">
                <span
                  className={cn(
                    'block h-full bg-saffron transition-[width] duration-[900ms] ease-cinematic',
                    done ? 'w-full' : 'loading-bar w-1/3',
                  )}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
