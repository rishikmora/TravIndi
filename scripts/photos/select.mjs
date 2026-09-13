/**
 * Destination photography, step 3: picks a hero, a gallery and attraction
 * photos per destination from candidates.json. Filters off-topic subjects and
 * same-named places elsewhere; overrides.json pins heroes and excludes files
 * found wanting on review. Writes the app's photo manifest, plus sheet.html
 * and sheet-index.json for reviewing the picks by eye.
 *
 * Output: src/data/generated/destination-photos.json
 * Run:    node scripts/photos/select.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.resolve(HERE, '../../src/data/generated/destination-photos.json');
const GALLERY_SIZE = 5;

const candidates = JSON.parse(fs.readFileSync(path.join(HERE, 'candidates.json'), 'utf8'));
const overridesPath = path.join(HERE, 'overrides.json');
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};

const SAFE_SOURCE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/;
const SAFE_LICENCE = /^https:\/\/(creativecommons\.org|en\.wikipedia\.org\/wiki\/Public_domain)\//;

/** Subjects that never make a destination photograph. */
const OFF_TOPIC = /\b(embroider\w*|cloth|textile|fabric|saree|insect|butterfly|moth|beetle|spider|dragonfly|crab|fungus|moss|seeds|buds|firework|galaxy|nebula|ngc\d+|toilet|railway station|shatabdi|rajdhani|locomotive|wag\d+|wap\d+|wdm\d+|metro|bus|airport|aircraft|airplane|truck|tractor|coin|plaque|inscription|signboard|sign|poster|dish|thali|restaurant|cafe|hotel|shop|store|plaza|jewellery|office|vendor|musician|maker|selfie|portrait|lady|women|monks?|mannequin|specimen|basking|puddling|sucking|(?:open|close) wing|rose|erotic|zoophilia)\b/i;
/** Same-named places elsewhere in the world. */
const ELSEWHERE = /\b(nepal|chitwan|china|suzhou|london|londres|england|inglaterra|france|brest|villard|russia|rostov|usa|new orleans|san francisco|california|bangladesh|sylhet|sri lanka|pakistan|germany|fulda|italy|spain|terraza|japan|thailand|myanmar|bhutan|ashtamudi|kollam|nagarhole|sissu|lahaul|dzukou)\b/i;
/** Fine for a named landmark, off-topic for a general shot of the place. */
const CLOSE_OR_PEOPLE = /\b(detail|details|close-?up|macro|museum|food|man|woman|boy|girl|child|station|express|train)\b/i;
const SCENIC = /\b(view|vista|skyline|sunset|sunrise|dusk|dawn|night|panorama|landscape|lake|river|ganga|ganges|ghat|ghats|temple|fort|palace|beach|coast|sea|mountain|peak|valley|hills?|waterfall|falls|forest|tea|garden|gate|minar|tomb|mosque|masjid|monument|stupa|monastery|gompa|church|backwaters?|houseboat|desert|dunes|crater|canyon|gorge|island|bridge|haveli|ruins|caves?|mahal|gurdwara|aerial)\b/i;

function sized(candidate, width) {
  if (candidate.width <= width) return candidate.original;
  const thumb = candidate.thumb_1920.includes('/thumb/')
    ? candidate.thumb_1920
    : `${candidate.original.replace('/wikipedia/commons/', '/wikipedia/commons/thumb/')}/1920px-${candidate.original.split('/').pop()}`;
  return thumb.replace(/\/1920px-/, `/${width}px-`);
}

