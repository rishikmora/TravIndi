import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/app/PageShell';
import { EmergencyNumbers } from '@/components/safety/EmergencyNumbers';

export const metadata: Metadata = {
  title: 'You’re offline',
  robots: { index: false, follow: false },
};

/** Served by the service worker when a page can't be reached. Calls to emergency numbers still work. */
export default function OfflinePage() {
  return (
    <PageShell width="narrow">
      <div className="grid gap-6">
        <div className="grid gap-2">
          <p className="label text-[var(--text-subtle)]">Offline</p>
          <h1 className="text-[clamp(1.875rem,4vw,2.75rem)] font-semibold tracking-[-0.03em]">You’re offline</h1>
          <p className="text-[1.0625rem] text-[var(--text-muted)]">
            This page hasn’t been saved on your device. Trips you’ve opened recently may still be available, marked as offline copies.
          </p>
        </div>
        <EmergencyNumbers />
        <div className="flex flex-wrap gap-3 text-[1rem] font-semibold">
          <Link href="/trips" className="text-[var(--link)] underline underline-offset-4">
            My trips
          </Link>
          <Link href="/safety" className="text-[var(--link)] underline underline-offset-4">
            Safety centre
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
