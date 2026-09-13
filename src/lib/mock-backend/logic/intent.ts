import { destinations } from '@/data/destinations';
import { states } from '@/data/states';
import type {
  AmbiguityDto,
  ExtractedFieldDto,
  ExtractIntentRequestDto,
  IntentExtractionDto,
  ProfileDto,
  TripIntentField,
  TripIntentInputDto,
} from '@/types/api';

/*
 * Development stand-in for the backend's language-model intent extraction.
 * Deliberately conservative: it extracts only what the text states and turns
 * anything uncertain into a question rather than an assumption.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15,
};
const NUM = '(\\d{1,2}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen)';
const toNumber = (token: string | undefined) =>
  !token ? null : /^\d+$/.test(token) ? Number(token) : (NUMBER_WORDS[token.toLowerCase()] ?? null);

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIndex = (token: string) => MONTH_NAMES.findIndex((m) => m.startsWith(token.slice(0, 3).toLowerCase()));

const EXTRA_ALIASES: Record<string, string[]> = {
  'leh-ladakh': ['leh', 'ladakh'],
  gangtok: ['sikkim'],
  mahabalipuram: ['mamallapuram'],
  'rann-of-kutch': ['kutch', 'white rann'],
  gir: ['gir forest', 'sasan gir'],
  'puri-konark': ['puri', 'konark'],
  'ajanta-ellora': ['ajanta', 'ellora', 'aurangabad'],
  alappuzha: ['alleppey', 'kerala backwaters'],
  coorg: ['kodagu'],
  'andaman-islands': ['andaman', 'andamans', 'havelock', 'port blair'],
  meghalaya: ['shillong', 'cherrapunji', 'sohra'],
  'bodh-gaya': ['bodhgaya'],
  mysuru: ['mysore'],
  kolkata: ['calcutta'],
  mumbai: ['bombay'],
  varanasi: ['banaras', 'benares', 'kashi'],
  puducherry: ['pondicherry', 'pondy'],
  'spiti-valley': ['spiti'],
  delhi: ['new delhi'],
  jaipur: ['pink city'],
};
const GENERIC = new Set(['valley', 'islands', 'national park', 'lake', 'crater lake', 'the', 'city']);

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const destinationAliases = destinations.map((destination) => {
  const names = new Set<string>([destination.slug.replace(/-/g, ' '), destination.name.toLowerCase()]);
  destination.name
    .toLowerCase()
    .split(/\s*(?:&|\(|\)|,)\s*/)
    .forEach((part) => part && names.add(part.trim()));
  (EXTRA_ALIASES[destination.slug] ?? []).forEach((alias) => names.add(alias));
  return {
    destination,
    patterns: [...names].filter((n) => n.length >= 3 && !GENERIC.has(n)).map((n) => new RegExp(`\\b${escape(n)}\\b`, 'i')),
  };
});

const INTERESTS: Array<[RegExp, string]> = [
  [/\btemples?\b|\bdarshan\b/i, 'temples'],
  [/\bheritage\b|\bhistor(?:y|ic|ical)\b|\bforts?\b|\bpalaces?\b|\bmonuments?\b|\barchitecture\b/i, 'heritage'],
  [/\bfood\b|\bcuisine\b|\bstreet food\b|\beat(?:ing)?\b|\bfoodie\b/i, 'food'],
  [/\bnature\b|\bhills?\b|\bmountains?\b|\blakes?\b|\bgreenery\b/i, 'nature'],
  [/\bwildlife\b|\bsafari\b|\btigers?\b/i, 'wildlife'],
  [/\bbeach(?:es)?\b/i, 'beaches'],
  [/\bshopping\b|\bmarkets?\b|\bbazaars?\b/i, 'shopping'],
  [/\bmuseums?\b/i, 'museums'],
  [/\bcrafts?\b|\bart\b/i, 'art & crafts'],
  [/\bphotography\b/i, 'photography'],
  [/\btrek(?:king)?\b|\bhik(?:e|ing)\b/i, 'trekking'],
  [/\bspiritual\b|\byoga\b|\bmeditation\b|\bpilgrimage\b/i, 'spiritual'],
  [/\bnightlife\b/i, 'nightlife'],
  [/\bculture\b|\bfestivals?\b/i, 'culture'],
];

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function upcomingYear(month: number, day: number) {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), month, day);
  return candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? now.getFullYear() + 1 : now.getFullYear();
}

