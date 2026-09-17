'use client';

import { useTranslation } from '@/i18n/react';
import { cn } from '@/utils/cn';

const PALETTE = ['#1d6b6b', '#a84a2a', '#2a3a5c', '#8a5300', '#276b43', '#6b3f73'];

function initials(name: string) {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}

function hue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Presence shown only when the person has permitted it. */
  presence?: 'online' | 'away' | 'offline' | null;
  className?: string;
  /** Decorative when the name is already shown next to it. */
  decorative?: boolean;
}

const SIZES = { xs: 'size-6 text-[0.625rem]', sm: 'size-8 text-[0.75rem]', md: 'size-10 text-[0.875rem]', lg: 'size-14 text-[1.125rem]' } as const;

export function Avatar({ name, src, size = 'md', presence, className, decorative = false }: AvatarProps) {
  const { t } = useTranslation();
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden={decorative || undefined}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user avatars come from the API's own origin
        <img src={src} alt={decorative ? '' : name} className={cn('rounded-full object-cover', SIZES[size])} />
      ) : (
        <span
          role={decorative ? undefined : 'img'}
          aria-label={decorative ? undefined : name}
          className={cn('inline-flex items-center justify-center rounded-full font-semibold text-white', SIZES[size])}
          style={{ backgroundColor: hue(name) }}
        >
          {initials(name)}
        </span>
      )}
      {presence && presence !== 'offline' && (
        <span
          className={cn(
            'absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-[var(--surface-raised)]',
            presence === 'online' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-saffron-muted)]',
          )}
          aria-label={decorative ? undefined : presence === 'online' ? t('common.labels.online') : t('common.labels.away')}
          role={decorative ? undefined : 'img'}
        />
      )}
    </span>
  );
}
