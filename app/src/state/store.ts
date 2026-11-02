import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ALBUMS } from '../data/albums'
import { detectTier, gpuName, type Tier } from '../quality'
import type { MapFilter, MapRange } from '../data/venues'
import { resolveTorontoMode } from '../scene/timeMode'

const GPU = gpuName()
const STORE_KEY = 'jazztor-room-v2' // v2: real catalogue (v1 held placeholder record ids)

/** Time of day at startup (persisted manual setting, else Toronto clock) - avoids a fade-in from a default. */
function initialMode(): TimeMode {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')?.state?.timeSetting
    if (saved === 'DAY' || saved === 'DUSK' || saved === 'NIGHT') return saved
  } catch { /* storage unavailable */ }
  return resolveTorontoMode()
}

export type TimeSetting = 'AUTO' | 'DAY' | 'DUSK' | 'NIGHT'
export type TimeMode = 'DAY' | 'DUSK' | 'NIGHT'
export type Crate = 'FOR_YOU' | 'MY_CRATE'
export type CurtainState = 'OPEN' | 'HALF' | 'CLOSED'
export type Station = 'home' | 'platter' | 'cabinet' | 'map' | 'museum' | 'instrument' // instrument: close-up of a legendary instrument
/** Where the camera stands inside the museum (a separate 3D interior behind the walnut door). */
export type MuseumRoom = 'door' | 'vestibule' | 'world' | 'toronto' | 'world-read' | 'toronto-read' | 'exhibit' | 'instrument' | 'explore' // explore: walking freely
export type DeckState = 'stopped' | 'starting' | 'playing' | 'stopping' | 'manual'
/** HTML stations that slide over the live room (the 3D room keeps running beside them). */
export type Panel = 'menu' | 'crate' | 'room' | 'connect' | 'account'
export type RoomFinish = 'walnut' | 'lacquer' | 'oak'
export type Prefs = {
  whiskeySpeed: 'off' | 'slow' | 'fast'
  roomFinish: RoomFinish
  sfxLevel: number // hardware sounds 0..1
  needleCrackle: boolean // the brief touchdown ticks
  grain: number // film grain 0..1
  memory: boolean // keep a listening history
  quality: 'auto' | 'high' | 'medium' | 'low'
  motion: 'system' | 'reduced' | 'full'
  autoplayOnSelect: boolean // choosing a record from the crate starts it
}
export type HistoryEntry = { albumId: string; trackId: string; at: number }
export const DEFAULT_PREFS: Prefs = {
  whiskeySpeed: 'slow', roomFinish: 'walnut', sfxLevel: 0.6, needleCrackle: true, grain: 0.32, memory: true,
  quality: 'auto', motion: 'system', autoplayOnSelect: true,
}

type JazzState = {
  // persistent room memory
  timeSetting: TimeSetting
  albumId: string
  crate: Crate
  myCrate: string[]
  lampLevel: number // 0 = off, 0..1
  curtain: CurtainState
  volume: number
  positions: Record<string, number> // per-album track position (s)
  mapFilter: MapFilter
  mapRange: MapRange
  savedVenues: string[]
  prefs: Prefs
  history: HistoryEntry[]
  profile: { name: string } | null
  // session
  panel: Panel | null
  catalogVersion: number // bumps when locally imported records are added / removed
  resolvedMode: TimeMode
  deck: DeckState
  station: Station
  hovered: string | null
  toast: string | null
  loaded: boolean
  reducedMotion: boolean
  tier: Tier
  gpu: string
  mapRequested: boolean // the map station GLB is lazy-loaded on first visit (or prefetched when idle)
  selectedVenue: string | null
  mapZoom: number // Jazz Map magnifier (1 = whole table)
  mapPanelOpen: boolean // the venue panel beside the map (minimised to a small tab when false; remembered)
  museumRequested: boolean // the museum GLB + bake are lazy-loaded on first visit
  museumInside: boolean
  museumRoom: MuseumRoom
  museumWorld: string | null // selected World Jazz History chapter
  museumToronto: string | null // selected Toronto Legacy chapter or figure
  museumExhibit: string | null // the framed picture / wall text the camera stands in front of (museumRoom 'exhibit')
  instrument: string | null // the legendary instrument in close-up (listening room station / museum room 'instrument')
  cabinetPage: number // which shelf of 8 sleeves the cabinet shows (the crate can hold more records than sleeves)

  set: (p: Partial<JazzState>) => void
  setPosition: (albumId: string, t: number) => void
  toggleCrateAlbum: (albumId: string) => void
  showToast: (msg: string) => void
  setPrefs: (p: Partial<Prefs>) => void
  logPlay: (albumId: string, trackId: string) => void
}

