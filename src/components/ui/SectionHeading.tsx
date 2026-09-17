import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightIcon } from '@/components/ui/icons';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/utils/cn';

interface SectionHeadingProps {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: { href: string; label: ReactNode };
  id?: string;
  className?: string;
}

export function SectionHeading({ eyebrow, title, description, action, id, className }: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', className)}>
      <Reveal className="max-w-2xl">
        <p className="label text-[var(--text-subtle)]">{eyebrow}</p>
        <h2 id={id} className="display-lg mt-4 text-balance">
          {title}
        </h2>
        {description ? (
          <p className="body-lg mt-4 max-w-xl text-pretty text-[var(--text-muted)]">{description}</p>
        ) : null}
      </Reveal>
      {action ? (
        <Reveal delay={120}>
          <Link
            href={action.href}
            className="group inline-flex items-center gap-2 rounded-full text-[0.95rem] font-medium text-[var(--text)]"
          >
            {action.label}
            <ArrowRightIcon size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>
      ) : null}
    </div>
  );
}
