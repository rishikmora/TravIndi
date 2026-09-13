'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageShell } from '@/components/app/PageShell';
import { InlineNotice } from '@/components/ui/States';
import { useCapabilities } from '@/lib/capabilities/useCapabilities';
import { useChannel, useRealtimeEvents } from '@/lib/realtime/provider';
import { announce, toast } from '@/lib/ui/toast';
import { cn } from '@/utils/cn';

const TABS = [
  { href: '/authority', label: 'Operations', exact: true },
  { href: '/authority/verifications', label: 'Verifications' },
  { href: '/authority/analytics', label: 'Analytics' },
];

function OperationsChannel() {
  useChannel('authority:operations');
  useRealtimeEvents((event) => {
    if (event.name === 'authority.sos.updated' && event.payload.item.status === 'received') {
      const where = event.payload.item.location_label ? ` near ${event.payload.item.location_label}` : '';
      toast.show({ tone: 'danger', title: 'New SOS alert', description: `${event.payload.item.traveller_label}${where}`, duration: 0 });
      announce(`New SOS alert${where}.`, 'assertive');
    }
  });
  return null;
}

export function AuthorityFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { capabilities } = useCapabilities();

  return (
    <PageShell width="wide" tone="dark">
      <RequireAuth role="authority" title="Authority sign-in required" description="This area is for authorised operations staff.">
        <OperationsChannel />
        <header className="mb-6 grid gap-4">
          <div className="grid gap-1">
            <p className="label text-[var(--text-subtle)]">Authority</p>
            <h1 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.03em]">Operations dashboard</h1>
          </div>
          <nav aria-label="Authority sections" className="overflow-x-auto">
            <ul className="flex min-w-max gap-1 border-b border-[var(--hairline)]">
              {TABS.map((tab) => {
                const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn('-mb-px inline-flex min-h-11 items-center border-b-2 px-3 font-medium', active ? 'border-[var(--color-gold)] text-[var(--text)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]')}
                    >
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {!capabilities.authorityIntegration && (
            <InlineNotice tone="warning" title="Not connected to government emergency systems">
              Actions here update TravIndi only. Dispatch police, fire or ambulance through your usual channels.
            </InlineNotice>
          )}
        </header>
        {children}
      </RequireAuth>
    </PageShell>
  );
}
