'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RemovableChip } from '@/components/ui/Chip';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { InlineNotice } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';
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
  const { t } = useTranslation();
  const chips = intentChips(intent, extraction);
  const questions = (extraction?.ambiguities ?? []).filter((a) => !answered[a.field]);
  const { ready, missing } = readiness(intent);
  const [dates, setDates] = useState({ start: '', end: '' });

  return (
    <div className="grid gap-8">
      <section aria-labelledby="understood-title" className="grid gap-3">
        <p className="label text-[var(--text-subtle)]">{t('planner.review.eyebrow')}</p>
        <h2 id="understood-title" className="text-[1.5rem] font-semibold tracking-[-0.02em]">
          {t('planner.review.title')}
        </h2>
        {chips.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label={t('planner.review.detailsLabel')}>
            {chips.map((chip) => (
              <li key={chip.id}>
                <RemovableChip
                  label={t('planner.review.chipLabel', { kind: chip.kind, label: chip.label })}
                  source={chip.fromProfile ? t('planner.review.fromProfile') : undefined}
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
          <p className="text-[var(--text-muted)]">{t('planner.review.noneFound')}</p>
        )}
      </section>

      {questions.length > 0 && (
        <section aria-labelledby="questions-title" className="grid gap-3">
          <h2 id="questions-title" className="text-[1.125rem] font-semibold">
            {t('planner.review.questionsTitle')}
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
                      {t('planner.review.notSure')}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Field label={t('planner.review.from')}>
                      {(control) => <TextInput {...control} type="date" value={dates.start} onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))} />}
                    </Field>
                    <Field label={t('planner.review.to')}>
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
                        {t('planner.review.useDates')}
                      </Button>
                      <Button variant="ghost" size="md" onClick={() => onAnswered(question.field)}>
                        {t('planner.review.flexible')}
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
            {t('planner.review.missingTitle')}
          </h2>
          <div className="surface-card grid gap-4 p-4 sm:grid-cols-2">
            {missing.includes('destination') && (
              <Field label={t('planner.review.whereTo')}>
                {(control) => (
                  <Select
                    {...control}
                    value={intent.destinationId ?? ''}
                    onChange={(event) => {
                      const destination = destinations.find((d) => d.destinationId === event.target.value);
                      onChange({ ...intent, destinationId: destination?.destinationId ?? null, destination: destination?.name ?? null });
                    }}
                  >
                    <option value="">{t('planner.form.chooseDestination')}</option>
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
              <Field label={t('planner.review.howManyDays')} hint={t('planner.review.howManyDaysHint')}>
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
        <InlineNotice tone="info" title={t('planner.review.signInTitle')}>
          {t('planner.review.signInBody')}
        </InlineNotice>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-6">
        <Button variant="accent" size="lg" onClick={onBuild} disabled={!ready || questions.length > 0} loading={building}>
          {signedIn ? t('planner.review.build') : t('planner.review.signInToBuild')}
        </Button>
        <Button variant="secondary" onClick={onEditDetails}>
          {t('planner.review.editAll')}
        </Button>
        <Button variant="ghost" onClick={onStartOver}>
          {t('planner.review.startOver')}
        </Button>
        {(!ready || questions.length > 0) && (
          <p className="w-full text-[0.875rem] text-[var(--text-muted)]">
            {questions.length > 0 ? t('planner.review.answerQuestions') : t('planner.review.addRequired')}
          </p>
        )}
      </div>
    </div>
  );
}
