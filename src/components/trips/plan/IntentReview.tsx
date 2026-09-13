'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RemovableChip } from '@/components/ui/Chip';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { InlineNotice } from '@/components/ui/States';
import type { DestinationSummary, IntentExtraction, TripIntent } from '@/types/domain';
import { applyAmbiguity, intentChips, readiness } from './intent';

interface IntentReviewProps {
  intent: TripIntent;
  extraction: IntentExtraction | null;
  onChange: (intent: TripIntent) => void;
  answered: Record<string, true>;
  onAnswered: (field: string) => void;
  destinations: DestinationSummary[];
  onEditDetails: () => void;
  onStartOver: () => void;
  onBuild: () => void;
  building: boolean;
  signedIn: boolean;
}

export function IntentReview({
  intent,
  extraction,
  onChange,
  answered,
  onAnswered,
  destinations,
  onEditDetails,
  onStartOver,
  onBuild,
  building,
  signedIn,
}: IntentReviewProps) {
  const chips = intentChips(intent, extraction);
  const questions = (extraction?.ambiguities ?? []).filter((a) => !answered[a.field]);
  const { ready, missing } = readiness(intent);
  const [dates, setDates] = useState({ start: '', end: '' });

  return (
    <div className="grid gap-8">
      <section aria-labelledby="understood-title" className="grid gap-3">
        <p className="label text-[var(--text-subtle)]">Here’s what we understood</p>
        <h2 id="understood-title" className="text-[1.5rem] font-semibold tracking-[-0.02em]">
          Check this looks right
        </h2>
        {chips.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Details we picked out">
            {chips.map((chip) => (
              <li key={chip.id}>
                <RemovableChip
                  label={`${chip.kind}: ${chip.label}`}
                  source={chip.fromProfile ? 'from your profile' : undefined}
                  onRemove={() => onChange(chip.remove(intent))}
                  onEdit={onEditDetails}
                >
                  <span className="sr-only">{chip.kind}: </span>
                  {chip.label}
                </RemovableChip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--text-muted)]">We couldn’t pick out any details. Add them below or in the full form.</p>
        )}
      </section>

      {questions.length > 0 && (
        <section aria-labelledby="questions-title" className="grid gap-3">
          <h2 id="questions-title" className="text-[1.125rem] font-semibold">
            A few quick questions
          </h2>
          <ul className="grid gap-3">
            {questions.map((question) => (
              <li key={question.field} className="surface-card grid gap-3 p-4">
                <p className="font-medium">{question.question}</p>
                {question.options.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((option) => (
                      <Button
                        key={option.label}
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onChange(applyAmbiguity(intent, question, option.value));
                          onAnswered(question.field);
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => onAnswered(question.field)}>
                      Not sure yet
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Field label="From">
                      {(control) => <TextInput {...control} type="date" value={dates.start} onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))} />}
                    </Field>
                    <Field label="To">
                      {(control) => <TextInput {...control} type="date" min={dates.start || undefined} value={dates.end} onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))} />}
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="md"
                        disabled={!dates.start || !dates.end || dates.end < dates.start}
                        onClick={() => {
                          const days = Math.round((Date.parse(dates.end) - Date.parse(dates.start)) / 86_400_000) + 1;
                          onChange({ ...intent, startDate: dates.start, endDate: dates.end, days: intent.days ?? days });
                          onAnswered(question.field);
                        }}
                      >
                        Use dates
                      </Button>
                      <Button variant="ghost" size="md" onClick={() => onAnswered(question.field)}>
                        Flexible
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section aria-labelledby="missing-title" className="grid gap-3">
          <h2 id="missing-title" className="text-[1.125rem] font-semibold">
            Needed before we can plan
          </h2>
          <div className="surface-card grid gap-4 p-4 sm:grid-cols-2">
            {missing.includes('destination') && (
              <Field label="Where would you like to go?">
                {(control) => (
                  <Select
                    {...control}
                    value={intent.destinationId ?? ''}
                    onChange={(event) => {
                      const destination = destinations.find((d) => d.destinationId === event.target.value);
                      onChange({ ...intent, destinationId: destination?.destinationId ?? null, destination: destination?.name ?? null });
                    }}
                  >
                    <option value="">Choose a destination</option>
                    {destinations.map((d) => (
                      <option key={d.destinationId} value={d.destinationId}>
                        {d.name}, {d.state}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {missing.includes('duration') && (
              <Field label="How many days?" hint="Or add exact dates in the full form.">
                {(control) => (
                  <TextInput
                    {...control}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    value={intent.days ?? ''}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      onChange({ ...intent, days: Number.isFinite(value) && value >= 1 && value <= 30 ? value : null });
                    }}
                  />
                )}
              </Field>
            )}
          </div>
        </section>
      )}

      {!signedIn && ready && (
        <InlineNotice tone="info" title="Sign in to build and save this journey">
          Your details are kept on this device while you sign in.
        </InlineNotice>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-6">
        <Button variant="accent" size="lg" onClick={onBuild} disabled={!ready || questions.length > 0} loading={building}>
          {signedIn ? 'Build my itinerary' : 'Sign in to build my itinerary'}
        </Button>
        <Button variant="secondary" onClick={onEditDetails}>
          Edit all details
        </Button>
        <Button variant="ghost" onClick={onStartOver}>
          Start over
        </Button>
        {(!ready || questions.length > 0) && (
          <p className="w-full text-[0.875rem] text-[var(--text-muted)]">
            {questions.length > 0 ? 'Answer or skip the questions above to continue.' : 'Add a destination and how long you’re travelling to continue.'}
          </p>
        )}
      </div>
    </div>
  );
}
