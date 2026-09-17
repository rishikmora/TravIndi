import type { Translator } from '@/i18n/translate';

/*
 * Labels for catalogue values that arrive from the API as plain words
 * ("heritage", "South", "wildlife reserve"). Known values are translated;
 * anything new is shown as the backend sent it.
 */

const keyOf = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

export const categoryLabel = (t: Translator, category: string) =>
  t.dynamic(`destinations.categories.${keyOf(category)}`, undefined, { fallback: category });

export const regionLabel = (t: Translator, region: string) =>
  t.dynamic(`destinations.regions.${keyOf(region)}`, undefined, { fallback: region });

export const attractionTypeLabel = (t: Translator, type: string) =>
  t.dynamic(`destinations.attractionTypes.${keyOf(type)}`, undefined, { fallback: type });

export const experienceCategoryLabel = (t: Translator, category: string) =>
  t.dynamic(`destinations.experienceCategories.${keyOf(category)}`, undefined, { fallback: category });
