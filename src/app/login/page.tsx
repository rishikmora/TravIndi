import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';
import { safeNextPath } from '@/lib/navigation/safe-next';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.signIn,
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <AuthLayout title="Welcome back" description="Sign in to see your trips, messages and safety tools.">
      <LoginForm next={safeNextPath(next)} />
    </AuthLayout>
  );
}
