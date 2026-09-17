import type en from './locales/en';

/** The English dictionary is the schema every other language follows. */
export type Messages = typeof en;

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends object ? `${K}.${Paths<T[K]>}` : never;
}[keyof T & string];

/** Every leaf key of the English dictionary, e.g. "safety.sos.send". */
export type MessageKey = Paths<Messages>;

type PluralBase<K extends string> = K extends `${infer Base}_${PluralSuffix}` ? Base : never;

/** A leaf key, or the base of a plural group ("trips.days" for "trips.days_one"/"trips.days_other"). */
export type TranslationKey = MessageKey | PluralBase<MessageKey>;

/** A dictionary for another language: same shape, any key may be missing (English fills gaps). */
export type PartialMessages = DeepPartial<Messages>;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
