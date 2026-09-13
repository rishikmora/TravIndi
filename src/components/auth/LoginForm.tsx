'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { InlineNotice } from '@/components/ui/States';
import { describeError } from '@/lib/api/error-messages';
import { type ApiError, isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { isMockMode } from '@/lib/config/env';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const { login, status, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (credentials: { email: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(credentials);
      router.replace(next);
    } catch (caught) {
      setError(isApiError(caught) ? caught : null);
      setSubmitting(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void signIn({ email: email.trim(), password });
  };

  if (status === 'authenticated' && user && !submitting) {
    return (
      <InlineNotice tone="success" title={`You’re signed in as ${user.displayName}`}>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={next} variant="navy" size="sm">
            Continue
          </ButtonLink>
        </div>
      </InlineNotice>
    );
  }

  const described = error ? describeError(error, 'auth.login') : null;

  return (
    <div className="grid gap-6">
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {described && (
          <div role="alert" className="rounded-2xl bg-[var(--tone-danger-bg)] p-4">
            <p className="font-semibold">{described.title}</p>
            <p className="text-[0.9375rem] text-[var(--text-muted)]">
              {error?.kind === 'rate_limited' && error.retryAfterSeconds
                ? `Please wait about ${Math.ceil(error.retryAfterSeconds / 60)} minute before trying again.`
                : described.message}
            </p>
          </div>
        )}
        <Field label="Email" error={error?.fieldErrors.email}>
          {(control) => (
            <TextInput {...control} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          )}
        </Field>
        <Field label="Password" error={error?.fieldErrors.password}>
          {(control) => (
            <TextInput {...control} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          )}
        </Field>
        <Button type="submit" variant="navy" size="lg" loading={submitting} disabled={!email || !password}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-[0.9375rem] text-[var(--text-muted)]">
        New to TravIndi?{' '}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-[var(--link)] underline underline-offset-4">
          Create an account
        </Link>
      </p>

      {isMockMode && (
        <InlineNotice tone="warning" title="Development backend">
          Sample accounts only. Try the demo traveller:
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={async () => {
                const { DEMO_PASSWORD } = await import('@/lib/mock-backend');
                void signIn({ email: 'demo@travindi.dev', password: DEMO_PASSWORD });
              }}
            >
              Continue as Ananya (sample traveller)
            </Button>
          </div>
        </InlineNotice>
      )}
    </div>
  );
}
