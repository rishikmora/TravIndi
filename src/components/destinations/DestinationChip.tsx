import Link from 'next/link';
import { SceneVisual } from '@/components/media/SceneVisual';
import { ArrowUpRightIcon } from '@/components/ui/icons';
import { getDestinationPhotos } from '@/data/media/photos';
import { getState } from '@/data/states';
import type { Destination } from '@/data/types';

/** Compact destination link designed to sit over live 3D scenes. */
export function DestinationChip({ destination }: { destination: Destination }) {
  const state = getState(destination.state);
  const hero = getDestinationPhotos(destination.slug)?.hero;
  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group flex w-[16.5rem] shrink-0 items-center gap-3 rounded-2xl bg-black/30 p-2 pr-4 text-paper ring-1 ring-inset ring-white/12 backdrop-blur-xl transition-[background-color,transform] duration-500 ease-cinematic hover:-translate-y-0.5 hover:bg-black/45"
    >
      <SceneVisual
        still={destination.still}
        photo={hero ? { src: hero.src_thumb ?? hero.src_small } : null}
        theme={destination.scene}
        accent={destination.accent}
        className="size-16 shrink-0 rounded-xl"
        sizes="64px"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem] font-medium tracking-[-0.01em]">{destination.name}</span>
        <span className="mt-0.5 block truncate text-[0.8rem] text-paper/60">{state?.name}</span>
      </span>
      <ArrowUpRightIcon size={16} className="shrink-0 opacity-50 transition-opacity duration-300 group-hover:opacity-100" />
    </Link>
  );
}
