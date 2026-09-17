'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { LockIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';
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
export function RequireAuth({ children, role, title, description }: RequireAuthProps) {
  const { status, hasRole, sessionError, retrySession } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  if (status === 'loading') {
    return (
      <LoadingBlock label={t('auth.require.checking')} className="mx-auto grid w-full max-w-3xl gap-4 px-5 py-16">
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
        title={t('auth.require.expiredTitle')}
        description={t('auth.require.expiredDescription')}
        action={
          <ButtonLink href={loginHref} variant="navy">
            {t('auth.require.signInAgain')}
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
        title={title ?? t('auth.require.defaultTitle')}
        description={description ?? t('auth.require.defaultDescription')}
        action={
          <>
            <ButtonLink href={loginHref} variant="navy">
              {t('common.actions.signIn')}
            </ButtonLink>
            <ButtonLink href={`/register?next=${encodeURIComponent(pathname)}`} variant="secondary">
              {t('auth.require.createAccount')}
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
        title={t('auth.require.roleTitle')}
        description={t('auth.require.roleDescription')}
        action={
          <ButtonLink href="/" variant="secondary">
            {t('auth.require.goHome')}
          </ButtonLink>
        }
        className="py-24"
      />
    );
  }

  return <>{children}</>;
}
