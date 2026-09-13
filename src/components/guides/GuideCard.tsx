import Link from 'next/link';
import { SceneVisual } from '@/components/media/SceneVisual';
import { ArrowUpRightIcon } from '@/components/ui/icons';
import type { TravelGuide } from '@/data/types';

export function GuideCard({ guide }: { guide: TravelGuide }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="group grid grid-cols-[5.5rem_1fr_auto] items-center gap-5 border-t border-[var(--hairline)] py-6 md:grid-cols-[8rem_1fr_auto]"
    >
      <SceneVisual still={guide.still} className="aspect-[4/3] rounded-xl" sizes="128px" />
      <span className="min-w-0">
        <span className="label text-[var(--text-subtle)]">{guide.readingMinutes} min read</span>
        <span className="mt-2 block text-[clamp(1.15rem,1.8vw,1.5rem)] font-semibold leading-tight tracking-[-0.02em] transition-colors">
          {guide.title}
        </span>
        <span className="mt-1.5 hidden text-pretty text-[0.95rem] text-[var(--text-muted)] md:block">{guide.summary}</span>
      </span>
      <ArrowUpRightIcon
        size={22}
        className="text-[var(--text-subtle)] transition-[transform,color] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--text)]"
      />
    </Link>
  );
}
