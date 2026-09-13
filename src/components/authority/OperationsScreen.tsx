'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Section } from '@/components/app/PageShell';
import { INCIDENT_CATEGORY, INCIDENT_SEVERITY, INCIDENT_STATUS } from '@/components/safety/vocabulary';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextArea } from '@/components/ui/Field';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill, type Tone } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { isApiError } from '@/lib/api/errors';
import { relativeTime } from '@/lib/format/freshness';
import { useAuthorityIncidents, useAuthorityOverview, useAuthoritySos, useIncidentAction, useSosAction } from '@/lib/query/hooks/authority';
import { toast } from '@/lib/ui/toast';
import type { AuthorityIncidentAction, AuthoritySosAction } from '@/types/api';
import type { AuthorityIncident, AuthoritySosItem } from '@/types/domain';

const SOS_STATUS: Record<AuthoritySosItem['status'], { label: string; tone: Tone }> = {
  received: { label: 'Received', tone: 'danger' },
  acknowledged: { label: 'Acknowledged', tone: 'warning' },
  responding: { label: 'Responding', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
  cancelled: { label: 'Cancelled by traveller', tone: 'neutral' },
};

const PRIORITY: Record<AuthoritySosItem['priority'], Tone> = { critical: 'danger', high: 'warning', normal: 'neutral' };
const ACTION_LABEL: Record<AuthoritySosAction, string> = { acknowledge: 'Acknowledge', mark_responding: 'Mark responding', resolve: 'Resolve' };
const INCIDENT_ACTION_LABEL: Record<AuthorityIncidentAction, string> = { verify: 'Verify', resolve: 'Resolve', dismiss: 'Dismiss' };

type Pending = { kind: 'sos'; item: AuthoritySosItem; action: AuthoritySosAction } | { kind: 'incident'; item: AuthorityIncident; action: AuthorityIncidentAction };

function Overview() {
  const overview = useAuthorityOverview();
  if (overview.isPending) return <Skeleton className="h-28 w-full rounded-[1.25rem]" />;
  if (overview.isError) return <ErrorState error={overview.error} compact onRetry={() => void overview.refetch()} />;
  const stats = [
    { label: 'Open SOS alerts', value: overview.data.openSos, urgent: overview.data.openSos > 0 },
    { label: 'Critical incidents', value: overview.data.criticalIncidents, urgent: overview.data.criticalIncidents > 0 },
    { label: 'Pending verifications', value: overview.data.pendingVerifications },
    { label: 'Active advisories', value: overview.data.activeAdvisories },
  ];
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`surface-card grid gap-1 p-4 ${stat.urgent ? 'ring-2 ring-[var(--tone-danger-fg)]' : ''}`}>
            <dt className="text-[0.875rem] text-[var(--text-muted)]">{stat.label}</dt>
            <dd className="text-[2rem] font-semibold leading-none tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <FreshnessBadge freshness={overview.data.freshness} />
    </div>
  );
}

