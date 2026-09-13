import type { TravelGuide } from './types';

export const guides: TravelGuide[] = [
  {
    slug: 'when-to-visit-india',
    title: 'When to visit India',
    summary:
      "India's climate varies enormously. Here's how to match regions to seasons, from Himalayan summers to southern winters.",
    readingMinutes: 5,
    tags: ['nature', 'festivals'],
    destinations: ['leh-ladakh', 'goa', 'alappuzha', 'jaipur', 'meghalaya'],
    still: 'india-01',
    sections: [
      {
        heading: 'October to March: the classic season',
        body: "Cool, dry weather settles over most of the country. It is the best time for Rajasthan, Delhi and Agra, the beaches of Goa and the Andamans, Kerala's backwaters and the wildlife parks of central India. Book ahead for December and January.",
      },
      {
        heading: 'April to June: head for the hills',
        body: 'The plains grow very hot, so travellers move to the Himalaya. Hill stations such as Darjeeling and Manali are pleasant, and from June the high roads to Ladakh and Spiti begin to open.',
      },
      {
        heading: 'July to September: the monsoon',
        body: 'Rain turns the Western Ghats, Meghalaya and Kerala a vivid green, and the Valley of Flowers blooms. Ladakh and Spiti, in the Himalayan rain shadow, are at their best.',
      },
      {
        heading: 'Festivals to plan around',
        body: 'Holi arrives in March, Durga Puja and Dasara in September or October, and Diwali in October or November. Most dates follow lunar calendars, so check them each year.',
      },
    ],
  },
  {
    slug: 'first-trip-to-india',
    title: 'Planning your first trip to India',
    summary: 'How to shape a first journey: focused routes, getting around, permits and etiquette.',
    readingMinutes: 6,
    tags: ['heritage', 'culture'],
    destinations: ['delhi', 'agra', 'jaipur', 'varanasi', 'alappuzha'],
    still: 'taj-01',
    sections: [
      {
        heading: 'Start with a focused route',
        body: 'India rewards depth over speed. A first trip of two weeks might combine the Golden Triangle with Varanasi, or pair Mumbai with Goa and Kerala. Cover long distances by overnight train or domestic flight.',
      },
      {
        heading: 'Getting around',
        body: 'Indian Railways connects almost every city; book early through the official IRCTC website or app. Domestic flights are frequent, and app-based cabs operate in most cities.',
      },
      {
        heading: 'Visas and permits',
        body: 'Many nationalities can apply for an e-Visa online before travel. Some border regions, including parts of Ladakh, Sikkim and Arunachal Pradesh, need additional permits.',
      },
      {
        heading: 'Respect and etiquette',
        body: 'Dress modestly at religious sites, remove shoes where asked and always ask before photographing people. Eating with your right hand is customary in many places.',
      },
    ],
  },
  {
    slug: 'hidden-india',
    title: 'Hidden India: beyond the classic route',
    summary: 'Crater lakes, canyon forts, root bridges and river islands — places most itineraries miss.',
    readingMinutes: 5,
    tags: ['nature', 'culture'],
    destinations: ['spiti-valley', 'meghalaya', 'ziro', 'majuli', 'gandikota', 'lonar', 'warangal', 'valley-of-flowers'],
    still: 'meghalaya-01',
    sections: [
      {
        heading: 'Why go further',
        body: 'Some of the most memorable places in India see few visitors. They take more planning — permits, slower roads, simpler stays — but reward you with quiet landscapes and warm welcomes.',
      },
      {
        heading: "The Himalaya's quiet valleys",
        body: "Spiti's thousand-year-old monasteries and the monsoon meadows of the Valley of Flowers feel a world away from busier hill stations.",
      },
      {
        heading: 'The Northeast',
        body: "Meghalaya's living root bridges, the rice fields of Ziro and the monasteries of Majuli are among the country's most distinctive cultural landscapes.",
      },
      {
        heading: "The Deccan's secrets",
        body: "Gandikota's red-rock canyon, Lonar's meteorite crater and the Kakatiya temples around Warangal are easy detours from Bengaluru and Hyderabad.",
      },
    ],
  },
  {
    slug: 'india-by-train',
    title: 'Seeing India by train',
    summary: 'Classes, booking, heritage railways and the most scenic routes.',
    readingMinutes: 4,
    tags: ['culture', 'mountains'],
    destinations: ['darjeeling', 'jaisalmer', 'goa', 'kochi'],
    still: 'himalaya-05',
    sections: [
      {
        heading: 'Classes explained',
        body: "From air-conditioned sleepers to chair cars for day journeys, Indian trains suit every budget. Overnight trains save a night's accommodation.",
      },
      {
        heading: 'Heritage railways',
        body: 'Three mountain railways — Darjeeling, Nilgiri and Kalka–Shimla — are together a UNESCO World Heritage Site.',
      },
      {
        heading: 'Scenic routes',
        body: 'The Konkan Railway between Mumbai and Goa threads tunnels, rivers and waterfalls, and is at its most beautiful during the monsoon.',
      },
    ],
  },
  {
    slug: 'regional-food-of-india',
    title: 'A regional guide to Indian food',
    summary: 'Tandoors and dals in the north, coconut and rice in the south, mustard and sweets in the east.',
    readingMinutes: 5,
    tags: ['food', 'culture'],
    destinations: ['hyderabad', 'delhi', 'kolkata', 'mumbai', 'madurai'],
    still: 'food-01',
    sections: [
      {
        heading: 'North: tandoors and slow-cooked dals',
        body: "Wheat breads, clay-oven cooking and rich gravies define Punjab and Delhi, while Lucknow's kitchens are famous for delicate kebabs.",
      },
      {
        heading: 'South: rice, coconut and fermentation',
        body: 'Idli and dosa batters, tamarind-sour sambar and coconut curries are staples, with fiery Chettinad and Andhra cooking at the spicy end.',
      },
      {
        heading: 'East: fish, mustard and sweets',
        body: 'Bengali and Odia cooking prize river fish, mustard oil and panch phoron spice, and both states are famous for their chhena sweets.',
      },
      {
        heading: 'West: street food and thalis',
        body: "Mumbai's vada pav and pav bhaji, Gujarat's sweet-savoury thalis and Goa's Portuguese-influenced curries make the west a food lover's circuit.",
      },
    ],
  },
];

export function getGuide(slug: string) {
  return guides.find((g) => g.slug === slug);
}
