'use client';

import { type FormEvent, useId } from 'react';
import { Button } from '@/components/ui/Button';
import { Switch, TextArea } from '@/components/ui/Field';
import { SparkleIcon } from '@/components/ui/icons';
import { ErrorState } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';

const EXAMPLES = ['parents', 'weekend', 'solo'] as const;

const MAX = 1000;

interface IntentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: unknown;
  /** Offered only when the traveller is signed in and has allowed personalised planning. */
  canUseProfile: boolean;
  useProfile: boolean;
  onUseProfileChange: (value: boolean) => void;
}

export function IntentComposer({ value, onChange, onSubmit, submitting, error, canUseProfile, useProfile, onUseProfileChange }: IntentComposerProps) {
  const { t } = useTranslation();
  const id = useId();
  const countId = `${id}-count`;
  const hintId = `${id}-hint`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim().length >= 3) onSubmit();
  };

  return (
    <form onSubmit={submit} className="grid gap-4" aria-busy={submitting || undefined}>
      <label htmlFor={id} className="editorial text-[clamp(1.75rem,4vw,2.5rem)] italic leading-tight">
        {t('planner.composer.label')}
      </label>
      <p id={hintId} className="text-[var(--text-muted)]">
        {t('planner.composer.hint')}
      </p>
      <div className="relative">
        <TextArea
          id={id}
          value={value}
          maxLength={MAX}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
          }}
          placeholder={t('planner.composer.placeholder')}
          aria-describedby={`${hintId} ${countId}`}
          className="min-h-36 pb-8 text-[1.0625rem]"
        />
        <span id={countId} className="pointer-events-none absolute bottom-2.5 right-3.5 text-[0.75rem] text-[var(--text-subtle)]">
          {value.length}/{MAX}
          <span className="sr-only"> {t('planner.composer.characters')}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('planner.composer.examplesLabel')}>
        {EXAMPLES.map((key) => {
          const example = t(`planner.composer.examples.${key}`);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(example)}
              className="rounded-full bg-[var(--tone-neutral-bg)] px-3 py-1.5 text-left text-[0.8125rem] text-[var(--text-muted)] transition-colors hover:bg-[var(--hairline)] hover:text-[var(--text)]"
            >
              “{example}”
            </button>
          );
        })}
      </div>

      {canUseProfile && (
        <Switch
          label={t('planner.composer.useProfile')}
          description={t('planner.composer.useProfileDetail')}
          checked={useProfile}
          onChange={(event) => onUseProfileChange(event.target.checked)}
        />
      )}

      {Boolean(error) && <ErrorState error={error} context="trip.intent" compact politeness="assertive" onRetry={onSubmit} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="lg" loading={submitting} disabled={value.trim().length < 3}>
          {!submitting && <SparkleIcon size={18} />}
          {submitting ? t('planner.composer.reading') : t('planner.composer.understand')}
        </Button>
        <p className="text-[0.8125rem] text-[var(--text-subtle)]">{t('planner.composer.privacy')}</p>
      </div>
    </form>
  );
}