export function OperationsScreen() {
  const now = useNow();
  const [sosFilter, setSosFilter] = useState<'open' | 'all'>('open');
  const [severityFilter, setSeverityFilter] = useState<'urgent' | 'all'>('urgent');
  const sos = useAuthoritySos(sosFilter === 'open' ? ['received', 'acknowledged', 'responding'] : []);
  const incidents = useAuthorityIncidents(severityFilter === 'urgent' ? { severity: ['critical', 'high'] } : {});
  const sosAction = useSosAction();
  const incidentAction = useIncidentAction();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');

  const mutation = pending?.kind === 'incident' ? incidentAction : sosAction;

  const confirm = () => {
    if (!pending) return;
    const done = () => {
      toast.success(`${pending.kind === 'sos' ? ACTION_LABEL[pending.action as AuthoritySosAction] : INCIDENT_ACTION_LABEL[pending.action as AuthorityIncidentAction]} recorded`);
      setPending(null);
      setNote('');
    };
    if (pending.kind === 'sos') sosAction.mutate({ alertId: pending.item.alertId, action: pending.action, note: note.trim() || undefined }, { onSuccess: done });
    else incidentAction.mutate({ incidentId: pending.item.incidentId, action: pending.action, note: note.trim() || undefined }, { onSuccess: done });
  };

  return (
    <div className="grid gap-10">
      <Overview />

      <Section
        title="SOS alerts"
        level={2}
        id="sos"
        action={<SegmentedControl label="Show" size="sm" value={sosFilter} onChange={setSosFilter} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />}
      >
        {sos.isPending ? (
          <LoadingBlock label="Loading SOS alerts"><Skeleton className="h-32 w-full rounded-[1.25rem]" /></LoadingBlock>
        ) : sos.isError ? (
          <ErrorState error={sos.error} onRetry={() => void sos.refetch()} />
        ) : sos.data.length === 0 ? (
          <p className="text-[var(--text-muted)]">No {sosFilter === 'open' ? 'open ' : ''}SOS alerts.</p>
        ) : (
          <ul className="grid gap-3">
            {sos.data.map((item) => {
              const actions: AuthoritySosAction[] = item.status === 'received' ? ['acknowledge', 'mark_responding', 'resolve'] : item.status === 'acknowledged' ? ['mark_responding', 'resolve'] : item.status === 'responding' ? ['resolve'] : [];
              return (
                <li key={item.alertId} className={`surface-card grid gap-3 p-4 ${item.status === 'received' ? 'ring-2 ring-[var(--tone-danger-fg)]' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={PRIORITY[item.priority]}>{item.priority}</StatusPill>
                    <StatusPill tone={SOS_STATUS[item.status].tone}>{SOS_STATUS[item.status].label}</StatusPill>
                    <span className="font-semibold">{item.travellerLabel}</span>
                    {now > 0 && <span className="text-[0.875rem] text-[var(--text-muted)]">received {relativeTime(item.receivedAt, now)}</span>}
                  </div>
                  <p className="text-[0.9375rem]">
                    {item.locationLabel ?? 'Location label unavailable'}
                    {item.coordinates ? (
                      <>
                        {' · '}
                        <Link href={`/map?lat=${item.coordinates.lat}&lng=${item.coordinates.lng}&label=${encodeURIComponent(item.travellerLabel)}`} className="font-medium text-[var(--link)] underline underline-offset-2">
                          {item.coordinates.lat.toFixed(4)}, {item.coordinates.lng.toFixed(4)}
                        </Link>
                        {item.accuracyMeters ? ` (±${item.accuracyMeters} m)` : ''}
                      </>
                    ) : (
                      ' · No location was shared'
                    )}
                  </p>
                  <p className="text-[0.8125rem] text-[var(--text-muted)]">
                    {item.assignedToLabel ? `Assigned: ${item.assignedToLabel} · ` : ''}
                    {now > 0 ? `Updated ${relativeTime(item.lastUpdateAt, now)}` : ''}
                  </p>
                  {actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {actions.map((action) => (
                        <Button key={action} variant={action === 'acknowledge' ? 'accent' : 'glass'} size="sm" onClick={() => setPending({ kind: 'sos', item, action })}>
                          {ACTION_LABEL[action]}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Incidents"
        level={2}
        id="incidents"
        description="Traveller reports stay private until verified here."
        action={<SegmentedControl label="Severity" size="sm" value={severityFilter} onChange={setSeverityFilter} options={[{ value: 'urgent', label: 'Critical & high' }, { value: 'all', label: 'All' }]} />}
      >
        {incidents.isPending ? (
          <Skeleton className="h-32 w-full rounded-[1.25rem]" />
        ) : incidents.isError ? (
          <ErrorState error={incidents.error} onRetry={() => void incidents.refetch()} />
        ) : incidents.data.length === 0 ? (
          <p className="text-[var(--text-muted)]">No incidents match.</p>
        ) : (
          <ul className="grid gap-3">
            {incidents.data.map((incident) => {
              const actions: AuthorityIncidentAction[] = incident.status === 'reported' ? ['verify', 'dismiss', 'resolve'] : incident.status === 'verified' ? ['resolve'] : [];
              return (
                <li key={incident.incidentId} className="surface-card grid gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={INCIDENT_SEVERITY[incident.severity].tone}>{INCIDENT_SEVERITY[incident.severity].label}</StatusPill>
                    <StatusPill tone={INCIDENT_STATUS[incident.status].tone}>{INCIDENT_STATUS[incident.status].label}</StatusPill>
                    <span className="font-semibold">{INCIDENT_CATEGORY[incident.category].label}</span>
                    <StatusPill>{incident.visibility === 'public' ? 'Visible to travellers' : 'Private'}</StatusPill>
                  </div>
                  <p>{incident.summary}</p>
                  <p className="text-[0.8125rem] text-[var(--text-muted)]">
                    {[incident.locationLabel, `${incident.reporterCount} report${incident.reporterCount === 1 ? '' : 's'}`, incident.assignedUnitLabel, now > 0 ? relativeTime(incident.reportedAt, now) : null].filter(Boolean).join(' · ')}
                  </p>
                  {actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {actions.map((action) => (
                        <Button key={action} variant="glass" size="sm" onClick={() => setPending({ kind: 'incident', item: incident, action })}>
                          {INCIDENT_ACTION_LABEL[action]}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Dialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending ? (pending.kind === 'sos' ? `${ACTION_LABEL[pending.action as AuthoritySosAction]} this alert?` : `${INCIDENT_ACTION_LABEL[pending.action as AuthorityIncidentAction]} this incident?`) : ''}
        description={pending?.kind === 'sos' ? 'The traveller sees each status change on their SOS screen.' : pending?.action === 'verify' ? 'Verified incidents become visible to travellers nearby, without the reporter’s name.' : undefined}
        dismissible={!mutation.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant="accent" onClick={confirm} loading={mutation.isPending}>
              Confirm
            </Button>
          </>
        }
      >
        <div className="grid gap-3 pb-2">
          <Field label="Note" optional hint="Recorded with this action.">
            {(control) => <TextArea {...control} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {mutation.error ? isApiError(mutation.error) && mutation.error.kind === 'conflict' ? <InlineNotice tone="warning">{mutation.error.message} Refresh to see the latest status.</InlineNotice> : <ErrorState error={mutation.error} context="authority.action" compact /> : null}
        </div>
      </Dialog>
    </div>
  );
}
