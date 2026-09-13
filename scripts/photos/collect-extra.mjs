/**
 * Destination photography, step 2: a broader Commons search for destinations
 * where Featured and Quality pictures were scarce — any large, freely licensed
 * bitmap. Results are filtered and reviewed in step 3 (select.mjs).
 *
 * Run: node scripts/photos/collect-extra.mjs (after collect.mjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'candidates.json');
const UA = 'TravIndiPrototype/0.1 (one-off destination photo curation; low volume, serial requests)';

const QUERIES = {
  lonar: ['Lonar crater lake', 'Lonar lake', 'Daitya Sudan temple Lonar'],
  gandikota: ['Gandikota fort', 'Gandikota canyon', 'Gandikota Pennar'],
  majuli: ['Majuli island', 'Majuli satra', 'Majuli Brahmaputra'],
  gir: ['Gir National Park lion', 'Gir forest'],
  madurai: ['Meenakshi Amman Temple', 'Thirumalai Nayakkar Mahal'],
  'rann-of-kutch': ['Great Rann of Kutch', 'White Rann Dhordo'],
  rishikesh: ['Lakshman Jhula', 'Ram Jhula Rishikesh', 'Triveni Ghat Rishikesh', 'Rishikesh Ganga'],
  manali: ['Hadimba Temple', 'Solang Valley', 'Manali Himachal Pradesh', 'Rohtang Pass'],
  coorg: ['Abbey Falls Madikeri', 'Coorg Karnataka hills', 'Talakaveri', 'Dubare Coorg'],
  warangal: ['Thousand Pillar Temple', 'Warangal Fort', 'Ramappa Temple', 'Bhadrakali Temple Warangal'],
  kaziranga: ['Kaziranga National Park', 'Kaziranga rhinoceros', 'Kaziranga elephant'],
  ziro: ['Ziro valley', 'Ziro Arunachal Pradesh', 'Ziro paddy field'],
  varanasi: ['Dashashwamedh Ghat', 'Varanasi ghats Ganges', 'Manikarnika Ghat', 'Ganga Aarti Varanasi'],
  alappuzha: ['Alappuzha houseboat', 'Kerala backwaters houseboat', 'Alleppey beach', 'Kuttanad backwaters'],
};

const LICENCE_OK = /^(cc0|public domain|pd\b|cc by(-sa)? \d(\.\d)?)/i;
const REJECT_TITLE = /\b(map|diagram|logo|flag|emblem|seal|stamp|coin|chart|plan|drawing|painting|engraving|lithograph|illustration|sketch|poster|portrait|selfie)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (url) => url?.split('?')[0] ?? null;
const stripHtml = (html) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

let last = 0;
async function api(params) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({ action: 'query', format: 'json', formatversion: '2', maxlag: '5', ...params })) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 7; attempt++) {
    const wait = last + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } }).catch(() => null);
    if (res?.ok) return res.json();
    const retry = Number(res?.headers.get('retry-after'));
    const backoff = Math.min(120_000, Math.max(Number.isFinite(retry) ? retry * 1000 : 0, 8000 * 2 ** attempt));
    console.log(`  HTTP ${res?.status ?? 'error'}; waiting ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
  }
  throw new Error('Commons API kept refusing requests');
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const seen = new Set(Object.values(data).flatMap((d) => d.candidates.map((c) => c.title)));

for (const [slug, terms] of Object.entries(QUERIES)) {
  const entry = data[slug];
  if (!entry || entry.extra) continue;
  for (const term of terms) {
    const json = await api({
      generator: 'search',
      gsrnamespace: '6',
      gsrlimit: '20',
      gsrsearch: `${term} filetype:bitmap filew:>1999`,
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1920',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription',
    });
    for (const page of json.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const ext = info.extmetadata ?? {};
      const title = page.title.replace(/^File:/, '');
      const licence = stripHtml(ext.LicenseShortName?.value);
      if (seen.has(title) || !/^image\/(jpeg|png)$/.test(info.mime) || info.width < 1800 || info.height < 1000) continue;
      if (!LICENCE_OK.test(licence) || REJECT_TITLE.test(title)) continue;
      seen.add(title);
      entry.candidates.push({
        title,
        tier: 'other',
        page_url: clean(info.descriptionurl),
        original: clean(info.url),
        thumb_1920: clean(info.thumburl) ?? clean(info.url),
        width: info.width,
        height: info.height,
        author: stripHtml(ext.Artist?.value).slice(0, 90) || 'Unknown author',
        licence,
        licence_url: clean(ext.LicenseUrl?.value) ?? null,
        description: stripHtml(ext.ImageDescription?.value).slice(0, 220),
        term,
        attraction: null,
      });
    }
  }
  entry.extra = true;
  fs.writeFileSync(FILE, JSON.stringify(data, null, 1));
  console.log(`${slug}: ${entry.candidates.length}`);
}
console.log('done');
