// Lectern placards: each wing's guide to its entries (World: the timeline milestones; Toronto: venues and moments,
// then the portraits). One text model feeds both the 3D placard on the lectern and the on-screen reading card.
import { WORLD } from './worldJazz'
import { CHAPTERS, FIGURES, type Source } from './archive'

export type Wing = 'world' | 'toronto'
export type PlacardText = {
  kicker: string
  title: string
  sub?: string
  people?: string
  body: string[]
  foot?: string
  note?: string
  sources: Source[]
  venueId?: string
}
export type PlacardEntry = { id: string; year: string; title: string; group?: string }

export const WING_TITLE: Record<Wing, string> = { world: 'World Jazz History', toronto: 'Toronto Jazz Legacy' }
export const WING_INTRO: Record<Wing, string> = {
  world: 'Seven recordings and rooms that changed the music, 1917 to 1964 — from the first jazz record to bossa nova. Each one is pinned on the map and marked on the brass timeline.',
  toronto: 'Nine venues and moments from Toronto’s jazz life, 1949 to today, and four of the musicians who made them. The venues are pinned on the city plan; photographs of the city’s jazz places hang on the side wall.',
}

/** The wing's entries in reading order. */
export const placardEntries = (wing: Wing): PlacardEntry[] => wing === 'world'
  ? [...WORLD].sort((a, b) => a.year - b.year).map((c) => ({ id: c.id, year: String(c.year), title: c.title, group: c.location.city }))
  : [
      ...[...CHAPTERS].sort((a, b) => a.year - b.year).map((c) => ({ id: c.id, year: String(c.year), title: c.title, group: 'Venues and moments' })),
      ...FIGURES.map((f) => ({ id: f.id, year: f.life.split(/\s*[–-]\s*/)[0], title: f.name, group: 'Musicians' })),
    ]

/** Full text for one entry (null = not an entry of this wing). */
export function placardText(wing: Wing, id: string | null | undefined): PlacardText | null {
  if (!id) return null
  if (wing === 'world') {
    const c = WORLD.find((x) => x.id === id)
    if (!c) return null
    return { kicker: `${c.date} · ${c.location.city}`, title: c.title, sub: c.movement, people: c.artists.join(' · '), body: c.body,
      foot: [c.recording, c.rights].filter(Boolean).join(' — '), sources: c.sources }
  }
  const c = CHAPTERS.find((x) => x.id === id)
  if (c) return { kicker: c.era, title: c.title, people: c.artists.join(' · '), body: c.body,
    foot: 'Recording not licensed for JazzTor playback', sources: c.sources, venueId: c.venueId }
  const f = FIGURES.find((x) => x.id === id)
  if (f) return { kicker: `${f.life} · ${f.role}`, title: f.name, sub: f.toronto, body: f.bio,
    foot: `Key works: ${f.works.join('; ')}`, sources: f.sources }
  return null
}

/** Step through the wing's entries; from the contents page (null), +1 opens the first and -1 the last. */
export function stepEntry(wing: Wing, id: string | null | undefined, dir: 1 | -1): string {
  const list = placardEntries(wing)
  const i = list.findIndex((e) => e.id === id)
  if (i < 0) return (dir > 0 ? list[0] : list[list.length - 1]).id
  return list[(i + dir + list.length) % list.length].id
}