export function extractIntent(request: ExtractIntentRequestDto, profile: ProfileDto | null): IntentExtractionDto {
  const text = request.text.trim();
  const lower = text.toLowerCase();
  const intent: TripIntentInputDto = { ...(request.current_intent ?? {}) };
  const fields: ExtractedFieldDto[] = [];
  const ambiguities: AmbiguityDto[] = [];

  const mark = (field: TripIntentField, sourceText: string | null, confidence: ExtractedFieldDto['confidence'] = 'high') => {
    if (!fields.some((f) => f.field === field)) fields.push({ field, confidence, source_text: sourceText, from_profile: false });
  };
  const ask = (ambiguity: AmbiguityDto) => {
    if (!ambiguities.some((a) => a.field === ambiguity.field)) ambiguities.push(ambiguity);
  };

  // Duration ---------------------------------------------------------------
  const daysMatch = lower.match(new RegExp(`\\b${NUM}[\\s-]*days?\\b`));
  const nightsMatch = lower.match(new RegExp(`\\b${NUM}[\\s-]*nights?\\b`));
  const days = toNumber(daysMatch?.[1]);
  const nights = toNumber(nightsMatch?.[1]);
  if (days) {
    intent.days = days;
    mark('days', daysMatch![0]);
  }
  if (nights !== null && nightsMatch) {
    intent.nights = nights;
    mark('nights', nightsMatch[0]);
  }
  if (days && nights !== null && nightsMatch && (nights > days || nights < days - 1)) {
    ask({
      field: 'nights',
      question: `You mentioned ${days} days and ${nights} nights. Which should we plan for?`,
      options: [
        { label: `${days} days, ${Math.max(days - 1, 0)} nights`, value: { days, nights: Math.max(days - 1, 0) } },
        { label: `${nights + 1} days, ${nights} nights`, value: { days: nights + 1, nights } },
      ],
    });
  }
  if (!days && nights) {
    ask({
      field: 'days',
      question: `For ${nights} nights, how many days should we plan?`,
      options: [
        { label: `${nights + 1} days`, value: nights + 1 },
        { label: `${nights} days`, value: nights },
      ],
    });
  }
  if (!days && !nights) {
    const weekend = lower.match(/\b(long )?weekend\b/);
    if (weekend) {
      intent.days = weekend[1] ? 3 : 2;
      intent.nights = weekend[1] ? 2 : 1;
      mark('days', weekend[0], 'medium');
    } else if (/\b(?:a|one) week\b/.test(lower)) {
      intent.days = 7;
      mark('days', 'a week', 'medium');
    }
  }

  // Dates ------------------------------------------------------------------
  const range = lower.match(
    new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s*)?${MONTH}\\s*(?:to|-|–|until|till|through)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s*)?${MONTH}?`),
  );
  const rangeMonthFirst = lower.match(
    new RegExp(`${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|-|–|until|till)\\s*(?:${MONTH}\\s+)?(\\d{1,2})`),
  );
  if (range || rangeMonthFirst) {
    const startDay = Number(range ? range[1] : rangeMonthFirst![2]);
    const startMonth = monthIndex(range ? range[2]! : rangeMonthFirst![1]!);
    const endDay = Number(range ? range[3] : rangeMonthFirst![4]);
    const endMonth = monthIndex((range ? range[4] : rangeMonthFirst![3]) ?? (range ? range[2]! : rangeMonthFirst![1]!));
    const year = upcomingYear(startMonth, startDay);
    const endYear = endMonth < startMonth ? year + 1 : year;
    intent.start_date = isoDate(year, startMonth, startDay);
    intent.end_date = isoDate(endYear, endMonth, endDay);
    mark('start_date', (range ?? rangeMonthFirst)![0]);
    mark('end_date', (range ?? rangeMonthFirst)![0]);
    const span = Math.round((Date.parse(intent.end_date) - Date.parse(intent.start_date)) / 86_400_000);
    if (span >= 0 && !intent.days) {
      intent.days = span + 1;
      intent.nights ??= span;
    }
  } else if (/\btomorrow\b/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    intent.start_date = isoDate(d.getFullYear(), d.getMonth(), d.getDate());
    mark('start_date', 'tomorrow');
  } else {
    const monthOnly = lower.match(new RegExp(`\\b(?:in|during|this|next|around)\\s+${MONTH}\\b`));
    if (monthOnly) {
      const m = monthIndex(monthOnly[1]!);
      ask({
        field: 'start_date',
        question: `Which dates in ${MONTH_NAMES[m]![0]!.toUpperCase()}${MONTH_NAMES[m]!.slice(1)} work for you?`,
        options: [],
      });
    }
  }

  // Destination ------------------------------------------------------------
  const matches = destinationAliases
    .map(({ destination, patterns }) => {
      const hits = patterns.map((p) => p.exec(text)).filter((m): m is RegExpExecArray => Boolean(m));
      const first = hits.sort((a, b) => a.index - b.index)[0];
      return first ? { destination, index: first.index, source: first[0] } : null;
    })
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .sort((a, b) => a.index - b.index);

  if (matches.length === 1) {
    intent.destination = matches[0]!.destination.name;
    intent.destination_id = `dst_${matches[0]!.destination.slug}`;
    mark('destination', matches[0]!.source);
  } else if (matches.length > 1) {
    ask({
      field: 'destination',
      question: 'You mentioned several places. Which one should we plan first?',
      options: matches.map((m) => ({
        label: m.destination.name,
        value: { destination: m.destination.name, destination_id: `dst_${m.destination.slug}` },
      })),
    });
  } else {
    const stateMatch = states.find((state) => new RegExp(`\\b${escape(state.name)}\\b`, 'i').test(text));
    if (stateMatch) {
      const inState = destinations.filter((d) => d.state === stateMatch.slug);
      ask({
        field: 'destination',
        question: `Where in ${stateMatch.name} would you like to go?`,
        options: [
          ...inState.map((d) => ({ label: d.name, value: { destination: d.name, destination_id: `dst_${d.slug}` } })),
          { label: `Across ${stateMatch.name}`, value: { destination: stateMatch.name, destination_id: null } },
        ],
      });
    }
  }

  // Travellers & trip type -------------------------------------------------
  const adultsExplicit = toNumber(lower.match(new RegExp(`\\b${NUM}\\s+adults?\\b`))?.[1]);
  const childrenExplicit = toNumber(lower.match(new RegExp(`\\b${NUM}\\s+(?:kids|children|child)\\b`))?.[1]);
  const seniorsExplicit = toNumber(lower.match(new RegExp(`\\b${NUM}\\s+(?:seniors?|elderly)\\b`))?.[1]);

  if (adultsExplicit || childrenExplicit || seniorsExplicit) {
    intent.travellers = { adults: adultsExplicit ?? 0, children: childrenExplicit ?? 0, seniors: seniorsExplicit ?? 0 };
    mark('travellers', null);
  } else if (/\bwith my parents\b|\bwith (?:my )?(?:mom|mum|mother) and (?:dad|father)\b|\bwith (?:amma|appa)\b/.test(lower)) {
    intent.travellers = { adults: 3, children: 0, seniors: 0 };
    intent.trip_type ??= 'family';
    mark('travellers', lower.match(/with my parents|with (?:my )?(?:mom|mum|mother) and (?:dad|father)/)?.[0] ?? null, 'medium');
    mark('trip_type', 'parents', 'medium');
    ask({
      field: 'travellers',
      question: 'Are your parents 60 or older? We’ll pace the days more gently.',
      options: [
        { label: 'Yes, they are 60+', value: { adults: 1, children: 0, seniors: 2 } },
        { label: 'No', value: { adults: 3, children: 0, seniors: 0 } },
      ],
    });
  } else if (/\bsolo\b|\balone\b|\bby myself\b/.test(lower)) {
    intent.travellers = { adults: 1, children: 0, seniors: 0 };
    intent.trip_type ??= 'solo';
    mark('travellers', 'solo');
    mark('trip_type', 'solo');
  } else if (/\bhoneymoon\b/.test(lower)) {
    intent.travellers = { adults: 2, children: 0, seniors: 0 };
    intent.trip_type = 'honeymoon';
    mark('travellers', 'honeymoon');
    mark('trip_type', 'honeymoon');
  } else if (/\bwith my (?:wife|husband|partner|spouse)\b|\bcouple\b/.test(lower)) {
    intent.travellers = { adults: 2, children: 0, seniors: 0 };
    mark('travellers', lower.match(/with my (?:wife|husband|partner|spouse)|couple/)?.[0] ?? null);
  }
  if (/\b(?:kids|children|my son|my daughter)\b/.test(lower) && !childrenExplicit) {
    intent.trip_type ??= 'family';
    ask({
      field: 'travellers',
      question: 'How many children are travelling, and how old are they?',
      options: [
        { label: '1 child', value: { ...(intent.travellers ?? { adults: 2, seniors: 0 }), children: 1 } },
        { label: '2 children', value: { ...(intent.travellers ?? { adults: 2, seniors: 0 }), children: 2 } },
      ],
    });
  }
  if (/\bfamily\b/.test(lower) && !intent.trip_type) {
    intent.trip_type = 'family';
    mark('trip_type', 'family');
  }
  if (/\bwith (?:my )?friends\b/.test(lower)) {
    intent.trip_type = 'friends';
    mark('trip_type', 'friends');
  }
  if (/\bpilgrimage\b|\byatra\b/.test(lower)) {
    intent.trip_type = 'pilgrimage';
    mark('trip_type', 'pilgrimage');
  }

  // Interests & pace ---------------------------------------------------------
  const interests = new Set(intent.interests ?? []);
  for (const [pattern, interest] of INTERESTS) {
    const hit = pattern.exec(text);
    if (hit) interests.add(interest);
  }
  if (interests.size) {
    intent.interests = [...interests];
    mark('interests', null);
  }
  const relaxed = lower.match(/\b(?:relaxed|slow|leisurely|laid[- ]back|easy[- ]paced|not rushed|unhurried)\b/);
  const active = lower.match(/\b(?:packed|action[- ]packed|fast[- ]paced|see as much as possible)\b/);
  if (relaxed) {
    intent.pace = 'relaxed';
    mark('pace', relaxed[0]);
  } else if (active) {
    intent.pace = 'active';
    mark('pace', active[0]);
  }

  // Accessibility --------------------------------------------------------------
  const lowWalking = lower.match(
    /\b(?:low|less|little|minimal|limited|not (?:too |very )?much|no long|avoid(?:ing)?|without much) walking\b|can'?t walk (?:much|far|long)|difficulty walking|knee (?:pain|problems?)/,
  );
  const wheelchair = /\bwheelchair\b/.test(lower);
  const stepFree = lower.match(/\bstep[- ]free\b|\bno stairs\b|\bavoid stairs\b/);
  if (lowWalking || wheelchair || stepFree) {
    intent.accessibility = {
      low_walking: Boolean(lowWalking) || wheelchair || (intent.accessibility?.low_walking ?? false),
      wheelchair: wheelchair || (intent.accessibility?.wheelchair ?? false),
      step_free_access: Boolean(stepFree) || wheelchair || (intent.accessibility?.step_free_access ?? false),
      hearing_support: intent.accessibility?.hearing_support ?? false,
      visual_support: intent.accessibility?.visual_support ?? false,
      notes: intent.accessibility?.notes ?? null,
    };
    mark('accessibility', lowWalking?.[0] ?? stepFree?.[0] ?? 'wheelchair');
  }

  // Avoid ---------------------------------------------------------------------
  const avoid = new Set(intent.avoid ?? []);
  if (/\b(?:avoid|no|less|fewer|not too many) crowds?\b|\bless crowded\b|\bnot crowded\b/.test(lower)) avoid.add('crowds');
  if (/\b(?:avoid|no) long drives?\b/.test(lower)) avoid.add('long drives');
  if (/\b(?:avoid|no) (?:late nights?|night travel)\b/.test(lower)) avoid.add('late-night travel');
  if (avoid.size) {
    intent.avoid = [...avoid];
    mark('avoid', null);
  }

  // Budget --------------------------------------------------------------------
  const money =
    lower.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakhs?|l)?\b/) ??
    lower.match(/([\d,]+(?:\.\d+)?)\s*(k|thousand|lakhs?)?\s*(?:rupees|rs\b|inr)/) ??
    lower.match(/(?:budget|max(?:imum)?|under|below|within|up ?to)\s*(?:of\s*)?([\d,]+)\s*(k|thousand|lakhs?)\b/);
  if (money) {
    const base = Number(money[1]!.replace(/,/g, ''));
    const unit = money[2];
    const multiplier = unit === 'k' || unit === 'thousand' ? 1000 : unit?.startsWith('lakh') || unit === 'l' ? 100_000 : 1;
    const per = /\bper (?:day|night)\b|\ba day\b|\bdaily\b/.test(lower) ? 'day' : /\bper person\b|\beach\b|\bpp\b/.test(lower) ? 'person' : 'trip';
    intent.budget = { ceiling: { amount_minor: Math.round(base * multiplier * 100), currency: 'INR' }, level: null, per };
    mark('budget', money[0]);
  } else if (/\b(?:luxury|premium|splurge)\b/.test(lower)) {
    intent.budget = { ceiling: null, level: 'premium', per: 'trip' };
    mark('budget', 'luxury', 'medium');
  } else if (/\b(?:budget trip|cheap|affordable|on a budget)\b/.test(lower)) {
    intent.budget = { ceiling: null, level: 'budget', per: 'trip' };
    mark('budget', 'budget', 'medium');
  }

  // Safety ---------------------------------------------------------------------
  const maxSafety = lower.match(/\b(?:very safe|safest|maximum safety)\b/);
  const safety = lower.match(/\b(?:safe|safer|safety|secure)\b/);
  if (maxSafety) {
    intent.safety_preference = 'maximum';
    mark('safety_preference', maxSafety[0]);
  } else if (safety) {
    intent.safety_preference = 'high';
    mark('safety_preference', safety[0]);
  }

  // Food -----------------------------------------------------------------------
  const diet = /\bnon[- ]?veg(?:etarian)?\b/.test(lower)
    ? 'non_vegetarian'
    : /\bvegan\b/.test(lower)
      ? 'vegan'
      : /\bjain\b/.test(lower)
        ? 'jain'
        : /\b(?:pure )?veg(?:etarian)?\b/.test(lower)
          ? 'vegetarian'
          : /\bhalal\b/.test(lower)
            ? 'halal'
            : null;
  const mild = /\b(?:no|less|not too) spicy\b|\bmild food\b/.test(lower);
  if (diet || mild) {
    intent.food = {
      diet: diet ?? intent.food?.diet ?? null,
      spice_tolerance: mild ? 'mild' : (intent.food?.spice_tolerance ?? null),
      allergies: intent.food?.allergies ?? [],
      interests: intent.food?.interests ?? [],
    };
    mark('food', diet ?? 'mild');
  }

  // Transport & stay ---------------------------------------------------------
  const transport = new Set(intent.transport ?? []);
  if (/\btrains?\b/.test(lower)) transport.add('train');
  if (/\bfly\b|\bflights?\b/.test(lower)) transport.add('flight');
  if (/\bself[- ]drive\b|\bown car\b|\broad trip\b/.test(lower)) transport.add('car');
  if (/\bcabs?\b|\btaxis?\b/.test(lower)) transport.add('taxi');
  if (/\bmetro\b/.test(lower)) transport.add('metro');
  if (transport.size) {
    intent.transport = [...transport];
    mark('transport', null);
  }
  if (/\bhomestays?\b/.test(lower)) intent.accommodation = 'homestay';
  else if (/\bheritage hotel\b|\bhaveli\b|\bpalace hotel\b/.test(lower)) intent.accommodation = 'heritage';
  else if (/\bluxury hotel\b|\b5[- ]star\b/.test(lower)) intent.accommodation = 'premium';
  else if (/\bhostel\b|\bbudget hotel\b/.test(lower)) intent.accommodation = 'budget';
  if (intent.accommodation && !request.current_intent?.accommodation) mark('accommodation', null);

  if (/\bverified (?:guides?|providers?)\b/.test(lower)) {
    intent.booking_preferences = {
      book_through_travindi: intent.booking_preferences?.book_through_travindi ?? true,
      verified_providers_only: true,
      free_cancellation_preferred: intent.booking_preferences?.free_cancellation_preferred ?? false,
    };
    mark('booking_preferences', 'verified');
  }

  // Profile defaults (explicitly saved by the user, never inferred) ------------
  if (request.use_profile_defaults && profile) {
    const prefs = profile.travel_preferences;
    const fromProfile = (field: TripIntentField) =>
      fields.push({ field, confidence: 'high', source_text: null, from_profile: true });
    if (!intent.food && prefs.food?.diet && prefs.food.diet !== 'no_preference') {
      intent.food = prefs.food;
      fromProfile('food');
    }
    if (!intent.pace && prefs.pace) {
      intent.pace = prefs.pace;
      fromProfile('pace');
    }
    if (!intent.safety_preference && profile.safety_preferences.preference !== 'standard') {
      intent.safety_preference = profile.safety_preferences.preference;
      fromProfile('safety_preference');
    }
    const needs = profile.accessibility;
    if (!intent.accessibility && (needs.low_walking || needs.wheelchair || needs.step_free_access)) {
      intent.accessibility = needs;
      fromProfile('accessibility');
    }
  }

  const missing: TripIntentField[] = [];
  if (!intent.destination && !intent.destination_id && !ambiguities.some((a) => a.field === 'destination')) missing.push('destination');
  if (!intent.start_date && !ambiguities.some((a) => a.field === 'start_date')) missing.push('start_date');
  if (!intent.days && !(intent.start_date && intent.end_date) && !ambiguities.some((a) => a.field === 'days')) missing.push('days');

  return { intent, extracted_fields: fields, ambiguities, missing_fields: missing };
}
