// Fetches the geography for the Jazz Map station and geocodes the venue list.
// Output (cached, committed): D:/Jazztor/data/osm/toronto.json, D:/Jazztor/data/venues.json
// Data © OpenStreetMap contributors, ODbL 1.0 — attribution is engraved on the map table and shown in the UI.
// Usage: node scripts/fetch-map-data.mjs [--venues-only]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const DATA = 'D:/Jazztor/data'
const UA = 'JazzTor-dev/0.1 (Jazz Map station build; contact via project owner)'
// south, west, north, east — Humber Bay to Leslieville, waterfront to Bloor/Davenport
export const BBOX = [43.602, -79.478, 43.680, -79.322]
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function overpass(query) {
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(180_000) })
      if (res.ok) return await res.json()
      console.warn(url, res.status)
    } catch (e) {
      console.warn(url, e.message)
    }
  }
  throw new Error('all Overpass endpoints failed')
}

async function fetchGeography() {
  const b = BBOX.join(',')
  const q = `[out:json][timeout:170];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${b});
  way["waterway"="river"](${b});
  way["leisure"="park"](${b});
  way["railway"="rail"]["service"!~"."](${b});
  way["natural"="water"](${b});
);
out geom;`
  const json = await overpass(q)
  const out = { bbox: BBOX, attribution: '© OpenStreetMap contributors (ODbL 1.0)', fetched: new Date().toISOString(),
    coastline: [], roads: [], rivers: [], parks: [], rail: [], water: [] }
  for (const el of json.elements) {
    if (!el.geometry) continue
    const pts = el.geometry.map((g) => [Number(g.lon.toFixed(6)), Number(g.lat.toFixed(6))])
    const t = el.tags ?? {}
    if (t.natural === 'coastline') out.coastline.push(pts)
    else if (t.highway) out.roads.push({ cls: t.highway, name: t.name ?? '', pts })
    else if (t.waterway === 'river') out.rivers.push({ name: t.name ?? '', pts })
    else if (t.leisure === 'park') out.parks.push({ name: t.name ?? '', pts })
    else if (t.railway === 'rail') out.rail.push(pts)
    else if (t.natural === 'water') out.water.push({ name: t.name ?? '', pts })
  }
  // The Great Lakes are water relations, not coastline: take the Lake Ontario member ways inside the box
  // (mainland shore + Toronto Islands' rings), keeping each way's role.
  const lake = await overpass(`[out:json][timeout:170];
relation["natural"="water"]["name"="Lake Ontario"];
way(r)(${b});
out geom;`)
  const rel = await overpass(`[out:json][timeout:120];relation["natural"="water"]["name"="Lake Ontario"];out body;`)
  const roles = new Map()
  for (const r of rel.elements) for (const m of r.members ?? []) if (m.type === 'way') roles.set(m.ref, m.role)
  for (const el of lake.elements) {
    if (!el.geometry) continue
    out.coastline.push({ role: roles.get(el.id) ?? 'outer', pts: el.geometry.map((g) => [Number(g.lon.toFixed(6)), Number(g.lat.toFixed(6))]) })
  }
  mkdirSync(`${DATA}/osm`, { recursive: true })
  writeFileSync(`${DATA}/osm/toronto.json`, JSON.stringify(out))
  console.log('geography:', Object.entries(out).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`).join(', '))
}

// Venue list: names/addresses are public facts; categories only. Status and history must be verified before launch.
const VENUES = [
  { id: 'rex', name: 'The Rex Hotel Jazz & Blues Bar', address: '194 Queen St W, Toronto', category: 'live' },
  { id: 'jazzbistro', name: 'Jazz Bistro', address: '251 Victoria St, Toronto', category: 'live' },
  { id: 'poetry', name: 'Poetry Jazz Café', address: '224 Augusta Ave, Toronto', category: 'live' },
  { id: 'lula', name: 'Lula Lounge', address: '1585 Dundas St W, Toronto', category: 'live' },
  { id: 'grossmans', name: "Grossman's Tavern", address: '379 Spadina Ave, Toronto', category: 'live' },
  { id: 'massey', name: 'Massey Hall', address: '178 Victoria St, Toronto', category: 'hall' },
  { id: 'koerner', name: 'Koerner Hall', address: '273 Bloor St W, Toronto', category: 'hall' },
  { id: 'roythomson', name: 'Roy Thomson Hall', address: '60 Simcoe St, Toronto', category: 'hall' },
  { id: 'harbourfront', name: 'Harbourfront Centre', address: '235 Queens Quay W, Toronto', category: 'hall' },
  { id: 'colonial', name: 'Colonial Tavern (site)', address: '203 Yonge St, Toronto', category: 'historic' },
  { id: 'georges', name: "George's Spaghetti House (site)", address: '290 Dundas St E, Toronto', category: 'historic' },
  { id: 'towntavern', name: 'Town Tavern (site)', address: '16 Queen St E, Toronto', category: 'historic' },
]

async function geocodeVenues() {
  const prev = existsSync(`${DATA}/venues.json`) ? JSON.parse(readFileSync(`${DATA}/venues.json`, 'utf8')).venues : []
  const out = []
  for (const v of VENUES) {
    const cached = prev.find((p) => p.id === v.id && p.address === v.address && p.lat)
    if (cached) {
      out.push({ ...cached, ...v })
      continue
    }
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&q=${encodeURIComponent(v.address)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } })
    const hits = res.ok ? await res.json() : []
    const h = hits[0]
    out.push({ ...v, lat: h ? Number(Number(h.lat).toFixed(6)) : null, lon: h ? Number(Number(h.lon).toFixed(6)) : null,
      geocoder: h ? `Nominatim: ${h.display_name}` : 'NOT FOUND' })
    console.log(v.id.padEnd(13), h ? `${h.lat}, ${h.lon}` : 'NOT FOUND')
    await sleep(1200) // Nominatim usage policy: max 1 request / second
  }
  writeFileSync(`${DATA}/venues.json`, JSON.stringify({
    note: 'Names, addresses and categories only. Opening status, history and events must be verified before launch.',
    attribution: 'Geocoding © OpenStreetMap contributors (ODbL 1.0) via Nominatim',
    venues: out,
  }, null, 2))
}

if (!process.argv.includes('--venues-only')) await fetchGeography()
await geocodeVenues()
