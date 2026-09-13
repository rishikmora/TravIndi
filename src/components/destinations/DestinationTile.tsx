import Link from 'next/link';
import { SceneVisual } from '@/components/media/SceneVisual';
import { getDestinationPhotos } from '@/data/media/photos';
import { getState } from '@/data/states';
import type { Destination } from '@/data/types';
import { cn } from '@/utils/cn';

interface DestinationTileProps {
  destination: Destination;
  size?: 'default' | 'large';
  className?: string;
  priority?: boolean;
}

/** Image-led destination card: the place first, words second. */
export function DestinationTile({ destination, size = 'default', className, priority }: DestinationTileProps) {
  const state = getState(destination.state);
  const large = size === 'large';
  const hero = getDestinationPhotos(destination.slug)?.hero;
  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className={cn(
        'group relative isolate block overflow-hidden rounded-[1.25rem] bg-ink-3 text-paper',
        'shadow-[0_24px_60px_-32px_rgb(0_0_0/0.6)] transition-transform duration-700 ease-cinematic hover:-translate-y-1',
        className,
      )}
    >
      <div className="absolute inset-0 transition-transform duration-[1400ms] ease-cinematic group-hover:scale-[1.045]">
        <SceneVisual
          still={destination.still}
          photo={hero ? { src: large ? hero.src : hero.src_small } : null}
          theme={destination.scene}
          accent={destination.accent}
          alt=""
          priority={priority}
          sizes={large ? '(max-width: 768px) 92vw, 50vw' : '(max-width: 768px) 80vw, 25vw'}
          className="absolute inset-0"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" aria-hidden="true" />
      <div className={cn('relative flex h-full flex-col justify-end', large ? 'p-7 md:p-9' : 'p-5')}>
        <p className="label text-paper/65">{state?.name}</p>
        <h3
          className={cn(
            'mt-2 font-semibold tracking-[-0.03em]',
            large ? 'text-[clamp(2rem,3.4vw,3.25rem)] leading-[0.95]' : 'text-[1.5rem] leading-tight',
          )}
        >
          {destination.name}
        </h3>
        <p className={cn('mt-2 text-pretty text-paper/78', large ? 'max-w-md text-[1.05rem]' : 'text-[0.95rem]')}>
          {large ? destination.summary : destination.tagline}
        </p>
      </div>
    </Link>
  );
}
