// Downloads the museum's exhibit images from Wikimedia Commons, re-checking every licence from the file's own
// metadata (only Public domain / CC0 / CC BY - never SA / NC / ND), and records the evidence.
//   node scripts/fetch-museum-images.mjs
// Out: app/public/assets/museum/images/<id>.jpg (Wikimedia's 1920 px standard thumbnail), app/public/data/museum-images.json (credits,
//      sizes; read by the app and by blender/scripts/build_museum.py), assets/museum/licences/<id>.json (raw evidence).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

const IMAGES = {
  // vestibule
  'v-armstrong': 'File:Louis Armstrong, Aquarium, New York, N.Y., ca. July 1946 (William P. Gottlieb 00161).jpg',
  'v-holiday': 'File:Billie Holiday, Downbeat, New York, N.Y., ca. Feb. 1947 (William P. Gottlieb 04251).jpg',
  'v-ellington': "File:(Portrait of Duke Ellington, Aquarium, New York, N.Y., between 1946 and 1948) (LOC) (4932369098).jpg",
  'v-gillespie': 'File:(Portrait of Dizzy Gillespie, John Lewis, Cecil Payne, Miles Davis, and Ray Brown, Downbeat, New York, N.Y., between 1946 and 1948) (LOC) (5306379575).jpg',
  // World Jazz History
  'w-odjb': 'File:Original Dixieland Jass Band - A Brass Band Gone Crazy 1917.jpg',
  'w-hotfive': 'File:West End Blues Louis Armstrong Okeh Ad 1928.jpg',
  'w-django': 'File:Django Reinhardt (Gottlieb 07301).jpg',
  'w-carnegie': 'File:Leonard Bernstein, Benny Goodman, and Max Hollander, Carnegie Hall, New York, between 1946 and 1948 (William P. Gottlieb 00731).jpg',
  'w-mintons': "File:Thelonious Monk, Howard McGhee, Roy Eldridge, and Teddy Hill, Minton's Playhouse, New York, N.Y., ca. Sept. 1947 (William P. Gottlieb 06281).jpg",
  'w-kob': 'File:Charlie Parker, Tommy Potter, Miles Davis, Duke Jordan, Max Roach (Gottlieb 06851).jpg',
  'w-getz': 'File:João Gilberto e Stan Getz em Nova York 1972 cr.jpg',
  // Toronto Jazz Legacy
  't-massey': 'File:Interior of Massey Hall, r-4116.jpg',
  't-yonge': 'File:Yonge Street looking north from Temperance.jpg',
  't-peterson-1944': 'File:Oscar Peterson with his sister, Daisy, at the piano - 1944.jpg',
  't-ella-oscar': 'File:Oscar Peterson en Ella Fitzgerald (1964).jpg',
  // Toronto Jazz Legacy: the photograph row on the outer wall (was the portrait placeholders)
  't-row-massey': 'File:Massey Hall, to see Chilly Gonzales (24869995946).jpg',
  't-row-yonge': 'File:Yonge Street looking south (1).jpg',
  't-row-mcconnell': 'File:Fraser MacPherson, Rob McConnell 1989.jpg',
  't-row-festival': 'File:Salif Keita at Toronto Jazz Festival 2008.jpg',
}
// node scripts/fetch-museum-images.mjs [id ...]: only these ids (the rest of the manifest is kept)
const ONLY = process.argv.slice(2)

const API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'JazzTor-museum/0.1 (local build of a personal project)'
const OUT = 'D:/Jazztor/app/public/assets/museum/images'
const EVIDENCE = 'D:/Jazztor/assets/museum/licences'
const MANIFEST = 'D:/Jazztor/app/public/data/museum-images.json'
mkdirSync(OUT, { recursive: true })
mkdirSync(EVIDENCE, { recursive: true })
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const acceptable = (lic) => {
  const l = lic.toLowerCase()
  if (/\b(sa|nc|nd)\b|share ?alike|noncommercial|no ?deriv/.test(l)) return false
  return /^public domain|^pd\b|^cc0|^cc by \d|^cc-by-\d/.test(l)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, json = true) {
  for (let a = 0; a < 5; a++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (r.ok) return json ? r.json() : Buffer.from(await r.arrayBuffer())
    await sleep(5000 * (a + 1))
  }
  throw new Error('fetch failed: ' + url)
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
for (const [id, title] of Object.entries(IMAGES).filter(([id]) => !ONLY.length || ONLY.includes(id))) {
  const u = new URL(API)
  Object.entries({ action: 'query', format: 'json', titles: title, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1920' })
    .forEach(([k, v]) => u.searchParams.set(k, v))
  let r = await get(u)
  let ii = Object.values(r.query.pages)[0].imageinfo?.[0]
  // standard thumbnail step strictly below the original width (originals and odd sizes are rate-limited for bulk use)
  const step = ii && [1920, 1280, 960, 500].find((w) => w < ii.width)
  if (step && step !== 1920) {
    u.searchParams.set('iiurlwidth', String(step))
    r = await get(u)
    ii = Object.values(r.query.pages)[0].imageinfo?.[0]
  }
  if (!ii) { console.log('MISSING', id, title); continue }
  const md = ii.extmetadata ?? {}
  const lic = md.LicenseShortName?.value ?? ''
  if (!acceptable(lic)) { console.log('REJECTED licence', id, lic); continue }
  // the 2048 thumb when the original is larger, else the original (both JPEG for these files)
  // Wikimedia asks bulk clients for its standard thumbnail steps (https://w.wiki/GHai) rather than originals
  const src = ii.thumburl.split('?')[0]
  const file = `${OUT}/${id}.jpg`
  if (!existsSync(file)) {
    writeFileSync(file, await get(src, false))
    await sleep(4000) // upload.wikimedia.org rate-limits bursts
  }
  const k = ii.thumbwidth ? ii.thumbwidth / ii.width : 1
  const kept = manifest[id] // a file already on disk keeps its recorded size (it may be the full original)
  manifest[id] = {
    file: `/assets/museum/images/${id}.jpg`, width: kept?.width ?? Math.round(ii.width * k), height: kept?.height ?? Math.round(ii.height * k),
    title: title.replace(/^File:/, ''), page: ii.descriptionurl, licence: lic, licenceUrl: md.LicenseUrl?.value ?? null,
    author: strip(md.Artist?.value).replace(/^(Unknown(?: author)?)+$/i, 'Unknown author'), // Commons repeats the template text
    credit: strip(md.Credit?.value), date: strip(md.DateTimeOriginal?.value),
  }
  writeFileSync(`${EVIDENCE}/${id}.json`, JSON.stringify({ checked: new Date().toISOString(), title, url: ii.descriptionurl, extmetadata: md }, null, 1))
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1))
  console.log('OK', id.padEnd(16), lic.padEnd(16), `${manifest[id].width}x${manifest[id].height}`, manifest[id].author.slice(0, 40))
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1))
