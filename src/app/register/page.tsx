import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { safeNextPath } from '@/lib/navigation/safe-next';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.register,
  robots: { index: false, follow: false },
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <AuthLayout title="Create your account" description="Plan journeys that adapt, and keep the people you trust close.">
      <RegisterForm next={safeNextPath(next, '/trips/new')} />
    </AuthLayout>
  );
}
