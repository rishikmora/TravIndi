'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Field';
import { useAuth } from '@/lib/auth/provider';
import { isMockMode } from '@/lib/config/env';
import { toast } from '@/lib/ui/toast';

type Backend = Awaited<ReturnType<typeof loadBackend>>;

async function loadBackend() {
  const module = await import('@/lib/mock-backend');
  return { backend: module.getMockBackend(), accounts: module.DEMO_ACCOUNTS, password: module.DEMO_PASSWORD, network: module.mockNetwork };
}

/**
 * Visible whenever the development backend is serving data, so sample content
 * is never mistaken for real information. Also exposes scenario triggers.
 */
export function MockModeTools() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Backend | null>(null);
  const [, force] = useState(0);
  const { login, status, user } = useAuth();
  const queryClient = useQueryClient();

  if (!isMockMode) return null;

  const openPanel = async () => {
    setOpen(true);
    if (!loaded) setLoaded(await loadBackend());
  };

  const flags = loaded?.backend.scenarios.flags;
  const toggle = (key: keyof NonNullable<typeof flags>) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!flags) return;
    (flags as Record<string, unknown>)[key] = event.target.checked;
    force((n) => n + 1);
  };

  const run = (label: string, action: () => unknown) => () => {
    const result = action();
    toast.info(label, result === null || result === false || result === 0 ? 'Nothing to change right now.' : undefined);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-3 z-[60] inline-flex lg:left-16 h-8 items-center gap-2 rounded-full bg-[#2b2118] px-3 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[#f7d9a8] shadow-lg ring-1 ring-[#f7d9a8]/30 lg:bottom-4"
        aria-haspopup="dialog"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[#f0b64a]" />
        Sample data
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant="sheet"
        title="Development backend"
        description="Everything you see — trips, people, providers, prices, safety and crowd information — is sample data served in your browser. No real messages, alerts or bookings are sent."
      >
        {!loaded ? (
          <p className="py-6 text-[var(--text-muted)]">Loading tools…</p>
        ) : (
          <div className="grid gap-7 pb-4">
            <section className="grid gap-2">
              <h3 className="label text-[var(--text-subtle)]">Sign in as</h3>
              <p className="text-[0.8125rem] text-[var(--text-muted)]">
                {status === 'authenticated' ? `Signed in as ${user?.displayName}.` : 'Not signed in.'}
              </p>
              <div className="grid gap-2">
                {loaded.accounts.map((account) => (
                  <Button
                    key={account.email}
                    variant="secondary"
                    size="sm"
                    className="justify-start"
                    onClick={async () => {
                      try {
                        await login({ email: account.email, password: loaded.password });
                        toast.success(`Signed in: ${account.label}`);
                        setOpen(false);
                      } catch {
                        toast.error('Could not sign in');
                      }
                    }}
                  >
                    {account.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="grid gap-4">
              <h3 className="label text-[var(--text-subtle)]">Conditions</h3>
              <Switch
                label="Simulate offline"
                description="Requests fail as they would without a network; live updates disconnect."
                checked={loaded.network.simulatingOffline}
                onChange={(event) => {
                  loaded.backend.scenarios.setOffline(event.target.checked);
                  force((n) => n + 1);
                }}
              />
              <Switch label="Operations desk acknowledges SOS" checked={flags!.autoAcknowledgeSos} onChange={toggle('autoAcknowledgeSos')} />
              <Switch label="Trip members reply to messages" checked={flags!.chatAutoReply} onChange={toggle('chatAutoReply')} />
              <Switch label="Travel update arrives on the active trip" checked={flags!.autoplayAdaptation} onChange={toggle('autoplayAdaptation')} />
              <Switch label="Next itinerary generation fails" checked={flags!.failNextGeneration} onChange={toggle('failNextGeneration')} />
              <Switch label="Next change approval fails" checked={flags!.failNextAccept} onChange={toggle('failNextAccept')} />
            </section>

            <section className="grid gap-2">
              <h3 className="label text-[var(--text-subtle)]">Trigger</h3>
              <Button variant="secondary" size="sm" onClick={run('Travel update sent', () => loaded.backend.scenarios.triggerAdaptation())}>
                Send a travel update to the active trip
              </Button>
              <Button variant="secondary" size="sm" onClick={run('Incoming message on its way', () => loaded.backend.scenarios.incomingMessage())}>
                Receive a trip message
              </Button>
              <Button variant="secondary" size="sm" onClick={run('Pending suggestions expired', () => loaded.backend.scenarios.expirePendingProposals())}>
                Expire pending suggestions
              </Button>
              <Button variant="secondary" size="sm" onClick={run('Session expired on the server', () => loaded.backend.scenarios.expireSession())}>
                Expire my session
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  loaded.backend.reset();
                  queryClient.clear();
                  window.location.assign('/');
                }}
              >
                Reset all sample data
              </Button>
            </section>
          </div>
        )}
      </Dialog>
    </>
  );
}
