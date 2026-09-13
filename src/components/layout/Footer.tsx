import Link from 'next/link';
import { LogoMark } from '@/components/brand/Logo';
import { site } from '@/data/site';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="theme-dark relative overflow-hidden border-t border-[var(--hairline)]" data-nav-theme="dark">
      <div className="grid gap-12 py-20 page-gutter sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-full">
            <LogoMark className="size-8" />
            <span className="text-xl font-semibold tracking-[-0.03em]">{site.name}</span>
          </Link>
          <p className="mt-5 max-w-sm text-pretty text-[0.95rem] leading-relaxed text-[var(--text-muted)]">
            {site.description}
          </p>
        </div>
        {site.footer.columns.map((column) => (
          <nav key={column.heading} aria-label={column.heading}>
            <h2 className="label text-[var(--text-subtle)]">{column.heading}</h2>
            <ul className="mt-5 grid gap-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded text-[0.95rem] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="flex flex-col gap-3 border-t border-[var(--hairline)] py-6 text-[0.8125rem] text-[var(--text-subtle)] page-gutter md:flex-row md:items-center md:justify-between">
        <p>
          © {year} {site.name}. {site.footer.disclaimer}
        </p>
        <p className="max-w-xl md:text-right">
          {site.footer.legal}{' '}
          <Link href="/photo-credits" className="rounded underline underline-offset-2 transition-colors hover:text-[var(--text)]">
            Photo credits
          </Link>
        </p>
      </div>
      <p
        aria-hidden="true"
        className="pointer-events-none select-none whitespace-nowrap text-center text-[23vw] font-semibold leading-[0.72] tracking-[-0.06em] text-white/[0.035]"
      >
        {site.name}
      </p>
    </footer>
  );
}
