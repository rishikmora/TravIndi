'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { LockIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useAuth } from '@/lib/auth/provider';
import type { UserRole } from '@/types/domain';

interface RequireAuthProps {
  children: ReactNode;
  role?: UserRole;
  title?: string;
  description?: string;
}

/**
 * UX guard for private screens. It decides what to render, not what is
 * allowed: the backend authorises every request regardless of this component.
 */
export function RequireAuth({ children, role, title = 'Sign in to continue', description }: RequireAuthProps) {
  const { status, hasRole, sessionError, retrySession } = useAuth();
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  if (status === 'loading') {
    return (
      <LoadingBlock label="Checking your session" className="mx-auto grid w-full max-w-3xl gap-4 px-5 py-16">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </LoadingBlock>
    );
  }

  if (status === 'expired') {
    return (
      <EmptyState
        as="h1"
        icon={<LockIcon />}
        title="Your session has ended"
        description="For your security, please sign in again. Drafts saved on this device are still here."
        action={
          <ButtonLink href={loginHref} variant="navy">
            Sign in again
          </ButtonLink>
        }
        className="py-24"
      />
    );
  }

  if (status === 'anonymous') {
    if (sessionError && sessionError.kind !== 'unauthorized') {
      return <ErrorState error={sessionError} context="generic" onRetry={retrySession} className="mx-auto my-16 max-w-xl" />;
    }
    return (
      <EmptyState
        as="h1"
        icon={<LockIcon />}
        title={title}
        description={description ?? 'Trips, messages, location sharing and safety tools are private to your account.'}
        action={
          <>
            <ButtonLink href={loginHref} variant="navy">
              Sign in
            </ButtonLink>
            <ButtonLink href={`/register?next=${encodeURIComponent(pathname)}`} variant="secondary">
              Create an account
            </ButtonLink>
          </>
        }
        className="py-24"
      />
    );
  }

  if (role && !hasRole(role)) {
    return (
      <EmptyState
        as="h1"
        icon={<LockIcon />}
        title="This area needs a different account"
        description="It’s available to authorised accounts only. If you think you should have access, contact your administrator."
        action={
          <ButtonLink href="/" variant="secondary">
            Go to home
          </ButtonLink>
        }
        className="py-24"
      />
    );
  }

  return <>{children}</>;
}
