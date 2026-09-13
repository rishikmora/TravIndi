import Image from 'next/image';
import { getStill, themeOfStill } from '@/data/media/stills';
import type { SceneThemeId } from '@/data/types';
import { cn } from '@/utils/cn';
import { SceneArt } from './SceneArt';

interface SceneVisualProps {
  still: string;
  /** Curated photography, preferred over the rendered still when present. */
  photo?: { src: string } | null;
  theme?: SceneThemeId;
  accent?: string;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
}

/**
 * Progressive scene imagery: a curated photograph, else an optimised still
 * (with blur preview) when one has been rendered or supplied, otherwise the
 * vector vignette for its theme.
 */
export function SceneVisual({
  still,
  photo,
  theme,
  accent,
  alt = '',
  sizes = '(max-width: 768px) 90vw, 33vw',
  priority = false,
  className,
  imageClassName,
}: SceneVisualProps) {
  const asset = getStill(still);
  return (
    <div className={cn('relative overflow-hidden bg-ink-3', className)}>
      {photo ? (
        // Photos arrive already resized by their host.
        <Image src={photo.src} alt={alt} fill sizes={sizes} priority={priority} unoptimized className={cn('object-cover', imageClassName)} />
      ) : asset ? (
        <Image
          src={asset.src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          quality={75}
          placeholder={asset.blur ? 'blur' : 'empty'}
          blurDataURL={asset.blur}
          className={cn('object-cover', imageClassName)}
        />
      ) : (
        <SceneArt theme={theme ?? themeOfStill(still)} accent={accent} label={alt} />
      )}
    </div>
  );
}
