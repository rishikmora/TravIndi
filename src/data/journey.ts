import type { ChapterId } from '@/scenes/types';

export interface ChapterBeatWindows {
  title: [number, number];
  body: [number, number];
  stat: [number, number];
  feature: [number, number];
  cards: [number, number];
}

/**
 * The structure of a journey chapter. Its words (name, subject, line, body,
 * location, stat, feature line and scene description) are translations under
 * `journey.chapters.<id>`.
 */
export interface ChapterCopy {
  id: ChapterId;
  number: string;
  /** Scroll length in viewport heights (desktop). */
  length: number;
  /** Scroll length on small screens, where travel should feel shorter. */
  mobileLength: number;
  accent: string;
  /** Shows `statValue` / `statLabel`. */
  hasStat?: boolean;
  feature?: { destination: string; attraction: string };
  destinations: string[];
  align: 'start' | 'end' | 'center';
  beats?: Partial<ChapterBeatWindows>;
}

export const DEFAULT_BEATS: ChapterBeatWindows = {
  title: [0.04, 0.6],
  body: [0.1, 0.6],
  stat: [0.3, 0.72],
  feature: [0.42, 0.9],
  cards: [0.66, 1.2],
};

export const chapters: ChapterCopy[] = [
  {
    id: 'beginning',
    number: '01',
    length: 2.4,
    mobileLength: 1.8,
    accent: '#E8A04B',
    destinations: [],
    align: 'center',
    beats: { title: [0, 0.55] },
  },
  {
    id: 'mountains',
    number: '02',
    length: 3.2,
    mobileLength: 2.2,
    accent: '#8FB3D9',
    hasStat: true,
    destinations: ['leh-ladakh', 'spiti-valley', 'manali', 'darjeeling', 'gangtok', 'valley-of-flowers'],
    align: 'start',
  },
  {
    id: 'rivers',
    number: '03',
    length: 3,
    mobileLength: 2.1,
    accent: '#E8A04B',
    hasStat: true,
    destinations: ['varanasi', 'rishikesh', 'majuli', 'bodh-gaya'],
    align: 'end',
  },
  {
    id: 'kingdoms',
    number: '04',
    length: 2.8,
    mobileLength: 2,
    accent: '#D08A4E',
    hasStat: true,
    destinations: ['hampi', 'ajanta-ellora', 'warangal', 'rann-of-kutch'],
    align: 'start',
  },
  {
    id: 'temples',
    number: '05',
    length: 3.2,
    mobileLength: 2.2,
    accent: '#E07A3F',
    feature: { destination: 'madurai', attraction: 'meenakshi-temple' },
    destinations: ['madurai', 'thanjavur', 'khajuraho', 'puri-konark', 'amritsar', 'mahabalipuram'],
    align: 'end',
  },
  {
    id: 'empires',
    number: '06',
    length: 3.4,
    mobileLength: 2.3,
    accent: '#C9573A',
    destinations: ['jaipur', 'jodhpur', 'hyderabad', 'delhi', 'ranthambore'],
    align: 'start',
    beats: { cards: [0.7, 1.2] },
  },
  {
    id: 'monuments',
    number: '07',
    length: 3.2,
    mobileLength: 2.2,
    accent: '#E3B7A0',
    feature: { destination: 'agra', attraction: 'taj-mahal' },
    destinations: ['agra', 'delhi', 'jaipur', 'hyderabad', 'mumbai'],
    align: 'end',
    beats: { feature: [0.3, 0.86] },
  },
  {
    id: 'forests',
    number: '08',
    length: 3,
    mobileLength: 2.1,
    accent: '#7FB069',
    hasStat: true,
    destinations: ['ranthambore', 'kaziranga', 'gir', 'munnar', 'coorg'],
    align: 'start',
  },
  {
    id: 'coast',
    number: '09',
    length: 3,
    mobileLength: 2.1,
    accent: '#4FB3A9',
    destinations: ['alappuzha', 'kochi', 'goa', 'andaman-islands', 'puducherry'],
    align: 'end',
  },
  {
    id: 'desert',
    number: '10',
    length: 3,
    mobileLength: 2.1,
    accent: '#E0A64A',
    destinations: ['jaisalmer', 'jodhpur', 'jaipur', 'rann-of-kutch', 'udaipur'],
    align: 'start',
  },
  {
    id: 'festivals',
    number: '11',
    length: 2.8,
    mobileLength: 2,
    accent: '#F2B544',
    destinations: ['kolkata', 'varanasi', 'mysuru', 'puri-konark', 'ziro'],
    align: 'center',
  },
  {
    id: 'food',
    number: '12',
    length: 3,
    mobileLength: 2.1,
    accent: '#E8893A',
    destinations: ['hyderabad', 'delhi', 'kolkata', 'mumbai', 'madurai'],
    align: 'end',
    beats: { cards: [0.72, 1.2] },
  },
  {
    id: 'city',
    number: '13',
    length: 3,
    mobileLength: 2.1,
    accent: '#8FA8FF',
    destinations: ['mumbai', 'delhi', 'hyderabad', 'kolkata'],
    align: 'start',
  },
  {
    id: 'hidden',
    number: '14',
    length: 3,
    mobileLength: 2.1,
    accent: '#5FB49C',
    destinations: ['meghalaya', 'spiti-valley', 'ziro', 'gandikota', 'lonar', 'majuli'],
    align: 'end',
  },
  {
    id: 'plan',
    number: '15',
    length: 2.2,
    mobileLength: 1.6,
    accent: '#E8A04B',
    destinations: [],
    align: 'center',
    beats: { title: [0.12, 1.2] },
  },
];

export const chapterIndexById = new Map(chapters.map((c, i) => [c.id, i]));