function altFor(candidate) {
  const description = candidate.description
    .replace(/^(english|en)\s*:\s*/i, '')
    .split(/(?<=[.!?])\s|\s(?:Deutsch|Français|Español|Italiano|हिन्दी)\s*:/)[0]
    ?.trim();
  const fromTitle = candidate.title
    .replace(/\.(jpe?g|png|tiff?|webp)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s*\((cropped|edited|retouched)\)/gi, '')
    .replace(/\s+edit\d*$/i, '')
    .replace(/\s*[-–,]?\s*(DSC|IMG|P)\S*\d+\S*/gi, '')
    .replace(/\s*[-–]?\s*\d{2,}$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const useDescription = description && description.length >= 15 && description.length <= 140 && !/[{}<>|]|^\W/.test(description);
  return (useDescription ? description : fromTitle).replace(/\.$/, '');
}

function toPhoto(candidate) {
  return {
    src: sized(candidate, 1920),
    src_small: sized(candidate, 960),
    src_thumb: sized(candidate, 330),
    width: Math.min(1920, candidate.width),
    height: Math.round(candidate.height * (Math.min(1920, candidate.width) / candidate.width)),
    alt: altFor(candidate),
    author: candidate.author,
    licence: candidate.licence,
    licence_url: candidate.licence_url && SAFE_LICENCE.test(candidate.licence_url) ? candidate.licence_url : null,
    source_url: candidate.page_url,
    title: candidate.title,
  };
}

const aspect = (c) => c.width / c.height;
const text = (c) => `${c.title} ${c.description}`;

function allowed(candidate, locality) {
  const term = candidate.term.toLowerCase();
  const offending = (pattern) => {
    const match = text(candidate).match(pattern);
    return Boolean(match && !term.includes(match[0].toLowerCase()));
  };
  if (offending(OFF_TOPIC) || ELSEWHERE.test(text(candidate))) return false;
  if (!candidate.attraction) return !offending(CLOSE_OR_PEOPLE);
  // A landmark's name can belong to places elsewhere; require a mention of where it is.
  return locality.test(text(candidate));
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words that place a photo at this destination: its name, search aliases, or India. */
function localityFor(entry) {
  const words = new Set(['india']);
  const generic = /^(valley|islands?|national|park|crater|lake|gaya|and)$/i;
  for (const phrase of [entry.name, ...entry.candidates.filter((c) => !c.attraction).map((c) => c.term)]) {
    for (const word of phrase.split(/[^\p{L}]+/u)) if (word.length >= 4 && !generic.test(word)) words.add(word.toLowerCase());
  }
  return new RegExp(`\\b(${[...words].map(escape).join('|')})`, 'i');
}

function score(candidate) {
  let value = candidate.tier === 'featured' ? 6 : candidate.tier === 'quality' ? 3 : 0;
  const ratio = aspect(candidate);
  if (ratio >= 1.3 && ratio <= 2.3) value += 3;
  else if (ratio < 1) value -= 3;
  if (SCENIC.test(text(candidate))) value += 2;
  if (candidate.attraction) value += 1;
  if (candidate.width >= 3000) value += 1;
  return value;
}

const manifest = {};
const sheet = [];
const index = {};

for (const [slug, entry] of Object.entries(candidates)) {
  const rule = overrides[slug] ?? {};
  const excluded = new Set(rule.exclude ?? []);
  const locality = localityFor(entry);
  const pool = entry.candidates
    .filter((c) => !excluded.has(c.title) && SAFE_SOURCE.test(c.page_url ?? '') && allowed(c, locality))
    .map((c) => ({ ...c, score: score(c) }))
    .sort((a, b) => b.score - a.score);
  if (pool.length === 0) {
    sheet.push(`<section><h2>${slug}</h2><p>no photos</p></section>`);
    continue;
  }

  const byTitle = (title) => entry.candidates.find((c) => c.title === title);
  const hero =
    (rule.hero && byTitle(rule.hero)) ||
    pool.find((c) => aspect(c) >= 1.35 && SCENIC.test(text(c))) ||
    pool.find((c) => aspect(c) >= 1.3) ||
    pool[0];

  const attractions = {};
  for (const attraction of entry.attractions) {
    const pick =
      (rule.attractions?.[attraction.slug] && byTitle(rule.attractions[attraction.slug])) ||
      pool.find((c) => c.attraction === attraction.slug && aspect(c) >= 1.1 && c.title !== hero.title);
    if (pick) attractions[attraction.slug] = pick;
  }

  const gallery = [];
  const perTerm = new Map();
  let portraits = 0;
  const chosen = rule.gallery?.map(byTitle).filter(Boolean) ?? [];
  const picked = new Set(Object.values(attractions).map((c) => c.title));
  // Avoid repeating photos already on attraction cards, unless the gallery runs short.
  const order = [...chosen, ...pool.filter((c) => !picked.has(c.title)), ...pool.filter((c) => picked.has(c.title))];
  for (const candidate of order) {
    if (gallery.length >= GALLERY_SIZE) break;
    if (candidate.title === hero.title || gallery.some((c) => c.title === candidate.title)) continue;
    const isChosen = chosen.includes(candidate);
    const used = perTerm.get(candidate.term) ?? 0;
    if (!isChosen && (used >= 2 || (aspect(candidate) < 1.15 && portraits >= 1))) continue;
    if (aspect(candidate) < 1.15) portraits += 1;
    perTerm.set(candidate.term, used + 1);
    gallery.push(candidate);
  }

  manifest[slug] = {
    hero: toPhoto(hero),
    gallery: gallery.map(toPhoto),
    attractions: Object.fromEntries(Object.entries(attractions).map(([key, c]) => [key, toPhoto(c)])),
  };

  const tile = (c, label, width) => {
    index[`${slug}:${label}`] = c.title;
    return `<figure style="width:${width}px"><img loading="lazy" src="${sized(c, 330)}"><figcaption>${label}${c.tier === 'featured' ? '★' : c.tier === 'other' ? '·' : ''}</figcaption></figure>`;
  };
  sheet.push(
    `<section><h2>${slug}</h2>${tile(hero, 'H', 220)}${gallery.map((c, i) => tile(c, `G${i + 1}`, 150)).join('')}<i></i>${Object.values(attractions)
      .map((c, i) => tile(c, `A${i + 1}`, 110))
      .join('')}</section>`,
  );
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
fs.writeFileSync(path.join(HERE, 'sheet-index.json'), JSON.stringify(index, null, 1));
fs.writeFileSync(
  path.join(HERE, 'sheet.html'),
  `<!doctype html><meta charset="utf-8"><style>body{font:11px system-ui;margin:8px;background:#111;color:#ddd}section{display:flex;gap:6px;align-items:flex-start;margin:0 0 8px}h2{width:96px;flex:none;font-size:12px;margin:0}figure{margin:0;flex:none}img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block;background:#333}figcaption{opacity:.8}i{width:10px;flex:none}</style>${sheet.join('')}`,
);
console.log(`destinations with photos: ${Object.keys(manifest).length}`);
