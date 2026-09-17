'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { isLocale } from '@/i18n/config';
import { getLocale, getRequestLocale, setLocale, subscribeLocale } from '@/i18n/runtime';
import { useAuth } from '@/lib/auth/provider';
import { useProfile, useUpdateProfile } from '@/lib/query/hooks/profile';

/**
 * Keeps the traveller's language in step with the backend:
 * - data the backend writes in the traveller's language (itinerary reasons,
 *   advisories, notifications) is refetched when the language changes, while
 *   whatever is on screen stays put until the new copy arrives;
 * - a signed-in account's saved language is applied on this device, and a
 *   language chosen here is saved to the account, so notifications and trip
 *   updates the backend sends later arrive in the same language.
 */
export function LanguagePreferenceSync() {
  const queryClient = useQueryClient();
  const { status, user } = useAuth();
  const signedIn = status === 'authenticated' && Boolean(user);
  const profile = useProfile(signedIn);
  const update = useUpdateProfile();

  // Refetch server-written text when the language on screen changes.
  useEffect(() => {
    let language = getRequestLocale();
    return subscribeLocale(() => {
      const next = getLocale();
      if (next === language) return;
      language = next;
      void queryClient.invalidateQueries();
    });
  }, [queryClient]);

  const reconciledFor = useRef<string | null>(null);
  const latest = useRef({ userId: user?.userId ?? null, saved: profile.data?.preferredLanguage ?? null, mutate: update.mutate });
  useEffect(() => {
    latest.current = { userId: signedIn ? (user?.userId ?? null) : null, saved: profile.data?.preferredLanguage ?? null, mutate: update.mutate };
  });

  // Once per signed-in account: the account's language wins; an account without one adopts this device's.
  useEffect(() => {
    if (!signedIn || !user || !profile.data) return;
    if (reconciledFor.current === user.userId) return;
    reconciledFor.current = user.userId;
    const saved = profile.data.preferredLanguage ?? null;
    if (saved && isLocale(saved)) {
      if (saved !== getRequestLocale()) void setLocale(saved);
    } else {
      update.mutate({ preferredLanguage: getRequestLocale() });
    }
  }, [signedIn, user, profile.data, update]);

  useEffect(() => {
    if (!signedIn) reconciledFor.current = null;
  }, [signedIn]);

  // Later choices made on this device are saved to the account.
  useEffect(
    () =>
      subscribeLocale(() => {
        const { userId, saved, mutate } = latest.current;
        if (!userId || reconciledFor.current !== userId) return;
        const next = getLocale();
        if (saved === next) return;
        mutate({ preferredLanguage: next });
      }),
    [],
  );

  return null;
}
