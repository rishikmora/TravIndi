'use client';

import { type FormEvent, useId } from 'react';
import { Button } from '@/components/ui/Button';
import { Switch, TextArea } from '@/components/ui/Field';
import { SparkleIcon } from '@/components/ui/icons';
import { ErrorState } from '@/components/ui/States';

const EXAMPLES = [
  '4 days in Hyderabad with my parents — temples and food, not too much walking',
  'A relaxed long weekend in Jaipur for two, heritage and shopping, under ₹25,000',
  'A week in Kochi on my own, vegetarian food, avoid crowds',
];

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
        Tell us about your trip.
      </label>
      <p id={hintId} className="text-[var(--text-muted)]">
        Where, when, who’s coming, what you enjoy and anything to avoid. You’ll review everything before we plan.
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
          placeholder="e.g. 5 days in Kerala in December with two kids, beaches and backwaters"
          aria-describedby={`${hintId} ${countId}`}
          className="min-h-36 pb-8 text-[1.0625rem]"
        />
        <span id={countId} className="pointer-events-none absolute bottom-2.5 right-3.5 text-[0.75rem] text-[var(--text-subtle)]">
          {value.length}/{MAX}
          <span className="sr-only"> characters</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Example trip descriptions">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onChange(example)}
            className="rounded-full bg-[var(--tone-neutral-bg)] px-3 py-1.5 text-left text-[0.8125rem] text-[var(--text-muted)] transition-colors hover:bg-[var(--hairline)] hover:text-[var(--text)]"
          >
            “{example}”
          </button>
        ))}
      </div>

      {canUseProfile && (
        <Switch
          label="Use my saved preferences"
          description="Fills in food, pace, safety and access needs from your profile where your description doesn’t say."
          checked={useProfile}
          onChange={(event) => onUseProfileChange(event.target.checked)}
        />
      )}

      {Boolean(error) && <ErrorState error={error} context="trip.intent" compact politeness="assertive" onRetry={onSubmit} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="lg" loading={submitting} disabled={value.trim().length < 3}>
          {!submitting && <SparkleIcon size={18} />}
          {submitting ? 'Reading your trip…' : 'Understand my trip'}
        </Button>
        <p className="text-[0.8125rem] text-[var(--text-subtle)]">Processed by TravIndi’s planning service. Not shared with other travellers.</p>
      </div>
    </form>
  );
}
