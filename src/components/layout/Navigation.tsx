'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUnreadCounts } from '@/components/app/useUnreadCounts';
import { LogoMark } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import {
  BellIcon,
  CompassIcon,
  HomeIcon,
  MapIcon,
  MessageIcon,
  SearchIcon,
  ShieldIcon,
  SuitcaseIcon,
  UserIcon,
} from '@/components/ui/icons';
import { type PrimaryNavId, site } from '@/data/site';
import { useAuth } from '@/lib/auth/provider';
import { useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

type NavTheme = 'dark' | 'light';

const ICONS: Record<PrimaryNavId, typeof HomeIcon> = {
  home: HomeIcon,
  discover: CompassIcon,
  trips: SuitcaseIcon,
  map: MapIcon,
  messages: MessageIcon,
  safety: ShieldIcon,
  profile: UserIcon,
};

const MOBILE_TABS: PrimaryNavId[] = ['home', 'discover', 'trips', 'map', 'messages'];

const SECTION_PREFIXES: Partial<Record<PrimaryNavId, string[]>> = {
  discover: ['/destinations', '/search', '/guides', '/businesses', '/verify', '/trust'],
  trips: ['/trips', '/bookings'],
  map: ['/map', '/routes'],
  messages: ['/messages'],
  safety: ['/safety', '/sos', '/location-sharing', '/trusted-contacts', '/report'],
  profile: ['/profile', '/settings', '/consents', '/accessibility', '/notifications'],
};

function isActive(pathname: string, id: PrimaryNavId) {
  if (id === 'home') return pathname === '/';
  return (SECTION_PREFIXES[id] ?? []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Samples the surface under the bar so its ink colour stays legible over 3D and product pages. */
function useSurfaceUnderNav(pathname: string) {
  const [theme, setTheme] = useState<NavTheme>(pathname === '/' ? 'dark' : 'light');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    let regions: { top: number; bottom: number; light: boolean }[] = [];
    let measuredAt = -Infinity;
    // Section bounds are read at most once a second (and after resizes) rather
    // than hit-testing the page on every scroll frame, which forced a full
    // layout while the 3D journey was animating.
    const collect = () => {
      const offset = window.scrollY;
      regions = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-theme]')).map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top + offset, bottom: rect.bottom + offset, light: el.dataset.navTheme === 'light' };
      });
      measuredAt = performance.now();
    };
    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      if (performance.now() - measuredAt > 1000) collect();
      const probe = y + 36;
      let match: (typeof regions)[number] | null = null;
      for (const region of regions) {
        if (probe < region.top || probe >= region.bottom) continue;
        if (!match || region.bottom - region.top < match.bottom - match.top) match = region;
      }
      setTheme(match ? (match.light ? 'light' : 'dark') : pathname === '/' ? 'dark' : 'light');
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onResize = () => {
      measuredAt = -Infinity;
      schedule();
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
    };
  }, [pathname]);

  return { theme, scrolled };
}

