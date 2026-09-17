'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Field';
import { useTranslation } from '@/i18n/react';
import { useAuth } from '@/lib/auth/provider';
import { isMockMode } from '@/lib/config/env';
import { toast } from '@/lib/ui/toast';

type Backend = Awaited<ReturnType<typeof loadBackend>>;

async function loadBackend() {
  const mock = await import('@/lib/mock-backend');
  return { backend: mock.getMockBackend(), accounts: mock.DEMO_ACCOUNTS, password: mock.DEMO_PASSWORD, network: mock.mockNetwork };
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
  const { t } = useTranslation();

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
    toast.info(label, result === null || result === false || result === 0 ? t('mock.nothingToChange') : undefined);
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
        {t('mock.badge')}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant="sheet"
        title={t('mock.title')}
        description={t('mock.description')}
      >
        {!loaded ? (
          <p className="py-6 text-[var(--text-muted)]">{t('mock.loading')}</p>
        ) : (
          <div className="grid gap-7 pb-4">
            <section className="grid gap-2">
              <h3 className="label text-[var(--text-subtle)]">{t('mock.signInAs')}</h3>
              <p className="text-[0.8125rem] text-[var(--text-muted)]">
                {status === 'authenticated' ? t('mock.signedInAs', { name: user?.displayName }) : t('mock.notSignedIn')}
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
                        toast.success(t('mock.signedIn', { name: account.label }));
                        setOpen(false);
                      } catch {
                        toast.error(t('mock.signInFailed'));
                      }
                    }}
                  >
                    {account.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="grid gap-4">
              <h3 className="label text-[var(--text-subtle)]">{t('mock.conditions.title')}</h3>
              <Switch
                label={t('mock.conditions.offline')}
                description={t('mock.conditions.offlineDetail')}
                checked={loaded.network.simulatingOffline}
                onChange={(event) => {
                  loaded.backend.scenarios.setOffline(event.target.checked);
                  force((n) => n + 1);
                }}
              />
              <Switch label={t('mock.conditions.acknowledgeSos')} checked={flags!.autoAcknowledgeSos} onChange={toggle('autoAcknowledgeSos')} />
              <Switch label={t('mock.conditions.chatAutoReply')} checked={flags!.chatAutoReply} onChange={toggle('chatAutoReply')} />
              <Switch label={t('mock.conditions.autoplayAdaptation')} checked={flags!.autoplayAdaptation} onChange={toggle('autoplayAdaptation')} />
              <Switch label={t('mock.conditions.failNextGeneration')} checked={flags!.failNextGeneration} onChange={toggle('failNextGeneration')} />
              <Switch label={t('mock.conditions.failNextAccept')} checked={flags!.failNextAccept} onChange={toggle('failNextAccept')} />
            </section>

            <section className="grid gap-2">
              <h3 className="label text-[var(--text-subtle)]">{t('mock.trigger.title')}</h3>
              <Button variant="secondary" size="sm" onClick={run(t('mock.trigger.adaptationDone'), () => loaded.backend.scenarios.triggerAdaptation())}>
                {t('mock.trigger.adaptation')}
              </Button>
              <Button variant="secondary" size="sm" onClick={run(t('mock.trigger.messageDone'), () => loaded.backend.scenarios.incomingMessage())}>
                {t('mock.trigger.message')}
              </Button>
              <Button variant="secondary" size="sm" onClick={run(t('mock.trigger.expireDone'), () => loaded.backend.scenarios.expirePendingProposals())}>
                {t('mock.trigger.expire')}
              </Button>
              <Button variant="secondary" size="sm" onClick={run(t('mock.trigger.sessionDone'), () => loaded.backend.scenarios.expireSession())}>
                {t('mock.trigger.session')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  loaded.backend.reset();
                  queryClient.clear();
                  // A full page load, so no in-memory state survives the reset.
                  window.location.assign(new URL('/', window.location.origin).href);
                }}
              >
                {t('mock.trigger.reset')}
              </Button>
            </section>
          </div>
        )}
      </Dialog>
    </>
  );
}
