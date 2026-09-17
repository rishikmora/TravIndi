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
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { isApiError } from '@/lib/api/errors';
import { useAddTrustedContact, useRemoveTrustedContact, useTrustedContacts, useUpdateTrustedContact } from '@/lib/query/hooks/safety';
import { toast } from '@/lib/ui/toast';
import type { TrustedContact, TrustedContactInput } from '@/types/domain';

const NOTIFY_OPTIONS: Array<TrustedContact['notifyOn'][number]> = ['sos', 'missed_check_in', 'location_share'];

const MAX_CONTACTS = 5;

function ContactDialog({ contact, open, onClose }: { contact: TrustedContact | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
      toast.success(getTranslator()(contact ? 'contacts.updated' : 'contacts.added'));
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
      title={contact ? t('contacts.editTitle', { name: contact.name }) : t('contacts.addTitle')}
      description={t('contacts.dialogDescription')}
      dismissible={!mutation.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="navy" onClick={save} loading={mutation.isPending} disabled={form.name.trim().length < 2 || !form.relationship.trim()}>
            {contact ? t('common.actions.saveChanges') : t('contacts.add')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        {mutation.error && !Object.keys(fieldErrors).length ? <ErrorState error={mutation.error} compact politeness="assertive" /> : null}
        <Field label={t('contacts.name')} error={fieldErrors.name}>
          {(control) => <TextInput {...control} autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label={t('contacts.relationship')} hint={t('contacts.relationshipHint')} error={fieldErrors.relationship}>
          {(control) => <TextInput {...control} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />}
        </Field>
        <Field
          label={t('contacts.phone')}
          optional={Boolean(contact)}
          hint={contact?.phoneMasked ? t('contacts.phoneCurrent', { value: contact.phoneMasked }) : t('contacts.phoneHint')}
          error={fieldErrors.phone}
        >
          {(control) => <TextInput {...control} type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
        </Field>
        <Field
          label={t('contacts.email')}
          optional
          hint={contact?.emailMasked ? t('contacts.emailCurrent', { value: contact.emailMasked }) : t('contacts.emailHint')}
          error={fieldErrors.email}
        >
          {(control) => <TextInput {...control} type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-medium">{t('contacts.tellThem')}</legend>
          {NOTIFY_OPTIONS.map((option) => (
            <Checkbox
              key={option}
              label={t(`contacts.notify.${option}.label`)}
              description={t(`contacts.notify.${option}.description`)}
              checked={form.notifyOn.includes(option)}
              onChange={(e) => setForm({ ...form, notifyOn: e.target.checked ? [...form.notifyOn, option] : form.notifyOn.filter((v) => v !== option) })}
            />
          ))}
        </fieldset>
      </div>
    </Dialog>
  );
}

function ContactsManager() {
  const { t } = useTranslation();
  const contacts = useTrustedContacts();
  const remove = useRemoveTrustedContact();
  const [editing, setEditing] = useState<TrustedContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TrustedContact | null>(null);

  if (contacts.isPending) {
    return (
      <LoadingBlock label={t('contacts.loading')} className="grid gap-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </LoadingBlock>
    );
  }
  if (contacts.isError) return <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} retrying={contacts.isFetching} />;

  const atLimit = contacts.data.length >= MAX_CONTACTS;

  return (
    <div className="grid gap-6">
      <InlineNotice tone="info" title={t('contacts.howReachedTitle')}>
        {t('contacts.howReached')}
      </InlineNotice>

      {contacts.data.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={t('contacts.emptyTitle')}
          description={t('contacts.emptyDescription')}
          action={
            <Button variant="navy" onClick={() => setAdding(true)}>
              <PlusIcon size={18} />
              {t('contacts.addContact')}
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
                    <StatusPill tone={contact.verified ? 'success' : 'neutral'}>{contact.verified ? t('contacts.confirmed') : t('contacts.notYetConfirmed')}</StatusPill>
                  </div>
                  <p className="text-[0.875rem] text-[var(--text-muted)]">{[contact.phoneMasked, contact.emailMasked].filter(Boolean).join(' · ')}</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label={t('contacts.alertsTheyReceive')}>
                    {contact.notifyOn.map((value) => (
                      <li key={value}>
                        <StatusPill>{NOTIFY_OPTIONS.includes(value) ? t(`contacts.notify.${value}.label`) : value}</StatusPill>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(contact)} aria-label={t('contacts.editLabel', { name: contact.name })}>
                    <EditIcon size={16} />
                    {t('common.actions.edit')}
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => setRemoving(contact)} aria-label={t('contacts.removeLabel', { name: contact.name })}>
                    <TrashIcon size={16} />
                    {t('common.actions.remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="navy" onClick={() => setAdding(true)} disabled={atLimit}>
              <PlusIcon size={18} />
              {t('contacts.addContact')}
            </Button>
            {atLimit && <span className="text-[0.875rem] text-[var(--text-muted)]">{t('contacts.maxReached', { count: MAX_CONTACTS })}</span>}
          </div>
        </>
      )}

      <ContactDialog
        open={adding || Boolean(editing)}
        contact={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={t('contacts.removeTitle', { name: removing?.name ?? '' })}
        description={t('contacts.removeDescription')}
        dismissible={!remove.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={remove.isPending}>
              {t('contacts.keep')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                removing &&
                remove.mutate(removing.contactId, {
                  onSuccess: () => {
                    toast.success(getTranslator()('contacts.removed', { name: removing.name }));
                    setRemoving(null);
                  },
                })
              }
            >
              {t('common.actions.remove')}
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
  const { t } = useTranslation();
  return (
    <PageShell width="narrow">
      <PageHeader eyebrow={t('contacts.eyebrow')} title={t('contacts.title')} description={t('contacts.description')} />
      <RequireAuth description={t('contacts.signIn')}>
        <ContactsManager />
      </RequireAuth>
    </PageShell>
  );
}