function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -right-1 -top-1 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-terracotta px-1 text-[0.625rem] font-bold leading-none text-white ring-2 ring-[var(--nav-ring,transparent)]"
      >
        {count > 99 ? '99+' : count}
      </span>
      <span className="sr-only">
        , {count} {label}
      </span>
    </>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const loadPhase = useJourneyStore((s) => s.loadPhase);
  const { status, user } = useAuth();
  const unread = useUnreadCounts();
  const { theme, scrolled } = useSurfaceUnderNav(pathname);

  const hidden = pathname === '/' && loadPhase !== 'entered';
  const light = theme === 'light';
  const signedIn = status === 'authenticated' && user;
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  const iconButton = 'tap-target relative inline-flex items-center justify-center rounded-full transition-colors hover:bg-current/10';

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-[transform,opacity,color] duration-700 ease-cinematic',
          hidden && 'pointer-events-none -translate-y-3 opacity-0',
          light ? 'text-navy' : 'text-paper',
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 backdrop-blur-xl backdrop-saturate-150 transition-[opacity,background-color] duration-500',
            scrolled || pathname !== '/' ? 'opacity-100' : 'opacity-0',
            light ? 'bg-ivory/85 shadow-[0_1px_0_rgb(20_33_61/0.08)]' : 'bg-ink/45 shadow-[0_1px_0_rgb(255_255_255/0.06)]',
          )}
        />
        <div
          className={cn(
            'relative flex items-center justify-between gap-3 page-gutter transition-[height] duration-500 ease-cinematic',
            scrolled ? 'h-14' : 'h-[4.5rem]',
          )}
        >
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-full" aria-label={`${site.name} home`}>
            <LogoMark className={cn('transition-[width,height] duration-500', scrolled ? 'size-6' : 'size-7')} />
            <span className="text-[1.0625rem] font-semibold tracking-[-0.03em]">{site.name}</span>
          </Link>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul
              className={cn(
                'flex items-center gap-0.5 rounded-full p-1 ring-1 ring-inset transition-colors duration-500',
                light ? 'bg-navy/[0.04] ring-navy/10' : 'bg-white/[0.06] ring-white/12 backdrop-blur-md',
              )}
            >
              {site.nav.map((item) => {
                const active = isActive(pathname, item.id);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative block rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium tracking-[-0.01em] transition-[background-color,color,opacity] duration-300',
                        active ? (light ? 'bg-navy text-ivory' : 'bg-paper text-ink') : 'opacity-80 hover:bg-current/10 hover:opacity-100',
                      )}
                    >
                      {item.label}
                      {item.id === 'messages' && <Badge count={unread.messages} label="unread messages" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-0.5">
            <Link href="/search" className={cn(iconButton, 'gap-2 px-3')} aria-label="Search destinations, guides and places">
              <SearchIcon size={19} />
            </Link>
            <Link
              href="/safety"
              aria-current={isActive(pathname, 'safety') ? 'page' : undefined}
              className={cn(iconButton, 'gap-1.5 px-3 lg:hidden')}
            >
              <ShieldIcon size={19} />
              <span className="text-[0.8125rem] font-medium">Safety</span>
            </Link>
            {signedIn && (
              <Link href="/notifications" className={iconButton} aria-label="Notifications">
                <BellIcon size={19} />
                <Badge count={unread.notifications} label="unread notifications" />
              </Link>
            )}
            {signedIn ? (
              <Link
                href="/profile"
                className={cn(iconButton, 'ml-1 lg:hidden')}
                aria-label={`Your profile, ${user.displayName}`}
                aria-current={isActive(pathname, 'profile') ? 'page' : undefined}
              >
                <Avatar name={user.displayName} src={user.avatarUrl} size="sm" decorative />
              </Link>
            ) : status === 'loading' ? (
              <span className="ml-1 size-8 rounded-full bg-current/10" aria-hidden="true" />
            ) : (
              <Link
                href={loginHref}
                className={cn(
                  'ml-1 inline-flex h-9 items-center rounded-full px-4 text-[0.875rem] font-semibold transition-colors',
                  light ? 'bg-navy text-ivory hover:bg-navy-3' : 'bg-paper text-ink hover:bg-white',
                )}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className={cn(
          'theme-app fixed inset-x-0 bottom-0 z-50 border-t border-[var(--hairline)] bg-ivory/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-[transform,opacity] duration-500 lg:hidden',
          hidden && 'pointer-events-none translate-y-full opacity-0',
        )}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS.map((id) => {
            const item = site.nav.find((n) => n.id === id)!;
            const Icon = ICONS[id];
            const active = isActive(pathname, id);
            return (
              <li key={id}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors',
                    active ? 'text-terracotta' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  <span className="relative">
                    <Icon size={22} strokeWidth={active ? 2 : 1.6} />
                    {id === 'messages' && <Badge count={unread.messages} label="unread messages" />}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
