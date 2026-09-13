'use client';

import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, TextInput } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { EditIcon, PlusIcon, TrashIcon, UsersIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { isApiError } from '@/lib/api/errors';
import { useAddTrustedContact, useRemoveTrustedContact, useTrustedContacts, useUpdateTrustedContact } from '@/lib/query/hooks/safety';
import { toast } from '@/lib/ui/toast';
import type { TrustedContact, TrustedContactInput } from '@/types/domain';

const NOTIFY_OPTIONS: Array<{ value: TrustedContact['notifyOn'][number]; label: string; description: string }> = [
  { value: 'sos', label: 'SOS alerts', description: 'When you send an SOS.' },
  { value: 'missed_check_in', label: 'Missed check-ins', description: 'When you don’t check in on time.' },
  { value: 'location_share', label: 'Location sharing', description: 'Lets you share your live location with them.' },
];

const MAX_CONTACTS = 5;

function ContactDialog({ contact, open, onClose }: { contact: TrustedContact | null; open: boolean; onClose: () => void }) {
  const add = useAddTrustedContact();
  const update = useUpdateTrustedContact();
  const [form, setForm] = useState({ name: '', relationship: '', phone: '', email: '', notifyOn: ['sos'] as TrustedContact['notifyOn'] });
  const mutation = contact ? update : add;
  const fieldErrors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};

  // Fill the form each time the dialog opens, or switches to another contact.
  const [formFor, setFormFor] = useState<{ open: boolean; contact: TrustedContact | null }>({ open: false, contact: null });
  if (formFor.open !== open || formFor.contact !== contact) {
    setFormFor({ open, contact });
    if (open) setForm({ name: contact?.name ?? '', relationship: contact?.relationship ?? '', phone: '', email: '', notifyOn: contact?.notifyOn ?? ['sos'] });
  }

  useEffect(() => {
    if (!open) return;
    add.reset();
    update.reset();
    // Clear earlier errors only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact]);

  const save = () => {
    const done = () => {
      toast.success(contact ? 'Contact updated' : 'Contact added');
      onClose();
    };
    if (contact) {
      const patch: Partial<TrustedContactInput> = { name: form.name, relationship: form.relationship, notifyOn: form.notifyOn };
      if (form.phone.trim()) patch.phone = form.phone.trim();
      if (form.email.trim()) patch.email = form.email.trim();
      update.mutate({ contactId: contact.contactId, patch }, { onSuccess: done });
    } else {
      add.mutate({ name: form.name, relationship: form.relationship, phone: form.phone.trim() || null, email: form.email.trim() || null, notifyOn: form.notifyOn }, { onSuccess: done });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={contact ? `Edit ${contact.name}` : 'Add a trusted contact'}
      description="Choose someone who would want to know if you need help."
      dismissible={!mutation.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="navy" onClick={save} loading={mutation.isPending} disabled={form.name.trim().length < 2 || !form.relationship.trim()}>
            {contact ? 'Save changes' : 'Add contact'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        {mutation.error && !Object.keys(fieldErrors).length ? <ErrorState error={mutation.error} compact politeness="assertive" /> : null}
        <Field label="Name" error={fieldErrors.name}>
          {(control) => <TextInput {...control} autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label="Relationship" hint="e.g. Brother, Friend, Colleague" error={fieldErrors.relationship}>
          {(control) => <TextInput {...control} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />}
        </Field>
        <Field label="Phone" optional={Boolean(contact)} hint={contact?.phoneMasked ? `Current: ${contact.phoneMasked}. Leave empty to keep it.` : 'Add a phone number or an email.'} error={fieldErrors.phone}>
          {(control) => <TextInput {...control} type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
        </Field>
        <Field label="Email" optional hint={contact?.emailMasked ? `Current: ${contact.emailMasked}. Leave empty to keep it.` : 'If they use TravIndi with this email, alerts reach them in the app.'} error={fieldErrors.email}>
          {(control) => <TextInput {...control} type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-medium">Tell them about</legend>
          {NOTIFY_OPTIONS.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              description={option.description}
              checked={form.notifyOn.includes(option.value)}
              onChange={(e) =>
                setForm({ ...form, notifyOn: e.target.checked ? [...form.notifyOn, option.value] : form.notifyOn.filter((v) => v !== option.value) })
              }
            />
          ))}
        </fieldset>
      </div>
    </Dialog>
  );
}

function ContactsManager() {
  const contacts = useTrustedContacts();
  const remove = useRemoveTrustedContact();
  const [editing, setEditing] = useState<TrustedContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TrustedContact | null>(null);

  if (contacts.isPending) {
    return (
      <LoadingBlock label="Loading trusted contacts" className="grid gap-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </LoadingBlock>
    );
  }
  if (contacts.isError) return <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} retrying={contacts.isFetching} />;

  const atLimit = contacts.data.length >= MAX_CONTACTS;

  return (
    <div className="grid gap-6">
      <InlineNotice tone="info" title="How contacts are reached">
        In-app alerts reach contacts who use TravIndi with the email you add. SMS and phone calls aren’t connected yet, so in an emergency also contact them directly.
      </InlineNotice>

      {contacts.data.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="No trusted contacts yet"
          description="Add up to five people who should hear from you if you send an SOS."
          action={
            <Button variant="navy" onClick={() => setAdding(true)}>
              <PlusIcon size={18} />
              Add a contact
            </Button>
          }
          className="surface-card"
        />
      ) : (
        <>
          <ul className="grid gap-3">
            {contacts.data.map((contact) => (
              <li key={contact.contactId} className="surface-card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[1.0625rem] font-semibold">{contact.name}</span>
                    <span className="text-[var(--text-muted)]">{contact.relationship}</span>
                    <StatusPill tone={contact.verified ? 'success' : 'neutral'}>{contact.verified ? 'Confirmed' : 'Not yet confirmed'}</StatusPill>
                  </div>
                  <p className="text-[0.875rem] text-[var(--text-muted)]">{[contact.phoneMasked, contact.emailMasked].filter(Boolean).join(' · ')}</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Alerts they receive">
                    {contact.notifyOn.map((value) => (
                      <li key={value}>
                        <StatusPill>{NOTIFY_OPTIONS.find((o) => o.value === value)?.label ?? value}</StatusPill>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(contact)} aria-label={`Edit ${contact.name}`}>
                    <EditIcon size={16} />
                    Edit
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => setRemoving(contact)} aria-label={`Remove ${contact.name}`}>
                    <TrashIcon size={16} />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="navy" onClick={() => setAdding(true)} disabled={atLimit}>
              <PlusIcon size={18} />
              Add a contact
            </Button>
            {atLimit && <span className="text-[0.875rem] text-[var(--text-muted)]">You’ve added the maximum of {MAX_CONTACTS} contacts.</span>}
          </div>
        </>
      )}

      <ContactDialog open={adding || Boolean(editing)} contact={editing} onClose={() => { setAdding(false); setEditing(null); }} />

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'contact'}?`}
        description="They won’t receive SOS alerts or location shares from you any more."
        dismissible={!remove.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={remove.isPending}>
              Keep
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                removing &&
                remove.mutate(removing.contactId, {
                  onSuccess: () => {
                    toast.success(`${removing.name} removed`);
                    setRemoving(null);
                  },
                })
              }
            >
              Remove
            </Button>
          </>
        }
      >
        {remove.error ? <ErrorState error={remove.error} compact /> : null}
      </Dialog>
    </div>
  );
}

export function TrustedContactsScreen() {
  return (
    <PageShell width="narrow">
      <PageHeader eyebrow="Safety" title="Trusted contacts" description="People who should hear from you in an emergency." />
      <RequireAuth description="Trusted contacts are private to your account.">
        <ContactsManager />
      </RequireAuth>
    </PageShell>
  );
}
