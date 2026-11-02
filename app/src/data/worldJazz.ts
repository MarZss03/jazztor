// World Jazz History wing - a global chronology, separate from the Toronto content (data/archive.ts).
// Every statement is a summary of the cited source (checked 2026-10-20). No recordings are licensed for playback.
import type { Source } from './archive'

export type WorldChapter = {
  id: string
  year: number
  date: string
  title: string
  movement: string
  location: { city: string; lat: number; lon: number }
  artists: string[]
  recording?: string
  body: string[]
  rights: string
  sources: Source[]
}

const WP = (page: string): Source => ({ label: `Wikipedia: ${decodeURIComponent(page).replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${page}` })
const NO_AUDIO = 'Recording not licensed for JazzTor playback'

export const WORLD: WorldChapter[] = [
  {
    id: 'odjb-1917', year: 1917, date: '26 February 1917', title: 'The first jazz record', movement: 'Early jazz',
    location: { city: 'New York', lat: 40.75, lon: -73.99 }, artists: ['Original Dixieland Jass Band'],
    recording: '“Livery Stable Blues” (Victor 18255)',
    body: ['The Original Dixieland Jass Band recorded “Livery Stable Blues” for Victor at its West 38th Street studio in New York. It is widely acknowledged as the first commercially released jazz recording, and helped establish jazz as popular music.'],
    rights: NO_AUDIO, sources: [WP('Livery_Stable_Blues')],
  },
  {
    id: 'hot-five-1925', year: 1925, date: '1925 – 1928', title: 'Louis Armstrong’s Hot Five', movement: 'New Orleans style · improvisation',
    location: { city: 'Chicago', lat: 41.88, lon: -87.63 }, artists: ['Louis Armstrong', 'Lil Hardin Armstrong', 'Kid Ory', 'Johnny Dodds', 'Johnny St. Cyr', 'Earl Hines'],
    recording: '“West End Blues” (1928)',
    body: ['Armstrong’s first band under his own name recorded for Okeh in Chicago from 1925 to 1928. His solos grew longer and bolder across the sessions, and the recordings — “Heebie Jeebies”, “Hotter Than That”, “West End Blues” — made him the defining voice of jazz improvisation.'],
    rights: NO_AUDIO, sources: [WP('Louis_Armstrong_and_His_Hot_Five')],
  },
  {
    id: 'hot-club-1934', year: 1934, date: '1934', title: 'Quintette du Hot Club de France', movement: 'European jazz · gypsy jazz',
    location: { city: 'Paris', lat: 48.86, lon: 2.35 }, artists: ['Django Reinhardt', 'Stéphane Grappelli'],
    body: ['Guitarist Django Reinhardt and violinist Stéphane Grappelli founded the quintet in Paris: an all-string band with lead guitar and violin, two rhythm guitars and double bass, and no drummer. It was one of Europe’s earliest and most important jazz groups and popularised gypsy jazz.'],
    rights: NO_AUDIO, sources: [WP('Quintette_du_Hot_Club_de_France')],
  },
  {
    id: 'carnegie-1938', year: 1938, date: '16 January 1938', title: 'Benny Goodman at Carnegie Hall', movement: 'Swing',
    location: { city: 'New York', lat: 40.765, lon: -73.98 }, artists: ['Benny Goodman'],
    recording: 'The Famous 1938 Carnegie Hall Jazz Concert (Columbia, 1950)',
    body: ['The first big-band performance at Carnegie Hall. When the recording was finally issued on two LPs in 1950, it became one of the first live albums and one of the first LPs to sell more than a million copies.'],
    rights: NO_AUDIO, sources: [WP('The_Famous_1938_Carnegie_Hall_Jazz_Concert')],
  },
  {
    id: 'mintons-1941', year: 1941, date: 'Early 1940s', title: 'Bebop takes shape at Minton’s', movement: 'Bebop',
    location: { city: 'Harlem, New York', lat: 40.80, lon: -73.95 }, artists: ['Thelonious Monk', 'Kenny Clarke', 'Dizzy Gillespie', 'Charlie Parker', 'Teddy Hill'],
    body: ['Minton’s Playhouse opened in 1938 in Harlem’s Cecil Hotel. Under manager Teddy Hill, its house band — with Thelonious Monk and Kenny Clarke — and the after-hours jam sessions joined by Dizzy Gillespie and Charlie Parker became the workshop where bebop took shape.'],
    rights: NO_AUDIO, sources: [WP('Minton%27s_Playhouse')],
  },
  {
    id: 'kind-of-blue-1959', year: 1959, date: 'March – April 1959', title: 'Kind of Blue', movement: 'Modal jazz',
    location: { city: 'New York', lat: 40.74, lon: -73.99 }, artists: ['Miles Davis', 'Cannonball Adderley', 'John Coltrane', 'Bill Evans', 'Paul Chambers', 'Jimmy Cobb'],
    recording: 'Kind of Blue (Columbia, released 17 August 1959)',
    body: ['Recorded in two sessions at Columbia’s 30th Street Studio, with the musicians improvising over scales rather than chord changes. It became the emblem of modal jazz and is among the best-selling jazz albums in the United States.'],
    rights: NO_AUDIO, sources: [WP('Kind_of_Blue')],
  },
  {
    id: 'getz-gilberto-1964', year: 1964, date: 'Recorded 1963 · released 1964', title: 'Getz/Gilberto and bossa nova', movement: 'Bossa nova',
    location: { city: 'New York', lat: 40.72, lon: -74.0 }, artists: ['Stan Getz', 'João Gilberto', 'Antônio Carlos Jobim', 'Astrud Gilberto'],
    recording: 'Getz/Gilberto (Verve, 1964)',
    body: ['Stan Getz recorded with João Gilberto and Antônio Carlos Jobim in New York in March 1963. Released by Verve in 1964, the album carried bossa nova around the world and won the 1965 Grammy for Album of the Year — the first non-American album to do so.'],
    rights: NO_AUDIO, sources: [WP('Getz/Gilberto')],
  },
]
