// Builds the playable catalogue from the licence register + audio QC.
// Only tracks with an accepted licence (CC0 / CC BY) AND qualityPass are used. Tracks are grouped into records
// by album (one record = one LP side, played in order). Writes:
//   app/public/assets/audio/<fmaId>.mp3            (byte-identical copies - no re-encode)
//   app/public/assets/albums/<recordId>-1024.jpg   (centre-cropped, 1024 px)
//   app/src/data/catalog.json                      (records, tracks, gains, colours, attribution)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const AUDIO = 'D:/Jazztor/audio'
const PUB = 'D:/Jazztor/app/public/assets'
mkdirSync(`${PUB}/audio`, { recursive: true })
mkdirSync(`${PUB}/albums`, { recursive: true })
const reg = JSON.parse(readFileSync(`${AUDIO}/licenses/fma-tracks.json`, 'utf8'))
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const SMALL = new Set(['and', 'to', 'for', 'of', 'the', 'a', 'in', 'on'])
// ALL-CAPS release names read as shouting on an engraved plaque; acronyms (CC, BY) stay upper-case
const titleCase = (s) => s === s.toUpperCase() ? s.toLowerCase().split(' ').map((w, i) => (/^(cc|by|nc|sa)\b/.test(w) ? w.toUpperCase() : i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ') : s
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

function readImage(path) {
  const b = readFileSync(path)
  return b[0] === 0x89 ? PNG.sync.read(b) : jpeg.decode(b, { useTArray: true, maxMemoryUsageInMB: 1024 })
}

/** centre-crop to a square, area-average resample to n x n */
function squareResize(img, n) {
  const s = Math.min(img.width, img.height)
  const x0 = (img.width - s) / 2
  const y0 = (img.height - s) / 2
  const out = Buffer.alloc(n * n * 4)
  const step = s / n
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sx0 = Math.floor(x0 + x * step), sy0 = Math.floor(y0 + y * step)
    const sx1 = Math.max(sx0 + 1, Math.floor(x0 + (x + 1) * step)), sy1 = Math.max(sy0 + 1, Math.floor(y0 + (y + 1) * step))
    let r = 0, g = 0, b = 0, k = 0
    for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) {
      const i = (yy * img.width + xx) * 4
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; k++
    }
    const o = (y * n + x) * 4
    out[o] = r / k; out[o + 1] = g / k; out[o + 2] = b / k; out[o + 3] = 255
  }
  return { width: n, height: n, data: out }
}

/** dominant = mean colour; accent = the most saturated well-populated hue bin (for the player insert / caption) */
function palette(img) {
  let r = 0, g = 0, b = 0
  const bins = new Map()
  const n = img.width * img.height
  for (let i = 0; i < img.data.length; i += 4) {
    const c = [img.data[i], img.data[i + 1], img.data[i + 2]]
    r += c[0]; g += c[1]; b += c[2]
    const mx = Math.max(...c), mn = Math.min(...c)
    const sat = mx ? (mx - mn) / mx : 0
    if (sat < 0.25 || mx < 60) continue
    const key = c.map((v) => v >> 5).join(',')
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0 }
    e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2]; e.sat += sat
    bins.set(key, e)
  }
  const dominant = [r / n, g / n, b / n]
  const best = [...bins.values()].filter((e) => e.n > n * 0.01).sort((a, b) => b.sat * Math.sqrt(b.n) - a.sat * Math.sqrt(a.n))[0]
  const raw = best ? [best.r / best.n, best.g / best.n, best.b / best.n] : [196, 103, 63]
  return { dominant: hex(dominant), accent: hex(tame(raw)) }
}

