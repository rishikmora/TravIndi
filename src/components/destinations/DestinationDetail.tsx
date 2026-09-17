'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PhotoCredit } from '@/components/media/PhotoCredit';
import { ButtonLink } from '@/components/ui/Button';
import { InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { describeCost } from '@/lib/format/money';
import { isRemoteImage, isTrustedImageUrl } from '@/lib/media/trusted';
import { useLocalizedDestination } from '@/lib/query/hooks/destinations';
import type { Destination, Image as ImageModel } from '@/types/domain';
import { cn } from '@/utils/cn';
import { formatMonthList } from '@/utils/format';
import { attractionTypeLabel, categoryLabel, experienceCategoryLabel, regionLabel } from './labels';
import { walkingLabel } from '../trips/detail/itemVocabulary';
import { DestinationCommunity, DestinationOffers, DestinationProviders, DestinationSafety } from './DestinationLive';

const SECTIONS = ['overview', 'photos', 'things-to-do', 'food', 'getting-there', 'book', 'safety', 'access', 'local-experts', 'community'] as const;

function Block({ id, title, children, description }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-[calc(var(--nav-height)+4rem)] gap-5 border-t border-[var(--hairline)] pt-10">
      <div className="grid gap-1">
        <h2 id={`${id}-title`} className="text-[1.75rem] font-semibold tracking-[-0.025em]">
          {title}
        </h2>
        {description && <p className="text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** A mosaic of up to five photographs, each credited on the image. */
function Gallery({ images }: { images: ImageModel[] }) {
  return (
    <ul className="grid auto-rows-[10.5rem] grid-cols-2 gap-3 md:auto-rows-[12.5rem] md:grid-cols-4">
      {images
        .filter((image) => isTrustedImageUrl(image.url))
        .slice(0, 5)
        .map((image, index) => (
          <li key={image.url} className={cn('relative overflow-hidden rounded-[1.25rem] bg-navy', index === 0 && 'col-span-2 row-span-2')}>
            <Image
              src={index === 0 ? image.url : (image.urlSmall ?? image.url)}
              alt={image.alt}
              fill
              sizes={index === 0 ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 768px) 25vw, 50vw'}
              unoptimized={isRemoteImage(image.url)}
              className="object-cover"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
            <PhotoCredit image={image} compact={index !== 0} className="absolute inset-x-3 bottom-2 text-ivory/90" />
          </li>
        ))}
    </ul>
  );
}

export function DestinationDetail({ destination }: { destination: Destination }) {
  const { t, locale } = useTranslation();
  // Server-rendered in English; the traveller's language is fetched on arrival.
  const d = useLocalizedDestination(destination);
  const image = d.heroImage && isTrustedImageUrl(d.heroImage.url) ? d.heroImage : null;
  // Credited photography fills the header; rendered scene stills stay dimmed behind the title.
  const photo = image?.attribution ? image : null;
  const conditionsKnown = Boolean(d.conditions.weather || d.conditions.crowd || d.conditions.transport);
  const { minDays, maxDays } = d.idealDuration;

  return (
    <article className="theme-app" data-nav-theme="light">
      <header
        className={cn('theme-app-dark relative isolate flex flex-col justify-end overflow-hidden pb-14 pt-[calc(var(--nav-height)+4rem)]', photo && 'min-h-[min(44rem,88svh)]')}
        data-nav-theme="dark"
      >
        {image && <Image src={image.url} alt={image.alt} fill priority sizes="100vw" unoptimized={isRemoteImage(image.url)} className={cn('-z-10 object-cover', !photo && 'opacity-60')} />}
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 -z-10',
            photo
              ? 'bg-[linear-gradient(180deg,rgb(20_33_61/0.5)_0%,rgb(20_33_61/0.08)_32%,rgb(20_33_61/0.3)_58%,rgb(20_33_61/0.92)_100%)]'
              : 'bg-[linear-gradient(180deg,rgb(20_33_61/0.35),rgb(20_33_61/0.92))]',
          )}
        />
        <div className="mx-auto grid w-full max-w-6xl gap-4 page-gutter">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="accent">{categoryLabel(t, d.category)}</StatusPill>
            <StatusPill>{d.state}</StatusPill>
            <StatusPill>{regionLabel(t, d.region)}</StatusPill>
          </div>
          <h1 className="text-balance text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">{d.name}</h1>
          <p className="editorial max-w-2xl text-[clamp(1.25rem,2.4vw,1.75rem)] italic text-[var(--text-muted)]">{d.tagline}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <ButtonLink href={`/trips/plan?q=${encodeURIComponent(t('destinations.detail.planQuery', { name: d.name }))}`} variant="accent" size="lg">
              {t('destinations.detail.planHere')}
            </ButtonLink>
            <ButtonLink href={`/map?destination=${d.slug}`} variant="glass" size="lg">
              {t('destinations.detail.seeOnMap')}
            </ButtonLink>
          </div>
        </div>
        {photo && <PhotoCredit image={photo} className="absolute bottom-3 right-4 max-w-[min(30rem,70vw)] text-right text-ivory/70" />}
      </header>

      <nav aria-label={t('destinations.detail.sectionsNav', { name: d.name })} className="sticky top-[var(--nav-height)] z-30 border-b border-[var(--hairline)] bg-ivory/95 backdrop-blur">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto page-gutter [scrollbar-width:none]">
          {SECTIONS.filter((section) => section !== 'photos' || d.gallery.length > 0).map((section) => (
            <li key={section}>
              <a href={`#${section}`} className="inline-flex min-h-11 items-center whitespace-nowrap px-3 text-[0.9375rem] font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
                {t(`destinations.detail.sections.${section}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto grid max-w-6xl gap-10 pb-20 pt-10 page-gutter">
        <section id="overview" aria-labelledby="overview-title" className="grid scroll-mt-[calc(var(--nav-height)+4rem)] gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <h2 id="overview-title" className="sr-only">
              {t('destinations.detail.sections.overview')}
            </h2>
            {d.description.map((paragraph, index) => (
              <p key={index} className="text-[1.0625rem] leading-relaxed">
                {paragraph}
              </p>
            ))}
            {d.whyVisit.length > 0 && (
              <div className="grid gap-2">
                <h3 className="font-semibold">{t('destinations.detail.whyGo')}</h3>
                <ul className="grid gap-1.5">
                  {d.whyVisit.map((reason, index) => (
                    <li key={index} className="flex gap-2">
                      <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-terracotta" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <dl className="surface-card grid content-start gap-4 p-5">
            <div>
              <dt className="label text-[var(--text-subtle)]">{t('destinations.detail.bestTime')}</dt>
              <dd className="font-semibold">{formatMonthList(d.bestTime.months, locale)}</dd>
              <dd className="text-[0.9375rem] text-[var(--text-muted)]">{d.bestTime.note}</dd>
            </div>
            <div>
              <dt className="label text-[var(--text-subtle)]">{t('destinations.detail.howLong')}</dt>
              <dd className="font-semibold">
                {minDays === maxDays ? t('destinations.detail.days', { count: minDays }) : t('destinations.detail.dayRange', { min: minDays, max: maxDays })}
              </dd>
            </div>
            {d.permits && (
              <div>
                <dt className="label text-[var(--text-subtle)]">{t('destinations.detail.permits')}</dt>
                <dd className="text-[0.9375rem]">{d.permits}</dd>
              </div>
            )}
            <div>
              <dt className="label text-[var(--text-subtle)]">{t('destinations.detail.liveConditions')}</dt>
              <dd className="text-[0.9375rem] text-[var(--text-muted)]">
                {conditionsKnown ? t('destinations.detail.conditionsBelow') : t('destinations.detail.conditionsUnavailable')}
              </dd>
            </div>
          </dl>
        </section>

        {d.gallery.length > 0 && (
          <Block id="photos" title={t('destinations.detail.inPictures', { name: d.name })} description={t('destinations.detail.photosDescription')}>
            <Gallery images={d.gallery} />
            <Link href="/photo-credits" className="justify-self-start text-[0.875rem] font-medium text-[var(--link)] underline underline-offset-4">
              {t('destinations.detail.allPhotoCredits')}
            </Link>
          </Block>
        )}

        <Block id="things-to-do" title={t('destinations.detail.thingsToDo')} description={t('destinations.detail.thingsToDoDescription')}>
          <ul className="grid gap-4 md:grid-cols-2">
            {d.attractions.map((attraction) => {
              const cost = describeCost(attraction.entryCost, locale);
              const picture = attraction.image && isTrustedImageUrl(attraction.image.url) ? attraction.image : null;
              return (
                <li key={attraction.attractionId} className="surface-card grid content-start overflow-hidden">
                  {picture && (
                    <div className="relative aspect-[16/9] bg-navy">
                      <Image src={picture.urlSmall ?? picture.url} alt={picture.alt} fill sizes="(min-width: 768px) 50vw, 100vw" unoptimized={isRemoteImage(picture.url)} className="object-cover" />
                      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                      <PhotoCredit image={picture} compact className="absolute inset-x-3 bottom-2 text-ivory/90" />
                    </div>
                  )}
                  <div className="grid content-start gap-2 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[1.125rem] font-semibold">{attraction.name}</h3>
                      {attraction.unesco && <StatusPill tone="accent">UNESCO</StatusPill>}
                    </div>
                    <p className="text-[0.875rem] capitalize text-[var(--text-muted)]">
                      {[attraction.category ? attractionTypeLabel(t, attraction.category) : null, attraction.era].filter(Boolean).join(' · ')}
                    </p>
                    <p>{attraction.summary}</p>
                    <p className="text-[0.875rem] text-[var(--text-muted)]">
                      {[
                        attraction.accessibility?.walkingLevel ? walkingLabel(attraction.accessibility.walkingLevel) : t('destinations.detail.walkingNotConfirmed'),
                        cost.status === 'unavailable' ? t('destinations.detail.entryFeeNotConfirmed') : cost.label,
                      ].join(' · ')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {d.experiences.length > 0 && (
            <div className="grid gap-3">
              <h3 className="text-[1.25rem] font-semibold">{t('destinations.detail.experiences')}</h3>
              <ul className="grid gap-3 md:grid-cols-2">
                {d.experiences.map((experience) => (
                  <li key={experience.experienceId} className="grid gap-1 rounded-2xl p-4 ring-1 ring-inset ring-[var(--hairline)]">
                    <span className="font-semibold">{experience.name}</span>
                    <span className="text-[0.875rem] capitalize text-[var(--text-muted)]">
                      {[experience.category ? experienceCategoryLabel(t, experience.category) : null, experience.durationLabel].filter(Boolean).join(' · ')}
                    </span>
                    <span className="text-[0.9375rem]">{experience.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Block>

        <Block id="food" title={t('destinations.detail.foodTitle')}>
          {d.food.length === 0 ? (
            <p className="text-[var(--text-muted)]">{t('destinations.detail.foodEmpty', { name: d.name })}</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {d.food.map((item) => (
                <li key={item.foodId} className="grid gap-1 rounded-2xl p-4 ring-1 ring-inset ring-[var(--hairline)]">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.name}</span>
                    {item.vegetarian === true && <StatusPill tone="success">{t('destinations.detail.vegetarian')}</StatusPill>}
                    {item.vegetarian === false && <StatusPill>{t('destinations.detail.nonVegetarian')}</StatusPill>}
                  </span>
                  <span className="text-[0.9375rem] text-[var(--text-muted)]">{item.description}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block id="getting-there" title={t('destinations.detail.gettingThere')}>
          <dl className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['byAir', d.gettingThere.air],
                ['byRail', d.gettingThere.rail],
                ['byRoad', d.gettingThere.road],
              ] as const
            )
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="surface-card grid gap-1 p-4">
                  <dt className="label text-[var(--text-subtle)]">{t(`destinations.detail.${label}`)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </Block>

        <Block id="book" title={t('destinations.detail.bookTitle')} description={t('destinations.detail.bookDescription', { name: d.name })}>
          <DestinationOffers destinationId={d.destinationId} name={d.name} />
        </Block>

        <Block id="safety" title={t('destinations.detail.safety')}>
          <DestinationSafety initial={d} />
        </Block>

        <Block id="access" title={t('destinations.detail.access')}>
          <p className="text-[1.0625rem]">{d.accessibility.summary}</p>
          {d.accessibility.stepFreeHighlights.length > 0 && (
            <div className="grid gap-1">
              <h3 className="font-semibold">{t('destinations.detail.gentlerOptions')}</h3>
              <p className="text-[var(--text-muted)]">{d.accessibility.stepFreeHighlights.join(t('common.list.separator'))}</p>
            </div>
          )}
          {d.accessibility.considerations.length > 0 && (
            <InlineNotice tone="warning" title={t('destinations.detail.worthKnowing')}>
              <ul className="grid gap-1">
                {d.accessibility.considerations.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </InlineNotice>
          )}
        </Block>

        <Block id="local-experts" title={t('destinations.detail.localExperts')} description={t('destinations.detail.localExpertsDescription')}>
          <DestinationProviders destinationId={d.destinationId} name={d.name} />
        </Block>

        <Block id="community" title={t('destinations.detail.community')} description={t('destinations.detail.communityDescription', { name: d.name })}>
          <DestinationCommunity destinationId={d.destinationId} name={d.name} />
        </Block>
      </div>
    </article>
  );
}
