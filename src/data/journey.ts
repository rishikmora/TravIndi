import type { ChapterId } from '@/scenes/types';

export interface ChapterBeatWindows {
  title: [number, number];
  body: [number, number];
  stat: [number, number];
  feature: [number, number];
  cards: [number, number];
}

export interface ChapterCopy {
  id: ChapterId;
  number: string;
  name: string;
  subject: string;
  line: string;
  body: string;
  /** Scroll length in viewport heights (desktop). */
  length: number;
  /** Scroll length on small screens, where travel should feel shorter. */
  mobileLength: number;
  accent: string;
  location?: string;
  stat?: { value: string; label: string };
  feature?: { destination: string; attraction: string; line: string };
  destinations: string[];
  /** Plain-language description of the scene for screen readers and static mode. */
  description: string;
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
    name: 'The Beginning',
    subject: 'Discover India',
    line: 'One country. Thousands of journeys.',
    body: '',
    length: 2.4,
    mobileLength: 1.8,
    accent: '#E8A04B',
    location: '20.59° N, 78.96° E',
    destinations: [],
    description:
      'Dawn breaks over the Indian subcontinent, seen from high above. The Himalaya glows along the north, rivers catch the first light and clouds drift across the plains.',
    align: 'center',
    beats: { title: [0, 0.55] },
  },
  {
    id: 'mountains',
    number: '02',
    name: 'The Mountains',
    subject: 'Himalaya',
    line: 'Where the earth reaches for the sky.',
    body: "India's northern frontier holds some of the highest ground on earth — glaciers that feed great rivers, monasteries above the clouds and valleys reachable only in summer.",
    length: 3.2,
    mobileLength: 2.2,
    accent: '#8FB3D9',
    location: 'Himalaya · 27.70° N, 88.15° E',
    stat: { value: '8,000+ metres', label: 'Himalaya' },
    destinations: ['leh-ladakh', 'spiti-valley', 'manali', 'darjeeling', 'gangtok', 'valley-of-flowers'],
    description:
      'The camera flies between snow-covered Himalayan peaks at sunrise, past prayer flags and pine forests, then descends into a valley where a river begins.',
    align: 'start',
  },
  {
    id: 'rivers',
    number: '03',
    name: 'The Rivers',
    subject: 'Ganga',
    line: 'Every river here is a story still being told.',
    body: 'From its glacier source, the Ganga flows some 2,500 kilometres to the Bay of Bengal. At Varanasi, one of the oldest living cities on earth greets each dawn on its banks with prayer.',
    length: 3,
    mobileLength: 2.1,
    accent: '#E8A04B',
    location: 'Varanasi · 25.31° N, 83.01° E',
    stat: { value: '2,500 km', label: 'from glacier to sea' },
    destinations: ['varanasi', 'rishikesh', 'majuli', 'bodh-gaya'],
    description:
      'Marigold petals drift over the Ganga at dawn. Boats glide past the stepped ghats of Varanasi, where oil lamps float on the water and mist hangs over the river.',
    align: 'end',
  },
  {
    id: 'kingdoms',
    number: '04',
    name: 'The Kingdoms',
    subject: 'Ancient India',
    line: 'Cities of stone that once traded with the world.',
    body: 'Along the rivers rose some of the earliest cities on earth and, later, empires of astonishing wealth. At Hampi, capital of Vijayanagara, temples and bazaars still stand among giant granite boulders.',
    length: 2.8,
    mobileLength: 2,
    accent: '#D08A4E',
    location: 'Hampi · 15.33° N, 76.46° E',
    stat: { value: '1,600+', label: 'surviving monuments at Hampi' },
    destinations: ['hampi', 'ajanta-ellora', 'warangal', 'rann-of-kutch'],
    description:
      'Morning mist lifts over the ruins of Hampi: pillared halls, a carved stone chariot and hills of balanced boulders beside the Tungabhadra river, where round coracle boats drift.',
    align: 'start',
  },
  {
    id: 'temples',
    number: '05',
    name: 'The Temples',
    subject: 'Sacred Architecture',
    line: 'Mountains of stone, raised for the gods.',
    body: "South India's gateway towers — gopurams — are covered in thousands of sculpted figures. Inside, lamps, bells and incense turn vast stone halls into living places of worship.",
    length: 3.2,
    mobileLength: 2.2,
    accent: '#E07A3F',
    location: 'Madurai · 9.92° N, 78.12° E',
    feature: {
      destination: 'madurai',
      attraction: 'meenakshi-temple',
      line: 'Fourteen gopurams, thousands of painted figures',
    },
    destinations: ['madurai', 'thanjavur', 'khajuraho', 'puri-konark', 'amritsar', 'mahabalipuram'],
    description:
      'Through a temple gateway into a stone courtyard lit by oil lamps. Incense drifts past carved pillars, bells sway, and the camera rises along a towering gopuram into the sky.',
    align: 'end',
  },
  {
    id: 'empires',
    number: '06',
    name: 'The Empires',
    subject: 'Witness History',
    line: 'Kingdoms rose and fell on these plains.',
    body: 'For centuries, rival kings met on the plains of the subcontinent with cavalry, war elephants and banners. The forts and ballads they left behind still shape the landscapes of Rajasthan and the Deccan.',
    length: 3.4,
    mobileLength: 2.3,
    accent: '#C9573A',
    location: 'The Deccan plateau',
    destinations: ['jaipur', 'jodhpur', 'hyderabad', 'delhi', 'ranthambore'],
    description:
      'On a dusty plain at dawn, two historical armies face each other beneath banners. Kings on horseback lead cavalry and war elephants, seen in silhouette through smoke and drifting embers. The camera rises high above the field toward a distant fort.',
    align: 'start',
    beats: { cards: [0.7, 1.2] },
  },
  {
    id: 'monuments',
    number: '07',
    name: 'The Monuments',
    subject: 'Taj Mahal',
    line: 'A love story written in marble.',
    body: "Shah Jahan's mausoleum for Mumtaz Mahal took more than twenty years to complete. At sunrise its marble turns pink, then gold, mirrored in the long garden pools.",
    length: 3.2,
    mobileLength: 2.2,
    accent: '#E3B7A0',
    location: 'Agra · 27.17° N, 78.04° E',
    feature: { destination: 'agra', attraction: 'taj-mahal', line: 'Built in the 17th century' },
    destinations: ['agra', 'delhi', 'jaipur', 'hyderabad', 'mumbai'],
    description:
      'The Taj Mahal at sunrise, reflected in its long garden pool between rows of cypress trees. The camera glides toward the white marble dome until its reflection fills the frame.',
    align: 'end',
    beats: { feature: [0.3, 0.86] },
  },
  {
    id: 'forests',
    number: '08',
    name: 'The Forests',
    subject: 'Into the Wild',
    line: 'Walk softly. You are a guest here.',
    body: "India is home to about three-quarters of the world's wild tigers, along with Asian elephants, one-horned rhinos and the last wild Asiatic lions.",
    length: 3,
    mobileLength: 2.1,
    accent: '#7FB069',
    location: 'Western Ghats & Central India',
    stat: { value: '~75%', label: "of the world's wild tigers" },
    destinations: ['ranthambore', 'kaziranga', 'gir', 'munnar', 'coorg'],
    description:
      'Sunlight falls in shafts through dense forest. Elephants cross a clearing, a peacock displays, deer graze and a waterfall pours into a pool as butterflies drift.',
    align: 'start',
  },
  {
    id: 'coast',
    number: '09',
    name: 'The Coast',
    subject: 'Where Land Meets Water',
    line: 'Over 7,500 kilometres of shoreline, each with its own rhythm.',
    body: "From Kerala's backwaters, where houseboats drift through palm-lined canals, to Goa's beaches and the coral islands of the Andamans, India's coast is slow, green and luminous.",
    length: 3,
    mobileLength: 2.1,
    accent: '#4FB3A9',
    location: 'Kerala · 9.49° N, 76.33° E',
    destinations: ['alappuzha', 'kochi', 'goa', 'andaman-islands', 'puducherry'],
    description:
      "Monsoon rain falls over Kerala's backwaters. A thatched houseboat drifts between coconut palms, fishing nets rise against the sky and waves roll onto a golden beach.",
    align: 'end',
  },
  {
    id: 'desert',
    number: '10',
    name: 'The Desert',
    subject: 'The Thar',
    line: 'Gold by day, silver by moonlight.',
    body: 'In Rajasthan, the dunes of the Thar roll toward the horizon beneath forts of golden sandstone. Camel caravans still cross the sand, and evenings end with folk music around the fire.',
    length: 3,
    mobileLength: 2.1,
    accent: '#E0A64A',
    location: 'Jaisalmer · 26.91° N, 70.91° E',
    destinations: ['jaisalmer', 'jodhpur', 'jaipur', 'rann-of-kutch', 'udaipur'],
    description:
      'The waves of the ocean turn into rolling sand dunes at sunset. A camel caravan crosses the Thar beneath a golden fort as sand drifts in the wind and a campfire glows.',
    align: 'start',
  },
  {
    id: 'festivals',
    number: '11',
    name: 'The Festivals',
    subject: 'A Country That Celebrates',
    line: 'Every month, somewhere, the lamps are lit.',
    body: "Diwali's lamps, Holi's colours, Durga Puja's pandals and hundreds of regional festivals mean that on almost any day of the year, somewhere in India is celebrating.",
    length: 2.8,
    mobileLength: 2,
    accent: '#F2B544',
    location: 'Across India',
    destinations: ['kolkata', 'varanasi', 'mysuru', 'puri-konark', 'ziro'],
    description:
      'At night, thousands of oil lamps glow around a rangoli pattern. Sky lanterns rise, fireworks bloom overhead and clouds of coloured powder drift through the air.',
    align: 'center',
  },
  {
    id: 'food',
    number: '12',
    name: 'The Food',
    subject: 'A Thousand Kitchens',
    line: 'The flavours change every hundred kilometres.',
    body: "Every region cooks with its own grains, spices and rituals: Hyderabad's biryani, Rajasthan's thali, Bengal's sweets and the South's crisp dosas and soft idlis.",
    length: 3,
    mobileLength: 2.1,
    accent: '#E8893A',
    location: 'From every state',
    destinations: ['hyderabad', 'delhi', 'kolkata', 'mumbai', 'madurai'],
    description:
      'In warm studio light, a brass thali, a crisp dosa, idlis, biryani, jalebis and samosas turn slowly as steam rises.',
    align: 'end',
    beats: { cards: [0.72, 1.2] },
  },
  {
    id: 'city',
    number: '13',
    name: 'The Modern City',
    subject: 'India After Dark',
    line: 'Old cities, new skylines, the same restless energy.',
    body: "As night falls the cities light up: Mumbai's Marine Drive curves like a necklace of light, Delhi's avenues glow and Bengaluru's campuses hum late into the night.",
    length: 3,
    mobileLength: 2.1,
    accent: '#8FA8FF',
    location: 'Mumbai · 18.94° N, 72.82° E',
    destinations: ['mumbai', 'delhi', 'hyderabad', 'kolkata'],
    description:
      "India from above at night, its cities glowing like constellations. The camera dives toward Mumbai's skyline and the curve of lights along Marine Drive.",
    align: 'start',
  },
  {
    id: 'hidden',
    number: '14',
    name: 'Hidden India',
    subject: 'The Places In Between',
    line: 'Some wonders are still growing.',
    body: "Living root bridges in Meghalaya, a meteorite crater lake in Maharashtra, a red-rock canyon in Andhra Pradesh — India's most unforgettable places are often its least known.",
    length: 3,
    mobileLength: 2.1,
    accent: '#5FB49C',
    location: 'Meghalaya · 25.25° N, 91.68° E',
    destinations: ['meghalaya', 'spiti-valley', 'ziro', 'gandikota', 'lonar', 'majuli'],
    description:
      'Mist rolls through a rainforest valley in Meghalaya. A bridge of living tree roots spans a clear stream where a small boat floats above visible river stones.',
    align: 'end',
  },
  {
    id: 'plan',
    number: '15',
    name: 'Your Journey',
    subject: 'Your Journey Starts Here',
    line: 'Everything you have seen is a real place you can go.',
    body: '',
    length: 2.2,
    mobileLength: 1.6,
    accent: '#E8A04B',
    destinations: [],
    description: 'The camera rises above India at dusk as city lights appear across the subcontinent.',
    align: 'center',
    beats: { title: [0.12, 1.2] },
  },
];

export const chapterIndexById = new Map(chapters.map((c, i) => [c.id, i]));
