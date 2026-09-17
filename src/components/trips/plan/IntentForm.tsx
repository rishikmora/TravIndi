'use client';

import { useId } from 'react';
import { regionLabel } from '@/components/destinations/labels';
import { ToggleChip } from '@/components/ui/Chip';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LOCALE_INFO } from '@/i18n/config';
import { useTranslation } from '@/i18n/react';
import type { AccommodationPreference, DietaryPreference, TransportMode, TripType } from '@/types/api';
import type { AccessibilityNeeds, DestinationSummary, Travellers, TripIntent } from '@/types/domain';
import { ACCOMMODATION_LABEL, AVOID_OPTIONS, DIET_LABEL, INTEREST_OPTIONS, interestLabel, TRANSPORT_LABEL, TRIP_TYPE_LABEL } from './intent';

const NO_ACCESS: AccessibilityNeeds = { lowWalking: false, wheelchair: false, stepFreeAccess: false, hearingSupport: false, visualSupport: false, notes: null };
const NO_TRAVELLERS: Travellers = { adults: 1, children: 0, seniors: 0 };

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = useId();
  const { t, locale } = useTranslation();
  const lower = label.toLocaleLowerCase(LOCALE_INFO[locale].htmlLang);
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="font-medium">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex items-center gap-1 rounded-full p-1 ring-1 ring-inset ring-[var(--hairline-strong)]">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t('planner.form.fewer', { label: lower })} className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[var(--tone-neutral-bg)] disabled:opacity-40">
          <MinusIcon size={16} />
        </button>
        <output aria-live="polite" className="w-8 text-center font-semibold tabular-nums">
          {value}
        </output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t('planner.form.more', { label: lower })} className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[var(--tone-neutral-bg)] disabled:opacity-40">
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  );
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="surface-card grid gap-5 p-5">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true" className="grid gap-0.5">
        <p className="text-[1.0625rem] font-semibold">{title}</p>
        {description && <p className="text-[0.875rem] text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

const toggle = <T extends string>(list: T[] | undefined, value: T) => ((list ?? []).includes(value) ? (list ?? []).filter((v) => v !== value) : [...(list ?? []), value]);

/** The full structured trip form. Every field is optional except where and how long, which are needed to plan. */
export function IntentForm({ intent, onChange, destinations }: { intent: TripIntent; onChange: (intent: TripIntent) => void; destinations: DestinationSummary[] }) {
  const { t } = useTranslation();
  const set = (patch: Partial<TripIntent>) => onChange({ ...intent, ...patch });
  const travellers = intent.travellers ?? NO_TRAVELLERS;
  const access = intent.accessibility ?? NO_ACCESS;
  const regions = [...new Set(destinations.map((d) => d.region))];

  return (
    <div className="grid gap-5">
      <Group title={t('planner.form.whereWhen.title')} description={t('planner.form.whereWhen.description')}>
        <Field label={t('planner.form.destination')}>
          {(control) => (
            <Select
              {...control}
              value={intent.destinationId ?? ''}
              onChange={(event) => {
                const destination = destinations.find((d) => d.destinationId === event.target.value);
                set({ destinationId: destination?.destinationId ?? null, destination: destination?.name ?? null });
              }}
            >
              <option value="">{t('planner.form.chooseDestination')}</option>
              {regions.map((region) => (
                <optgroup key={region} label={regionLabel(t, region)}>
                  {destinations
                    .filter((d) => d.region === region)
                    .map((d) => (
                      <option key={d.destinationId} value={d.destinationId}>
                        {d.name}, {d.state}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('planner.form.startDate')} optional>
            {(control) => <TextInput {...control} type="date" value={intent.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} />}
          </Field>
          <Field label={t('planner.form.endDate')} optional>
            {(control) => <TextInput {...control} type="date" min={intent.startDate ?? undefined} value={intent.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} />}
          </Field>
          <Field label={t('planner.form.days')}>
            {(control) => (
              <TextInput
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                value={intent.days ?? ''}
                onChange={(e) => {
                  const days = Number(e.target.value);
                  set({ days: Number.isFinite(days) && days >= 1 && days <= 30 ? days : null });
                }}
              />
            )}
          </Field>
        </div>
      </Group>

      <Group title={t('planner.form.who.title')}>
        <Stepper label={t('planner.form.adults')} value={travellers.adults} min={0} max={20} onChange={(adults) => set({ travellers: { ...travellers, adults } })} />
        <Stepper label={t('planner.form.seniors')} value={travellers.seniors} min={0} max={20} onChange={(seniors) => set({ travellers: { ...travellers, seniors } })} />
        <Stepper label={t('planner.form.children')} value={travellers.children} min={0} max={20} onChange={(children) => set({ travellers: { ...travellers, children } })} />
        <Field label={t('planner.form.tripType')} optional>
          {(control) => (
            <Select {...control} value={intent.tripType ?? ''} onChange={(e) => set({ tripType: (e.target.value || null) as TripType | null })}>
              <option value="">{t('planner.form.notSpecified')}</option>
              {Object.entries(TRIP_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Group>

      <Group title={t('planner.form.style.title')}>
        <div className="grid gap-2">
          <p className="font-medium" id="pace-label">
            {t('planner.form.pace')}
          </p>
          <SegmentedControl
            label={t('planner.form.pace')}
            value={intent.pace ?? 'balanced'}
            onChange={(pace) => set({ pace })}
            options={[
              { value: 'relaxed', label: t('planner.form.paceOptions.relaxed') },
              { value: 'balanced', label: t('planner.form.paceOptions.balanced') },
              { value: 'active', label: t('planner.form.paceOptions.active') },
            ]}
          />
        </div>
        <div className="grid gap-2" role="group" aria-label={t('planner.form.interests')}>
          <p className="font-medium">{t('planner.form.interests')}</p>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((interest) => (
              <ToggleChip key={interest} selected={(intent.interests ?? []).includes(interest)} onToggle={() => set({ interests: toggle(intent.interests, interest) })}>
                {interestLabel(interest)}
              </ToggleChip>
            ))}
          </div>
        </div>
        <div className="grid gap-2" role="group" aria-label={t('planner.form.avoidLabel')}>
          <p className="font-medium">{t('planner.form.avoid')}</p>
          <div className="flex flex-wrap gap-2">
            {AVOID_OPTIONS.map((option) => (
              <ToggleChip key={option.value} selected={(intent.avoid ?? []).includes(option.value)} onToggle={() => set({ avoid: toggle(intent.avoid, option.value) })}>
                {option.label}
              </ToggleChip>
            ))}
          </div>
        </div>
      </Group>

      <Group title={t('planner.form.access.title')} description={t('planner.form.access.description')}>
        <div className="grid gap-3">
          <Checkbox label={t('planner.form.lowWalking')} checked={access.lowWalking} onChange={(e) => set({ accessibility: { ...access, lowWalking: e.target.checked } })} />
          <Checkbox label={t('planner.form.wheelchair')} checked={access.wheelchair} onChange={(e) => set({ accessibility: { ...access, wheelchair: e.target.checked } })} />
          <Checkbox label={t('planner.form.stepFree')} checked={access.stepFreeAccess} onChange={(e) => set({ accessibility: { ...access, stepFreeAccess: e.target.checked } })} />
        </div>
        <div className="grid gap-2">
          <p className="font-medium">{t('planner.form.safety')}</p>
          <SegmentedControl
            label={t('planner.form.safety')}
            value={intent.safetyPreference ?? 'standard'}
            onChange={(safetyPreference) => set({ safetyPreference })}
            options={[
              { value: 'standard', label: t('planner.form.safetyOptions.standard') },
              { value: 'high', label: t('planner.form.safetyOptions.high') },
              { value: 'maximum', label: t('planner.form.safetyOptions.maximum') },
            ]}
          />
        </div>
        <Field label={t('planner.form.food')} optional>
          {(control) => (
            <Select
              {...control}
              value={intent.food?.diet ?? ''}
              onChange={(e) =>
                set({
                  food: e.target.value
                    ? { diet: e.target.value as DietaryPreference, spiceTolerance: intent.food?.spiceTolerance ?? null, allergies: intent.food?.allergies ?? [], interests: intent.food?.interests ?? [] }
                    : null,
                })
              }
            >
              <option value="">{t('planner.form.notSpecified')}</option>
              {Object.entries(DIET_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Group>

      <Group title={t('planner.form.budget.title')} description={t('planner.form.budget.description')}>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label={t('planner.form.budgetAmount')} optional hint={t('planner.form.budgetHint')}>
            {(control) => (
              <TextInput
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                value={intent.budget?.ceiling ? intent.budget.ceiling.amountMinor / 100 : ''}
                onChange={(e) => {
                  const rupees = Number(e.target.value);
                  set({
                    budget: e.target.value && rupees > 0 ? { ceiling: { amountMinor: Math.round(rupees * 100), currency: 'INR' }, level: null, per: intent.budget?.per ?? 'trip' } : null,
                  });
                }}
              />
            )}
          </Field>
          <Field label={t('planner.form.per')}>
            {(control) => (
              <Select {...control} value={intent.budget?.per ?? 'trip'} disabled={!intent.budget} onChange={(e) => intent.budget && set({ budget: { ...intent.budget, per: e.target.value as 'trip' | 'day' | 'person' } })}>
                <option value="trip">{t('planner.form.perOptions.trip')}</option>
                <option value="day">{t('planner.form.perOptions.day')}</option>
                <option value="person">{t('planner.form.perOptions.person')}</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-2" role="group" aria-label={t('planner.form.gettingAround')}>
          <p className="font-medium">{t('planner.form.gettingAround')}</p>
          <div className="flex flex-wrap gap-2">
            {(['taxi', 'auto_rickshaw', 'metro', 'train', 'car', 'flight'] as TransportMode[]).map((mode) => (
              <ToggleChip key={mode} selected={(intent.transport ?? []).includes(mode)} onToggle={() => set({ transport: toggle(intent.transport, mode) })}>
                {TRANSPORT_LABEL[mode]}
              </ToggleChip>
            ))}
          </div>
        </div>
        <Field label={t('planner.form.stay')} optional>
          {(control) => (
            <Select {...control} value={intent.accommodation ?? ''} onChange={(e) => set({ accommodation: (e.target.value || null) as AccommodationPreference | null })}>
              <option value="">{t('planner.form.notSpecified')}</option>
              {Object.entries(ACCOMMODATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Checkbox
          label={t('planner.form.verifiedOnly')}
          checked={intent.bookingPreferences?.verifiedProvidersOnly ?? false}
          onChange={(e) =>
            set({
              bookingPreferences: {
                bookThroughTravindi: intent.bookingPreferences?.bookThroughTravindi ?? true,
                verifiedProvidersOnly: e.target.checked,
                freeCancellationPreferred: intent.bookingPreferences?.freeCancellationPreferred ?? false,
              },
            })
          }
        />
      </Group>

      <Field label={t('planner.form.notes')} optional>
        {(control) => <TextArea {...control} maxLength={1000} value={intent.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />}
      </Field>
    </div>
  );
}