export const useJazz = create<JazzState>()(
  persist(
    (set, get) => ({
      timeSetting: 'AUTO',
      albumId: ALBUMS[0].id,
      crate: 'FOR_YOU',
      myCrate: ALBUMS.slice(1, 3).map((a) => a.id),
      lampLevel: 0.7,
      curtain: 'OPEN',
      volume: 0.8,
      positions: {},
      mapFilter: 'ALL',
      mapRange: 'THIS WEEK',
      savedVenues: [],
      prefs: DEFAULT_PREFS,
      history: [],
      profile: null,
      panel: null,
      catalogVersion: 0,
      mapRequested: false,
      selectedVenue: null,
      mapZoom: 1,
      mapPanelOpen: true,
      museumRequested: false,
      museumInside: false,
      museumRoom: 'door',
      museumWorld: null,
      museumToronto: null,
      museumExhibit: null,
      cabinetPage: 0,
      instrument: null,
      resolvedMode: initialMode(),
      deck: 'stopped',
      station: 'home',
      hovered: null,
      toast: null,
      loaded: false,
      tier: detectTier(GPU),
      gpu: GPU,
      reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,

      set: (p) => set(p),
      setPosition: (albumId, t) => set({ positions: { ...get().positions, [albumId]: t } }),
      toggleCrateAlbum: (albumId) => {
        const c = get().myCrate
        set({ myCrate: c.includes(albumId) ? c.filter((x) => x !== albumId) : [...c, albumId] })
      },
      setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
      logPlay: (albumId, trackId) => {
        if (!get().prefs.memory) return
        const h = get().history
        if (h[0]?.albumId === albumId && h[0]?.trackId === trackId) return
        set({ history: [{ albumId, trackId, at: Date.now() }, ...h].slice(0, 200) })
      },
      showToast: (msg) => {
        set({ toast: msg })
        window.setTimeout(() => get().toast === msg && set({ toast: null }), 2600)
      },
    }),
    {
      name: STORE_KEY,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<JazzState>
        return { ...current, ...p, prefs: { ...DEFAULT_PREFS, ...(p.prefs ?? {}) } }
      },
      partialize: (s) => ({
        timeSetting: s.timeSetting,
        albumId: s.albumId,
        crate: s.crate,
        myCrate: s.myCrate,
        lampLevel: s.lampLevel,
        curtain: s.curtain,
        volume: s.volume,
        positions: s.positions,
        mapFilter: s.mapFilter,
        mapRange: s.mapRange,
        savedVenues: s.savedVenues,
        mapPanelOpen: s.mapPanelOpen,
        prefs: s.prefs,
        history: s.history,
        profile: s.profile,
      }),
    },
  ),
)

export const visibleAlbums = (crate: Crate, myCrate: string[]) =>
  crate === 'FOR_YOU' ? ALBUMS : ALBUMS.filter((a) => myCrate.includes(a.id))

/** The cabinet has 8 sleeves: a crate larger than that is shown one shelf (page) at a time. */
export const SHELF_SIZE = 8
type ShelfState = Pick<JazzState, 'crate' | 'myCrate' | 'cabinetPage'>
export const shelfPages = (s: ShelfState) => Math.max(1, Math.ceil(visibleAlbums(s.crate, s.myCrate).length / SHELF_SIZE))
/** The records on the shelf in view (index = sleeve index). */
export const shelfAlbums = (s: ShelfState) => {
  const page = Math.min(s.cabinetPage, shelfPages(s) - 1)
  return visibleAlbums(s.crate, s.myCrate).slice(page * SHELF_SIZE, (page + 1) * SHELF_SIZE)
}
/** The shelf holding a record in a crate (0 when it is not in the crate). */
export const shelfOf = (crate: Crate, myCrate: string[], albumId: string) =>
  Math.max(0, Math.floor(visibleAlbums(crate, myCrate).findIndex((a) => a.id === albumId) / SHELF_SIZE))