/** keep accents inside the JazzTor language: no neon - saturation <= 0.55, value 0.45-0.78 */
function tame([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const v = Math.min(0.78, Math.max(0.45, mx / 255))
  const sat = Math.min(0.55, mx ? (mx - mn) / mx : 0)
  return [r, g, b].map((c) => {
    const t = mx === mn ? 1 : (c - mn) / (mx - mn)        // 0 at the minimum channel, 1 at the maximum
    return 255 * v * (1 - sat * (1 - t))
  })
}

// (the same recording can be listed under two FMA pages: identical audio bytes are one track)
const seenAudio = new Set()
const usable = reg.filter((t) => ['CC0 1.0', 'CC BY 4.0', 'CC BY 3.0'].includes(t.licence) && t.qc?.qualityPass)
  .filter((t) => !t.audioSha1 || (!seenAudio.has(t.audioSha1) && seenAudio.add(t.audioSha1)))
// singles (no album on FMA) are gathered into one "Singles" record per artist; a release without artwork gets a plain
// typographic JazzTor sleeve (scripts/make-type-cover.mjs) - marked as such, never passed off as release artwork
const albumOf = (t) => (!t.album || t.album === '-' ? 'Singles' : t.album)
const typeCover = (t) => `generated/${slug(t.artist)}-${slug(albumOf(t))}.png`
const groups = new Map()
for (const t of usable) {
  const key = `${t.artist}::${albumOf(t)}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(t)
}

const records = []
for (const [, tracks] of groups) {
  const first = tracks[0]
  const id = `${slug(first.artist)}--${slug(albumOf(first))}`
  const art = tracks.find((t) => t.coverFile && existsSync(`${AUDIO}/${t.coverFile}`))?.coverFile
  const coverPath = art ? `${AUDIO}/${art}` : `${AUDIO}/source/${typeCover(first)}`
  if (!existsSync(coverPath)) throw new Error(`no artwork for ${id}: run scripts/make-type-cover.mjs "${first.artist}" "${albumOf(first)}" ${coverPath}`)
  const cover = squareResize(readImage(coverPath), 1024)
  writeFileSync(`${PUB}/albums/${id}-1024.jpg`, jpeg.encode(cover, 90).data)
  const colours = palette(squareResize(cover, 64))
  let t0 = 0
  const list = tracks.map((t) => {
    const file = `/assets/audio/${t.fmaId}.mp3`
    if (!existsSync(`${PUB}/audio/${t.fmaId}.mp3`)) copyFileSync(`${AUDIO}/${t.audioFile}`, `${PUB}/audio/${t.fmaId}.mp3`)
    const item = { id: String(t.fmaId), title: t.title.replace(/\s*\(free track\)\s*$/i, ''), src: file, sourceUrl: t.trackUrl,
      duration: t.qc.durationSec, start: t0, gainDb: t.qc.gainDb }
    t0 += t.qc.durationSec + 2 // 2 s silent band between tracks, as on a pressed record
    return item
  })
  records.push({
    id, title: titleCase(albumOf(first)), artist: first.artist,
    cover: `/assets/albums/${id}-1024.jpg`, ...(art ? {} : { coverCredit: 'Typographic sleeve by JazzTor (released without artwork)' }),
    ...colours, duration: t0 - 2, tracks: list,
    // a record mixing licence versions lists every one (each track keeps its own in the register)
    licence: [...new Set(tracks.map((t) => t.licence))].join(' / '), licenceUrl: first.licenceUrl, attributionRequired: first.attributionRequired,
    sourceUrl: first.trackUrl, artistUrl: first.artistUrl,
  })
}
// the remaining placeholders are gone; records sorted so the first one is a quiet, classic piano/sax
records.sort((a, b) => (a.artist === 'Maarten Schellekens' ? -1 : b.artist === 'Maarten Schellekens' ? 1 : a.artist.localeCompare(b.artist)))
writeFileSync('D:/Jazztor/app/src/data/catalog.json', JSON.stringify({ generated: new Date().toISOString(), records }, null, 1))
for (const r of records) console.log(r.licence.padEnd(9), r.artist, '—', r.title, `(${r.tracks.length} tr, ${Math.round(r.duration / 60)} min)`, r.dominant, r.accent)
