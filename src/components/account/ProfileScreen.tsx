'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { ACCOMMODATION_LABEL, DIET_LABEL, INTEREST_OPTIONS, TRANSPORT_LABEL } from '@/components/trips/plan/intent';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ToggleChip } from '@/components/ui/Chip';
import { Checkbox, Field, Select, Switch, TextArea, TextInput } from '@/components/ui/Field';
import { ChartIcon, ChevronRightIcon, LogOutIcon, SettingsIcon, ShieldCheckIcon, TicketIcon, UsersIcon } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { useProfile, useUpdateProfile } from '@/lib/query/hooks/profile';
import { toast } from '@/lib/ui/toast';
import type { AccommodationPreference, DietaryPreference, TransportMode } from '@/types/api';
import type { Profile } from '@/types/domain';

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card grid gap-5 p-5 md:p-6">
      <div className="grid gap-0.5">
        <h2 className="text-[1.125rem] font-semibold">{title}</h2>
        {description && <p className="text-[0.875rem] text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function ProfileEditor() {
  const router = useRouter();
  const { user, logout, hasRole } = useAuth();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [languages, setLanguages] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<Profile | null>(null);

  // Start editing from the latest saved profile whenever it changes.
  if (profile.data && profile.data !== loadedProfile) {
    setLoadedProfile(profile.data);
    setDraft(profile.data);
    setLanguages(profile.data.languages.join(', '));
  }

  const saved = profile.data;
  if (!saved || !draft) {
    return profile.isError ? (
      <ErrorState error={profile.error} context="profile.save" onRetry={() => void profile.refetch()} />
    ) : (
      <LoadingBlock label="Loading your profile" className="grid gap-4">
        <Skeleton className="h-28 w-full rounded-[1.25rem]" />
        <Skeleton className="h-64 w-full rounded-[1.25rem]" />
      </LoadingBlock>
    );
  }

  const parsedLanguages = languages.split(',').map((l) => l.trim()).filter(Boolean);
  const dirty = JSON.stringify({ ...draft, languages: parsedLanguages }) !== JSON.stringify(saved);
  const fieldErrors = isApiError(update.error) ? update.error.fieldErrors : {};
  const travel = draft.travelPreferences;
  const set = (patch: Partial<Profile>) => setDraft({ ...draft, ...patch });

  const save = () =>
    update.mutate(
      {
        displayName: draft.displayName,
        homeCity: draft.homeCity,
        languages: parsedLanguages,
        travelPreferences: draft.travelPreferences,
        accessibility: draft.accessibility,
        safetyPreferences: draft.safetyPreferences,
      },
      { onSuccess: () => toast.success('Profile saved') },
    );

  const links = [
    { href: '/bookings', label: 'Bookings and tickets', icon: TicketIcon },
    { href: '/trusted-contacts', label: 'Trusted contacts', icon: UsersIcon },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
    { href: '/consents', label: 'Privacy & consents', icon: ShieldCheckIcon },
    ...(hasRole('guide') || hasRole('business') ? [{ href: '/partner', label: 'Partner portal', icon: ChartIcon }] : []),
    ...(hasRole('authority') ? [{ href: '/authority', label: 'Authority dashboard', icon: ChartIcon }] : []),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 content-start gap-6">
        <Card title="About you">
          <div className="flex items-center gap-4">
            <Avatar name={draft.displayName} size="lg" decorative />
            <div className="grid">
              <span className="text-[1.25rem] font-semibold">{saved.displayName}</span>
              <span className="text-[var(--text-muted)]">{draft.email}</span>
              {draft.phoneMasked && <span className="text-[0.875rem] text-[var(--text-muted)]">{draft.phoneMasked}</span>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={fieldErrors.displayName}>
              {(control) => <TextInput {...control} autoComplete="name" value={draft.displayName} onChange={(e) => set({ displayName: e.target.value })} />}
            </Field>
            <Field label="Home city" optional error={fieldErrors.homeCity}>
              {(control) => <TextInput {...control} value={draft.homeCity ?? ''} onChange={(e) => set({ homeCity: e.target.value || null })} />}
            </Field>
            <Field label="Languages you speak" hint="Separate with commas." error={fieldErrors.languages} className="sm:col-span-2">
              {(control) => <TextInput {...control} value={languages} onChange={(e) => setLanguages(e.target.value)} />}
            </Field>
          </div>
        </Card>

        <Card title="Travel preferences" description="Used to fill in new trips when you choose to — never applied without showing you.">
          <div className="grid gap-2">
            <p className="font-medium">Pace</p>
            <SegmentedControl
              label="Pace"
              value={travel.pace ?? 'balanced'}
              onChange={(pace) => set({ travelPreferences: { ...travel, pace } })}
              options={[
                { value: 'relaxed', label: 'Relaxed' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'active', label: 'Full days' },
              ]}
            />
          </div>
          <div className="grid gap-2" role="group" aria-label="Interests">
            <p className="font-medium">Interests</p>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((interest) => (
                <ToggleChip key={interest} selected={travel.interests.includes(interest)} onToggle={() => set({ travelPreferences: { ...travel, interests: toggle(travel.interests, interest) } })}>
                  {interest[0]!.toUpperCase() + interest.slice(1)}
                </ToggleChip>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Food preference">
              {(control) => (
                <Select
                  {...control}
                  value={travel.food?.diet ?? ''}
                  onChange={(e) =>
                    set({
                      travelPreferences: {
                        ...travel,
                        food: e.target.value ? { diet: e.target.value as DietaryPreference, spiceTolerance: travel.food?.spiceTolerance ?? null, allergies: travel.food?.allergies ?? [], interests: travel.food?.interests ?? [] } : null,
                      },
                    })
                  }
                >
                  <option value="">Not specified</option>
                  {Object.entries(DIET_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Where you like to stay">
              {(control) => (
                <Select {...control} value={travel.accommodation ?? ''} onChange={(e) => set({ travelPreferences: { ...travel, accommodation: (e.target.value || null) as AccommodationPreference | null } })}>
                  <option value="">Not specified</option>
                  {Object.entries(ACCOMMODATION_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="grid gap-2" role="group" aria-label="Getting around">
            <p className="font-medium">Getting around</p>
            <div className="flex flex-wrap gap-2">
              {(['taxi', 'auto_rickshaw', 'metro', 'train', 'car', 'flight'] as TransportMode[]).map((mode) => (
                <ToggleChip key={mode} selected={travel.transport.includes(mode)} onToggle={() => set({ travelPreferences: { ...travel, transport: toggle(travel.transport, mode) } })}>
                  {TRANSPORT_LABEL[mode]}
                </ToggleChip>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Access needs" description="Shared with the planner so places and pace suit you.">
          <div className="grid gap-3">
            <Checkbox label="Keep walking to a minimum" checked={draft.accessibility.lowWalking} onChange={(e) => set({ accessibility: { ...draft.accessibility, lowWalking: e.target.checked } })} />
            <Checkbox label="Wheelchair user" checked={draft.accessibility.wheelchair} onChange={(e) => set({ accessibility: { ...draft.accessibility, wheelchair: e.target.checked } })} />
            <Checkbox label="Prefer step-free places" checked={draft.accessibility.stepFreeAccess} onChange={(e) => set({ accessibility: { ...draft.accessibility, stepFreeAccess: e.target.checked } })} />
            <Checkbox label="Hearing support" checked={draft.accessibility.hearingSupport} onChange={(e) => set({ accessibility: { ...draft.accessibility, hearingSupport: e.target.checked } })} />
            <Checkbox label="Visual support" checked={draft.accessibility.visualSupport} onChange={(e) => set({ accessibility: { ...draft.accessibility, visualSupport: e.target.checked } })} />
          </div>
          <Field label="Anything else" optional>
            {(control) => <TextArea {...control} maxLength={500} value={draft.accessibility.notes ?? ''} onChange={(e) => set({ accessibility: { ...draft.accessibility, notes: e.target.value || null } })} />}
          </Field>
        </Card>

        <Card title="Safety preferences">
          <div className="grid gap-2">
            <p className="font-medium">How careful should plans be?</p>
            <SegmentedControl
              label="Safety preference"
              value={draft.safetyPreferences.preference}
              onChange={(preference) => set({ safetyPreferences: { ...draft.safetyPreferences, preference } })}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'high', label: 'Extra care' },
                { value: 'maximum', label: 'Maximum' },
              ]}
            />
          </div>
          <Switch
            label="Check-in reminders"
            description="Suggest a check-in when you’re out late or far from your stay."
            checked={draft.safetyPreferences.checkInReminders}
            onChange={(e) => set({ safetyPreferences: { ...draft.safetyPreferences, checkInReminders: e.target.checked } })}
          />
          <Field label="Default length for location sharing">
            {(control) => (
              <Select
                {...control}
                value={String(draft.safetyPreferences.defaultShareDurationMinutes ?? 60)}
                onChange={(e) => set({ safetyPreferences: { ...draft.safetyPreferences, defaultShareDurationMinutes: Number(e.target.value) } })}
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
              </Select>
            )}
          </Field>
        </Card>

        {update.error && !Object.keys(fieldErrors).length ? <ErrorState error={update.error} context="profile.save" compact politeness="assertive" /> : null}

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 rounded-full bg-[var(--surface-raised)]/95 p-2 shadow-lg ring-1 ring-[var(--hairline)] backdrop-blur lg:bottom-4">
          <Button variant="navy" onClick={save} loading={update.isPending} disabled={!dirty}>
            Save changes
          </Button>
          <Button
            variant="ghost"
            disabled={!dirty || update.isPending}
            onClick={() => {
              setDraft(saved);
              setLanguages(saved.languages.join(', '));
            }}
          >
            Discard
          </Button>
          <span className="px-2 text-[0.875rem] text-[var(--text-muted)]">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <nav aria-label="Account" className="surface-card divide-y divide-[var(--hairline)] overflow-hidden">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="flex items-center gap-3 p-4 hover:bg-[var(--surface-sunken)]">
              <link.icon size={20} className="text-[var(--tone-accent-fg)]" />
              <span className="flex-1 font-medium">{link.label}</span>
              <ChevronRightIcon size={18} className="text-[var(--text-subtle)]" />
            </Link>
          ))}
        </nav>
        <Button
          variant="secondary"
          loading={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await logout();
            router.push('/');
          }}
        >
          <LogOutIcon size={18} />
          Sign out{user ? ` of ${user.email}` : ''}
        </Button>
        <p className="text-[0.8125rem] text-[var(--text-muted)]">Signing out also removes trips and drafts saved on this device.</p>
      </aside>
    </div>
  );
}

export function ProfileScreen() {
  return (
    <PageShell width="wide">
      <PageHeader eyebrow="Profile" title="Your profile" description="Preferences that shape your journeys. You can change them at any time." />
      <RequireAuth>
        <ProfileEditor />
      </RequireAuth>
    </PageShell>
  );
}
