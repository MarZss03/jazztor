// Museum exhibits: what hangs on the walls (layout: data/museum-exhibits.json -> blender/scripts/jt_exhibits.py).
// Captions describe only what the image's own Commons record states (sitters, place, date, maker); credits and licences
// come from app/public/data/museum-images.json, written by scripts/fetch-museum-images.mjs from each file's metadata.
import type { MuseumRoom } from '../state/store'
import { WORLD } from './worldJazz'
import { CHAPTERS, type Source } from './archive'

export type Exhibit = {
  id: string
  room: Extract<MuseumRoom, 'vestibule' | 'world' | 'toronto'>
  /** World / Toronto chapter whose wall text this picture carries */
  chapter?: string
  /** what the picture shows */
  caption: string
  /** text-only panels, and pictures with their own story (the niche painting) */
  title?: string
  kicker?: string
  body?: string[]
  sources?: Source[]
}

export const EXHIBITS: Exhibit[] = [
  {
    id: 'v-intro', room: 'vestibule', title: 'The JazzTor Museum',
    caption: '',
    body: [
      'Two collections, two rooms.',
      'To the left, World Jazz History: from the first jazz record in 1917 to bossa nova in 1964, on a brass timeline and a world map.',
      'To the right, Toronto Jazz Legacy: the halls, clubs and musicians of this city, on a map of Toronto beside the lake.',
      'Choose any picture to read its wall text.',
    ],
  },
  {
    id: 'v-jazzband', room: 'vestibule', kicker: 'Max Oppenheimer (MOPP) · Berlin, 1927', title: 'Jazzband',
    caption: 'Max Oppenheimer, Jazzband (Weintraubs Syncopators), 1927, oil on canvas',
    body: [
      'The Viennese painter Max Oppenheimer, who signed as MOPP, painted the Weintraubs Syncopators at the height of Berlin’s jazz craze: banjo, bass drum, a towering saxophone, trumpet and clarinet crowd the canvas, and the players lean into the music.',
      'The band was founded by Stefan Weintraub and first played in 1924; Friedrich Hollaender joined at the piano and brought them into his revues, and they played in the film The Blue Angel (1930).',
      'From 1933 the Nazi regime banned them from performing in Germany. They toured abroad - the Soviet Union, Japan - and reached Australia in 1937, where they stayed. Oppenheimer himself left Europe for New York, where he died in 1954.',
    ],
    sources: [
      { label: 'Wikipedia: Weintraub Syncopators', url: 'https://en.wikipedia.org/wiki/Weintraub_Syncopators' },
      { label: 'Wikipedia: Max Oppenheimer (artist)', url: 'https://en.wikipedia.org/wiki/Max_Oppenheimer_(artist)' },
    ],
  },
  { id: 'v-armstrong', room: 'vestibule', caption: 'Louis Armstrong, Aquarium, New York, about July 1946' },
  { id: 'v-ellington', room: 'vestibule', caption: 'Duke Ellington, Aquarium, New York, between 1946 and 1948' },
  {
    id: 'v-visit', room: 'vestibule', title: 'About the pictures',
    caption: '',
    body: [
      'Every photograph and poster here is in the public domain or shared under a Creative Commons Attribution licence; each wall text names its maker, source and licence.',
      'Many are by William P. Gottlieb, whose jazz photographs of 1938 to 1948 are held by the Library of Congress.',
      'Musicians without a licensable photograph are not shown in portrait. No recording shown in the museum is licensed for playback in JazzTor.',
    ],
  },
  { id: 'v-holiday', room: 'vestibule', caption: 'Billie Holiday, Downbeat club, New York, about February 1947' },
  { id: 'v-gillespie', room: 'vestibule', caption: 'Dizzy Gillespie, John Lewis, Cecil Payne, Miles Davis and Ray Brown, Downbeat, New York, between 1946 and 1948' },

  { id: 'w-odjb', room: 'world', chapter: 'odjb-1917', caption: 'Victor Talking Machine Company advertisement for the Original Dixieland Jass Band, 1917' },
  { id: 'w-hotfive', room: 'world', chapter: 'hot-five-1925', caption: 'Okeh Records advertisement for Louis Armstrong’s “West End Blues”, 1928' },
  { id: 'w-django', room: 'world', chapter: 'hot-club-1934', caption: 'Django Reinhardt, Aquarium, New York, about November 1946' },
  { id: 'w-carnegie', room: 'world', chapter: 'carnegie-1938', caption: 'Leonard Bernstein, Benny Goodman and Max Hollander at Carnegie Hall, New York, between 1946 and 1948' },
  { id: 'w-mintons', room: 'world', chapter: 'mintons-1941', caption: 'Thelonious Monk, Howard McGhee, Roy Eldridge and Teddy Hill, Minton’s Playhouse, New York, about September 1947' },
  { id: 'w-kob', room: 'world', chapter: 'kind-of-blue-1959', caption: 'Charlie Parker, Tommy Potter, Miles Davis, Duke Jordan and Max Roach, New York, about August 1947 — Miles Davis twelve years before Kind of Blue' },
  { id: 'w-getz', room: 'world', chapter: 'getz-gilberto-1964', caption: 'João Gilberto and Stan Getz in New York, 1972' },

  { id: 't-massey', room: 'toronto', chapter: 'massey-1953', caption: 'Interior of Massey Hall, 1894' },
  { id: 't-yonge', room: 'toronto', chapter: 'colonial', caption: 'Yonge Street looking north from Temperance Street, about 1903' },
  { id: 't-peterson-1944', room: 'toronto', chapter: 'school', caption: 'Oscar Peterson with his sister Daisy at the piano, 1944' },
  { id: 't-ella-oscar', room: 'toronto', chapter: 'town-tavern', caption: 'Oscar Peterson and Ella Fitzgerald, 1964' },
]

export const exhibitById = new Map(EXHIBITS.map((e) => [e.id, e]))
export const exhibitForChapter = new Map(EXHIBITS.filter((e) => e.chapter).map((e) => [e.chapter!, e.id]))

export type WallText = { kicker?: string; title: string; sub?: string; people?: string; body: string[]; note?: string
  caption?: string; sources: Source[] }

/** The wall text of an exhibit (shared by the 3D panel and the reading card). */
export function wallText(id: string): WallText | null {
  const ex = exhibitById.get(id)
  if (!ex) return null
  if (ex.title) return { kicker: ex.kicker, title: ex.title, body: ex.body ?? [], caption: ex.caption || undefined, sources: ex.sources ?? [] }
  const world = WORLD.find((c) => c.id === ex.chapter)
  if (world) {
    return { kicker: `${world.date} · ${world.location.city}`, title: world.title, sub: world.movement, people: world.artists.join(' · '),
      body: world.body, note: `${world.recording ? `${world.recording}. ` : ''}${world.rights}.`, caption: ex.caption, sources: world.sources }
  }
  const tor = CHAPTERS.find((c) => c.id === ex.chapter)
  if (tor) {
    return { kicker: tor.era, title: tor.title, people: tor.artists.join(' · ') || undefined, body: tor.body, caption: ex.caption,
      sources: tor.sources }
  }
  return { title: ex.caption, body: [], sources: [] }
}

export type ImageCredit = { file: string; width: number; height: number; title: string; page: string; licence: string
  licenceUrl: string | null; author: string; credit: string; date: string }
