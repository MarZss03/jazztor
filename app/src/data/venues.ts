// Jazz Map data: venues (names / addresses / categories, geocoded via OSM Nominatim) and the table projection
// written by blender/scripts/jt_map.py. Event listings are SAMPLE data until an events source is connected.
import { ALBUMS } from './albums'

export type VenueCategory = 'live' | 'hall' | 'historic'
export type Venue = { id: string; name: string; address: string; category: VenueCategory; lat: number; lon: number }
export type MapFilter = 'ALL' | 'LIVE' | 'HALLS' | 'HISTORIC'
export type MapRange = 'TONIGHT' | 'THIS WEEK' | 'THIS MONTH'
export type Projection = { lat0: number; lon0: number; kx: number; ky: number; rot: number; scale: number; land: number
  mapW: number; mapH: number; attribution: string }

export const FILTERS: MapFilter[] = ['ALL', 'LIVE', 'HALLS', 'HISTORIC']
export const RANGES: MapRange[] = ['TONIGHT', 'THIS WEEK', 'THIS MONTH']
export const CATEGORY_LABEL: Record<VenueCategory, string> = { live: 'LIVE VENUE', hall: 'CONCERT HALL', historic: 'HISTORIC SITE' }

export const matchesFilter = (v: Venue, f: MapFilter) =>
  f === 'ALL' || (f === 'LIVE' && v.category === 'live') || (f === 'HALLS' && v.category === 'hall') ||
  (f === 'HISTORIC' && v.category === 'historic')

/** lon/lat -> table metres (Blender map plane: +X east-ish, +Y grid north). Mirrors jt_map_geo.Projection. */
export function project(p: Projection, lon: number, lat: number): [number, number] {
  const x = (lon - p.lon0) * p.kx
  const y = (lat - p.lat0) * p.ky
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  return [(x * c + y * s) * p.scale, (-x * s + y * c) * p.scale]
}

let cache: Promise<{ venues: Venue[]; projection: Projection; note: string }> | null = null
export function loadMapData() {
  cache ??= Promise.all([
    fetch('/data/venues.json').then((r) => r.json()),
    fetch('/data/map_projection.json').then((r) => r.json()),
  ]).then(([v, p]) => ({ venues: (v.venues as Venue[]).filter((x) => x.lat && x.lon), projection: p as Projection,
    note: v.note as string }))
  return cache
}

export type SampleEvent = { date: Date; artist: string; style: string }
const STYLES = ['Hard bop', 'Ballads', 'Modal', 'Big band', 'Latin jazz', 'Swing', 'Vocal standards', 'Post-bop']

/** Deterministic placeholder listings (fictional ensembles from the sample catalogue). */
export function sampleEvents(v: Venue, range: MapRange, today = new Date()): SampleEvent[] {
  if (v.category === 'historic') return []
  let seed = [...v.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const days = range === 'TONIGHT' ? 1 : range === 'THIS WEEK' ? 7 : 30
  const count = range === 'TONIGHT' ? 1 : range === 'THIS WEEK' ? 2 : 3
  const out: SampleEvent[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + (range === 'TONIGHT' ? 0 : Math.floor((i + rnd()) * (days / count))))
    d.setHours(v.category === 'hall' ? 20 : 21 + (rnd() < 0.4 ? 1 : 0), rnd() < 0.5 ? 0 : 30, 0, 0)
    out.push({ date: d, artist: ALBUMS[Math.floor(rnd() * ALBUMS.length)].artist, style: STYLES[Math.floor(rnd() * STYLES.length)] })
  }
  return out
}

export const fmtEventDate = (d: Date) =>
  d.toLocaleDateString('en-CA', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase() + ' · ' +
  d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }).toUpperCase()
