import type { ReactNode } from 'react';
import { LogoMark } from '@/components/brand/Logo';

/** Split layout for sign-in and registration: a calm heritage panel beside the form. */
export function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="theme-app grid min-h-[100dvh] pt-[var(--nav-height)] lg:grid-cols-[1fr_1.1fr]" data-nav-theme="light">
      <aside
        aria-hidden="true"
        className="theme-app-dark relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-end lg:p-14"
      >
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_10%,rgb(212_166_73/0.22),transparent_60%),radial-gradient(70%_60%_at_90%_90%,rgb(29_107_107/0.35),transparent_65%)]" />
        <svg className="absolute right-[-10%] top-[12%] h-[70%] opacity-[0.12]" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.6">
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx="100" cy="100" r={12 + i * 10} />
          ))}
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return <line key={i} x1="100" y1="100" x2={100 + Math.cos(a) * 95} y2={100 + Math.sin(a) * 95} />;
          })}
        </svg>
        <div className="relative max-w-md">
          <LogoMark className="size-10 text-[var(--color-gold)]" />
          <p className="editorial mt-6 text-[2.5rem] italic leading-[1.05]">A journey that listens, and keeps you safe along the way.</p>
          <p className="mt-4 text-[var(--text-muted)]">Plans that adapt when things change. People you trust, close by.</p>
        </div>
      </aside>
      <div className="flex items-center justify-center px-5 py-12 md:px-10">
        <div className="w-full max-w-md">
          <h1 className="text-[2rem] font-semibold tracking-[-0.03em]">{title}</h1>
          <p className="mt-2 text-[var(--text-muted)]">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
