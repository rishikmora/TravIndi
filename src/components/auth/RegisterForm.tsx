'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, TextInput } from '@/components/ui/Field';
import { describeError } from '@/lib/api/error-messages';
import { type ApiError, isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';

const OPTIONAL_CONSENTS = [
  {
    id: 'location_sharing',
    label: 'Allow location sharing',
    description: 'Lets you share your live location with people you choose. Nothing is shared until you start a share.',
  },
  {
    id: 'personalisation',
    label: 'Personalised planning',
    description: 'Use your saved preferences to tailor itineraries.',
  },
] as const;

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [consents, setConsents] = useState<Record<string, boolean>>({ location_sharing: false, personalisation: true });
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        acceptTerms,
        consents: Object.entries(consents).map(([consentId, granted]) => ({ consentId, granted })),
      });
      router.replace(next);
    } catch (caught) {
      setError(isApiError(caught) ? caught : null);
      setSubmitting(false);
    }
  };

  const described = error ? describeError(error, 'auth.register') : null;
  const passwordHint = password.length > 0 && password.length < 8 ? `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'} needed` : 'At least 8 characters.';

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {described && (
        <div role="alert" className="rounded-2xl bg-[var(--tone-danger-bg)] p-4">
          <p className="font-semibold">{error?.kind === 'conflict' ? 'This email already has an account' : described.title}</p>
          <p className="text-[0.9375rem] text-[var(--text-muted)]">{error?.message ?? described.message}</p>
        </div>
      )}
      <Field label="Your name" error={error?.fieldErrors.displayName}>
        {(control) => <TextInput {...control} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
      </Field>
      <Field label="Email" error={error?.fieldErrors.email}>
        {(control) => <TextInput {...control} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Password" hint={passwordHint} error={error?.fieldErrors.password}>
        {(control) => <TextInput {...control} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>

      <fieldset className="grid gap-4 rounded-2xl p-4 ring-1 ring-inset ring-[var(--hairline)]">
        <legend className="px-1 text-[0.9375rem] font-semibold">Privacy choices</legend>
        {OPTIONAL_CONSENTS.map((consent) => (
          <Checkbox
            key={consent.id}
            label={consent.label}
            description={consent.description}
            checked={consents[consent.id] ?? false}
            onChange={(e) => setConsents((current) => ({ ...current, [consent.id]: e.target.checked }))}
          />
        ))}
        <p className="text-[0.8125rem] text-[var(--text-muted)]">You can change these at any time in Privacy &amp; consents.</p>
      </fieldset>

      <Checkbox
        label="I accept the terms of use"
        checked={acceptTerms}
        onChange={(e) => setAcceptTerms(e.target.checked)}
        aria-invalid={error?.fieldErrors.acceptTerms ? true : undefined}
      />
      {error?.fieldErrors.acceptTerms && <p className="-mt-3 text-[0.8125rem] font-medium text-[var(--tone-danger-fg)]">{error.fieldErrors.acceptTerms}</p>}

      <Button type="submit" variant="navy" size="lg" loading={submitting} disabled={!acceptTerms || !email || !displayName || password.length < 8}>
        {submitting ? 'Creating your account…' : 'Create account'}
      </Button>
      <p className="text-[0.9375rem] text-[var(--text-muted)]">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-[var(--link)] underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
