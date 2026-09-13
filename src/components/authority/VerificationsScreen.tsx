'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextArea } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill, type Tone } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { relativeTime } from '@/lib/format/freshness';
import { useDecideVerification, useVerifications } from '@/lib/query/hooks/authority';
import { toast } from '@/lib/ui/toast';
import type { VerificationRequest } from '@/types/domain';

const STATUS: Record<VerificationRequest['status'], { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  in_review: { label: 'In review', tone: 'info' },
  needs_info: { label: 'Needs information', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

const DOC_LABEL: Record<VerificationRequest['documents'][number]['kind'], string> = {
  identity: 'Identity',
  business_registration: 'Business registration',
  guide_licence: 'Guide licence',
  address_proof: 'Address proof',
  other: 'Other document',
};

const DECISION_LABEL = { approve: 'Approve', request_info: 'Request information', reject: 'Reject' } as const;
type Decision = keyof typeof DECISION_LABEL;

export function VerificationsScreen() {
  const now = useNow();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const requests = useVerifications(filter === 'open' ? ['pending', 'in_review', 'needs_info'] : []);
  const decide = useDecideVerification();
  const [pending, setPending] = useState<{ request: VerificationRequest; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const noteRequired = pending?.decision !== 'approve';

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.375rem] font-semibold">Verification requests</h2>
        <SegmentedControl label="Show" size="sm" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Needs a decision' }, { value: 'all', label: 'All' }]} />
      </div>

      {requests.isPending ? (
        <Skeleton className="h-40 w-full rounded-[1.25rem]" />
      ) : requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : requests.data.length === 0 ? (
        <p className="text-[var(--text-muted)]">Nothing waiting for a decision.</p>
      ) : (
        <ul className="grid gap-3">
          {requests.data.map((request) => {
            const open = ['pending', 'in_review', 'needs_info'].includes(request.status);
            return (
              <li key={request.requestId} className="surface-card grid gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={STATUS[request.status].tone}>{STATUS[request.status].label}</StatusPill>
                  <StatusPill>{request.subjectType === 'guide' ? 'Guide' : 'Business'}</StatusPill>
                  <span className="text-[1.0625rem] font-semibold">{request.subjectName}</span>
                  {request.destinationName && <span className="text-[var(--text-muted)]">{request.destinationName}</span>}
                  {now > 0 && <span className="text-[0.8125rem] text-[var(--text-subtle)]">submitted {relativeTime(request.submittedAt, now)}</span>}
                </div>
                <ul className="grid gap-1.5" aria-label="Documents">
                  {request.documents.map((doc) => (
                    <li key={doc.documentId} className="flex items-center justify-between gap-3 text-[0.9375rem]">
                      <span>{DOC_LABEL[doc.kind]}</span>
                      <StatusPill tone={doc.status === 'accepted' ? 'success' : doc.status === 'rejected' ? 'danger' : 'neutral'}>{doc.status}</StatusPill>
                    </li>
                  ))}
                </ul>
                {request.reviewFlags.length > 0 && (
                  <InlineNotice tone="warning" title="Automated checks to look at">
                    <ul className="grid gap-1">
                      {request.reviewFlags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[0.8125rem]">These are prompts for review, not decisions.</p>
                  </InlineNotice>
                )}
                {open && (
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(DECISION_LABEL) as Decision[]).map((decision) => (
                      <Button key={decision} variant={decision === 'approve' ? 'accent' : 'glass'} size="sm" onClick={() => { setPending({ request, decision }); setNote(''); }}>
                        {DECISION_LABEL[decision]}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending ? `${DECISION_LABEL[pending.decision]}: ${pending.request.subjectName}` : ''}
        description={pending?.decision === 'approve' ? 'Accepted documents become verification evidence on their public profile.' : 'Your note is shared with the applicant.'}
        dismissible={!decide.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              variant={pending?.decision === 'reject' ? 'danger' : 'accent'}
              loading={decide.isPending}
              disabled={noteRequired && note.trim().length < 3}
              onClick={() =>
                pending &&
                decide.mutate(
                  { requestId: pending.request.requestId, decision: pending.decision, note: note.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Decision recorded');
                      setPending(null);
                    },
                  },
                )
              }
            >
              {pending ? DECISION_LABEL[pending.decision] : 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 pb-2">
          <Field label="Note" optional={!noteRequired} hint={noteRequired ? 'Explain what’s needed or why.' : undefined}>
            {(control) => <TextArea {...control} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {decide.error ? <ErrorState error={decide.error} context="authority.action" compact /> : null}
        </div>
      </Dialog>
    </div>
  );
}
