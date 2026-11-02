// Fetches licensed tracks from the Free Music Archive with a per-track licence check.
// For every track: archive the track page (licence evidence), parse the embedded track data, accept ONLY
// CC0 / CC BY (any version) - reject NC, ND, SA and anything unrecognised - then download the MP3 and the
// album artwork. Writes D:/Jazztor/audio/licenses/fma-tracks.json (the licence register).
// Usage (inside Use-JazztorEnv): node scripts/fetch-fma.mjs [--dry] [--list <candidates.json>]
//   --list: a JSON file { urls: [...] } of further candidate pages (e.g. a shortlist from an FMA search)
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = 'D:/Jazztor/audio'
const PAGES = `${ROOT}/licenses/pages`
const DL = `${ROOT}/source/fma` // downloaded files: data only, never executed
const UA = 'Mozilla/5.0 (JazzTor development; licence-checked asset fetch)'
const DRY = process.argv.includes('--dry')
mkdirSync(PAGES, { recursive: true })
mkdirSync(DL, { recursive: true })

// Candidates suggested by the project owner (2026-10-20). Album pages expand to their tracks.
const CANDIDATES = [
  'https://freemusicarchive.org/music/maarten-schellekens/public-domain-1/sax-and-piano-free-track/',
  'https://freemusicarchive.org/music/John_Bartmann/Public_Domain_Soundtrack_Music_Album_One/robot-gypsy-jazz/',
  'https://freemusicarchive.org/music/holiznacc0/city-slacker',
  'https://freemusicarchive.org/music/Loyalty_Freak_Music/TO_CHILL_AND_STAY_AWAKE/Loyalty_Freak_Music_-_TO_CHILL_AND_STAY_AWAKE_-_07_Monarch_of_the_street/',
  'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/night-jazz/',
  'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/life-is-great/',
  'https://freemusicarchive.org/music/mr-smith/fever-dreams-1/django/',
]

const LIST = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null
if (LIST) CANDIDATES.push(...JSON.parse(readFileSync(LIST, 'utf8')).urls)

// older FMA artwork URLs have no file extension (…/images/tracks/Track_-_2011…): the bytes decide in build-catalog
const artExt = (u) => new URL(u).pathname.match(/\.(jpe?g|png|gif|webp)$/i)?.[1].toLowerCase() ?? 'jpg'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

async function get(url, type = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return type === 'text' ? res.text() : Buffer.from(await res.arrayBuffer())
}

/** The licence of a track page: the CC deed linked from the page body. */
function classify(html) {
  const links = [...new Set([...html.matchAll(/creativecommons\.org\/(licenses\/[a-z-]+\/[0-9.]+|publicdomain\/zero\/1\.0)/g)].map((m) => m[1]))]
  if (links.length !== 1) return { ok: false, licence: links.join(' + ') || 'none found', reason: 'ambiguous or missing licence' }
  const l = links[0]
  if (l.startsWith('publicdomain/zero')) return { ok: true, licence: 'CC0 1.0', url: `https://creativecommons.org/${l}/`, attribution: false }
  const [, kind, ver] = l.match(/licenses\/([a-z-]+)\/([0-9.]+)/)
  if (kind === 'by') return { ok: true, licence: `CC BY ${ver}`, url: `https://creativecommons.org/${l}/`, attribution: true }
  return { ok: false, licence: `CC ${kind.toUpperCase()} ${ver}`, reason: 'non-commercial / no-derivatives / share-alike - not allowed' }
}

function trackInfos(html) {
  return [...html.matchAll(/data-track-info='([^']+)'/g)].map((m) => JSON.parse(decode(m[1])))
}

function albumArt(html) {
  let m = [...html.matchAll(/https:\/\/freemusicarchive\.org\/image\/\?file=([^&"']+)[^"']*type=album/g)]
  if (!m.length) m = [...html.matchAll(/https:\/\/freemusicarchive\.org\/image\/\?file=([^&"']+)[^"']*type=track/g)] // single-track art
  // original upload from storage (the resize endpoint caps the size and rejects large requests)
  return m.length ? `https://files.freemusicarchive.org/storage-freemusicarchive-org/${decodeURIComponent(m[0][1])}` : null
}

const register = existsSync(`${ROOT}/licenses/fma-tracks.json`) ? JSON.parse(readFileSync(`${ROOT}/licenses/fma-tracks.json`, 'utf8')) : []
const seen = new Set(register.map((r) => r.fmaId))

async function processTrackPage(url, albumHtml) {
  const html = await get(url)
  const info = trackInfos(html)[0]
  if (!info) return console.log('SKIP  no track data', url)
  if (seen.has(info.id)) return console.log('HAVE ', info.title)
  const lic = classify(html)
  const stamp = new Date().toISOString()
  const pageFile = `${PAGES}/${info.id}-${slug(info.title)}.html`
  writeFileSync(pageFile, `<!-- archived ${stamp} from ${url} -->\n${html}`)
  if (!lic.ok) return console.log('REJECT', info.title, '-', lic.licence, '-', lic.reason)
  const art = albumArt(html) ?? (albumHtml && albumArt(albumHtml))
  const base = `${info.id}-${slug(info.artistName)}-${slug(info.title)}`
  const entry = {
    fmaId: info.id, title: info.title, artist: info.artistName, artistUrl: info.artistUrl, album: info.albumTitle,
    trackUrl: info.url, licence: lic.licence, licenceUrl: lic.url, attributionRequired: lic.attribution,
    audioUrl: info.fileUrl, audioFile: `source/fma/${base}.mp3`, coverUrl: art, coverFile: art ? `source/fma/${base}.${artExt(art)}` : null,
    pageSnapshot: pageFile.replace(`${ROOT}/`, ''), checkedAt: stamp,
    coverNote: 'Album artwork is published on FMA by the artist alongside the release; the track licence is assumed to cover it - confirm with the artist before launch.',
  }
  if (!DRY) {
    const audio = await get(info.fileUrl, 'buffer')
    if (audio.slice(0, 3).toString() !== 'ID3' && !(audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)) throw new Error(`not an MP3: ${info.fileUrl}`)
    writeFileSync(`${ROOT}/${entry.audioFile}`, audio)
    entry.audioBytes = audio.length
    entry.audioSha1 = createHash('sha1').update(audio).digest('hex')
    if (art) {
      const img = await get(art, 'buffer')
      writeFileSync(`${ROOT}/${entry.coverFile}`, img)
      entry.coverBytes = img.length
    }
  }
  register.push(entry)
  seen.add(info.id)
  console.log('OK   ', lic.licence.padEnd(9), info.artistName, '-', info.title, DRY ? '' : `(${(statSync(`${ROOT}/${entry.audioFile}`).size / 1e6).toFixed(1)} MB)`)
}

for (const url of CANDIDATES) {
  try {
    const html = await get(url)
    const infos = trackInfos(html)
    if (infos.length > 1) {
      // album page: every track has its own page and its own licence check
      console.log(`ALBUM ${url} (${infos.length} tracks)`)
      for (const t of infos) {
        await processTrackPage(t.url, html)
        await sleep(1500)
      }
    } else {
      await processTrackPage(url)
    }
  } catch (e) {
    console.log('ERROR', url, e.message)
  }
  await sleep(1500)
}
writeFileSync(`${ROOT}/licenses/fma-tracks.json`, JSON.stringify(register, null, 2))
console.log(`register: ${register.length} tracks`)
