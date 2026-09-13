/**
 * Destination photography, step 1: collects candidate photographs from
 * Wikimedia Commons — Featured pictures and Quality images — with author and
 * licence data. One request at a time, honours Retry-After, resumable.
 *
 * Output: scripts/photos/candidates.json
 * Run:    node scripts/photos/collect.mjs
 *         node scripts/photos/collect-extra.mjs   broader search where step 1 found little
 *         node scripts/photos/select.mjs          picks photos → src/data/generated/destination-photos.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../src/data/destinations');
const OUT = path.join(HERE, 'candidates.json');
const UA = 'TravIndiPrototype/0.1 (one-off destination photo curation; low volume, serial requests)';
const FEATURED = 'Category:Featured pictures on Wikimedia Commons';
const QUALITY = 'Category:Quality images';

const unquote = (s) => s.replace(/^['"]|['"],?$/g, '').replace(/\\'/g, "'");

function parseDestinations() {
  const list = [];
  for (const file of ['north.ts', 'west.ts', 'south.ts', 'east.ts']) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
    let current = null;
    let attraction = null;
    for (const line of lines) {
      let m;
      if ((m = /^ {4}slug: (.+)$/.exec(line))) {
        current = { slug: unquote(m[1].trim()), name: '', attractions: [] };
        list.push(current);
      } else if (current && (m = /^ {4}name: (.+)$/.exec(line))) {
        current.name = unquote(m[1].trim());
      } else if (current && (m = /^ {8}slug: (.+)$/.exec(line))) {
        attraction = { slug: unquote(m[1].trim()), name: '' };
        current.attractions.push(attraction);
      } else if (attraction && (m = /^ {8}name: (.+)$/.exec(line))) {
        attraction.name = unquote(m[1].trim());
      }
    }
  }
  return list;
}

const ALIASES = {
  delhi: ['New Delhi', 'Delhi'],
  agra: ['Taj Mahal', 'Agra'],
  varanasi: ['Varanasi'],
  'leh-ladakh': ['Ladakh', 'Leh'],
  'spiti-valley': ['Spiti'],
  amritsar: ['Golden Temple', 'Amritsar'],
  'valley-of-flowers': ['Valley of Flowers'],
  'rann-of-kutch': ['Rann of Kutch', 'Kutch'],
  'ajanta-ellora': ['Ajanta Caves', 'Ellora Caves'],
  lonar: ['Lonar'],
  gir: ['Gir National Park', 'Gir Forest'],
  darjeeling: ['Darjeeling', 'Kangchenjunga'],
  gangtok: ['Gangtok', 'Sikkim'],
  meghalaya: ['Meghalaya'],
  ziro: ['Ziro'],
  'puri-konark': ['Konark', 'Puri'],
  'bodh-gaya': ['Mahabodhi Temple', 'Bodh Gaya'],
  alappuzha: ['Alappuzha', 'Kerala backwaters', 'Alleppey'],
  coorg: ['Kodagu', 'Coorg'],
  mysuru: ['Mysore Palace', 'Mysore'],
  mahabalipuram: ['Mahabalipuram', 'Mamallapuram'],
  puducherry: ['Pondicherry', 'Puducherry'],
  'andaman-islands': ['Andaman', 'Havelock Island'],
};

const LICENCE_OK = /^(cc0|public domain|pd\b|cc by(-sa)? \d(\.\d)?)/i;
const REJECT_TITLE = /\b(map|diagram|logo|flag|coat of arms|emblem|seal|stamp|coin|banknote|chart|plan|elevation|drawing|painting|engraving|lithograph|etching|manuscript|miniature|illustration|sketch|watercolou?r|poster|portrait|selfie|x-ray|specimen)\b/i;
const OLD_YEAR = /\b1[6-8]\d\d\b|\b19[0-4]\d\b/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripHtml = (html) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

let lastRequest = 0;
async function api(params) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({ action: 'query', format: 'json', formatversion: '2', maxlag: '5', ...params })) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 7; attempt++) {
    const wait = lastRequest + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    } catch {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (res.ok) {
      const json = await res.json();
      if (json.error?.code === 'maxlag') {
        await sleep(6000);
        continue;
      }
      return json;
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const backoff = Math.min(120_000, Math.max(Number.isFinite(retryAfter) ? retryAfter * 1000 : 0, 8000 * 2 ** attempt));
    console.log(`  HTTP ${res.status}; waiting ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
  }
  throw new Error('Commons API kept refusing requests');
}

async function search(term) {
  const json = await api({
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '14',
    gsrsearch: `"${term}" incategory:Featured_pictures_on_Wikimedia_Commons|Quality_images filetype:bitmap`,
    prop: 'imageinfo|categories',
    clcategories: `${FEATURED}|${QUALITY}`,
    cllimit: 'max',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1920',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal',
  });
  return (json.query?.pages ?? []).map((page) => ({ page, info: page.imageinfo?.[0] })).filter((p) => p.info);
}

const clean = (url) => url?.split('?')[0] ?? null;

function toCandidate({ page, info }, meta) {
  const ext = info.extmetadata ?? {};
  const licence = stripHtml(ext.LicenseShortName?.value);
  const title = page.title.replace(/^File:/, '');
  const year = stripHtml(ext.DateTimeOriginal?.value);
  const categories = (page.categories ?? []).map((c) => c.title);
  if (!/^image\/(jpeg|png|webp|tiff)$/.test(info.mime)) return null;
  if (info.width < 1600 || info.height < 900) return null;
  if (!LICENCE_OK.test(licence)) return null;
  if (REJECT_TITLE.test(title) || OLD_YEAR.test(year)) return null;
  return {
    title,
    tier: categories.includes(FEATURED) ? 'featured' : 'quality',
    page_url: clean(info.descriptionurl),
    original: clean(info.url),
    thumb_1920: clean(info.thumburl) ?? clean(info.url),
    width: info.width,
    height: info.height,
    author: stripHtml(ext.Artist?.value).slice(0, 90) || 'Unknown author',
    licence,
    licence_url: clean(ext.LicenseUrl?.value) ?? null,
    description: stripHtml(ext.ImageDescription?.value).slice(0, 220),
    ...meta,
  };
}

async function main() {
  const destinations = parseDestinations();
  const result = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const seen = new Set(Object.values(result).flatMap((d) => d.candidates.map((c) => c.title)));
  for (const destination of destinations) {
    if (result[destination.slug]?.complete) continue;
    const terms = [
      ...(ALIASES[destination.slug] ?? [destination.name]).map((term) => ({ term, attraction: null })),
      ...destination.attractions.slice(0, 5).map((a) => ({ term: a.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), attraction: a.slug })),
    ];
    const candidates = [];
    for (const { term, attraction } of terms) {
      for (const hit of await search(term)) {
        const candidate = toCandidate(hit, { term, attraction });
        if (!candidate || seen.has(candidate.title)) continue;
        seen.add(candidate.title);
        candidates.push(candidate);
      }
    }
    result[destination.slug] = { name: destination.name, attractions: destination.attractions, candidates, complete: true };
    fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
    console.log(`${destination.slug}: ${candidates.length} (${candidates.filter((c) => c.tier === 'featured').length} featured)`);
  }
  console.log('done');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
