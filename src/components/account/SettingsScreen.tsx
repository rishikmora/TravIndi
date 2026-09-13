'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Field';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/lib/auth/provider';
import { useCapabilities } from '@/lib/capabilities/useCapabilities';
import { isMockMode } from '@/lib/config/env';
import { clearDeviceData } from '@/lib/offline/db';
import { useProfile, useUpdateProfile } from '@/lib/query/hooks/profile';
import { toast } from '@/lib/ui/toast';
import type { NotificationPreferences } from '@/types/domain';
import { DisplayPreferences } from './DisplayPreferences';

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

const CATEGORIES: Array<{ key: keyof Omit<NotificationPreferences, 'channels'>; label: string; description: string }> = [
  { key: 'safety', label: 'Safety', description: 'Advisories and location sharing. Critical alerts always appear in the app.' },
  { key: 'trips', label: 'Trips', description: 'Travel updates and itinerary changes.' },
  { key: 'messages', label: 'Messages', description: 'New messages in your conversations.' },
  { key: 'bookings', label: 'Bookings', description: 'Confirmations, payments pending and changes.' },
  { key: 'community', label: 'Community', description: 'Replies and tips for places you’re visiting.' },
];

function NotificationSettings() {
  const { capabilities } = useCapabilities();
  const profile = useProfile();
  const update = useUpdateProfile();

  if (profile.isPending) return <SkeletonText lines={4} />;
  if (profile.isError) return <ErrorState error={profile.error} compact onRetry={() => void profile.refetch()} />;

  const prefs = profile.data.notificationPreferences;
  const save = (patch: Partial<NotificationPreferences>) => update.mutate({ notificationPreferences: { ...prefs, ...patch } });
  const hasChannel = (channel: NotificationPreferences['channels'][number]) => prefs.channels.includes(channel);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        {CATEGORIES.map((category) => (
          <Switch
            key={category.key}
            label={category.label}
            description={category.description}
            checked={prefs[category.key]}
            disabled={update.isPending}
            onChange={(e) => save({ [category.key]: e.target.checked })}
          />
        ))}
      </div>
      <div className="grid gap-3 border-t border-[var(--hairline)] pt-5">
        <p className="font-medium">How we reach you</p>
        <div className="flex items-center justify-between gap-3">
          <span>In the app</span>
          <StatusPill tone="success">Always on</StatusPill>
        </div>
        <Switch
          label="Email"
          checked={hasChannel('email')}
          disabled={update.isPending}
          onChange={(e) => save({ channels: e.target.checked ? [...new Set([...prefs.channels, 'email' as const])] : prefs.channels.filter((c) => c !== 'email') })}
        />
        <div className="flex items-center justify-between gap-3 text-[var(--text-muted)]">
          <span>Push notifications</span>
          <StatusPill>{capabilities.push ? 'Available' : 'Not available yet'}</StatusPill>
        </div>
        <div className="flex items-center justify-between gap-3 text-[var(--text-muted)]">
          <span>SMS</span>
          <StatusPill>{capabilities.sms ? 'Available' : 'Not available yet'}</StatusPill>
        </div>
      </div>
      {update.error ? <ErrorState error={update.error} context="profile.save" compact /> : null}
    </div>
  );
}

export function SettingsScreen() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <PageShell width="narrow">
      <PageHeader eyebrow="Settings" title="Settings" />
      <div className="grid gap-6">
        <Card title="Display and accessibility" description="Saved on this device.">
          <DisplayPreferences />
        </Card>

        {status === 'authenticated' ? (
          <Card title="Notifications" description="Saved to your account.">
            <NotificationSettings />
          </Card>
        ) : (
          <InlineNotice tone="info" title="Sign in to manage notifications">Notification choices are saved to your account.</InlineNotice>
        )}

        <Card title="Data on this device" description="Trips, drafts and saved actions kept for offline use.">
          <p className="text-[0.9375rem] text-[var(--text-muted)]">
            Clearing removes offline copies and unsent drafts from this browser. Anything already saved to your account stays in your account.
          </p>
          <Button variant="secondary" className="justify-self-start" onClick={() => setConfirmClear(true)}>
            Clear data on this device
          </Button>
          {isMockMode && <p className="text-[0.8125rem] text-[var(--text-muted)]">Sample data is served by the development backend and can be reset from the Sample data panel.</p>}
        </Card>
      </div>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear data on this device?"
        description="Unsent drafts and actions waiting for a connection will be removed and can’t be recovered."
        dismissible={!clearing}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={clearing}
              onClick={async () => {
                setClearing(true);
                await clearDeviceData();
                await queryClient.invalidateQueries();
                setClearing(false);
                setConfirmClear(false);
                toast.success('Data on this device cleared');
              }}
            >
              Clear data
            </Button>
          </>
        }
      />
    </PageShell>
  );
}
