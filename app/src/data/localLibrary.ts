// The listener's own music files: imported through a file picker, kept in this browser (IndexedDB), never uploaded.
// ID3v2 tags give title / artist / album / embedded cover; files are grouped into records by album tag.
import { ALBUMS, type Album, type Track } from './albums'
import { useJazz } from '../state/store'

const DB = 'jazztor-library'
const STORE = 'files'
type Stored = { id: string; name: string; type: string; blob: Blob; added: number }

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

// ------------------------------------------------------------------ ID3v2 (2.3 / 2.4) - text frames + APIC
type Tags = { title?: string; artist?: string; album?: string; picture?: Blob }
function decodeText(b: Uint8Array) {
  const enc = b[0]
  const body = b.subarray(1)
  if (enc === 1 || enc === 2) return new TextDecoder(enc === 1 ? 'utf-16' : 'utf-16be').decode(body).replace(/\0+$/, '')
  return new TextDecoder(enc === 3 ? 'utf-8' : 'latin1').decode(body).replace(/\0+$/, '')
}
async function readTags(file: Blob): Promise<Tags> {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer())
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {}
  const ver = head[3]
  const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f)
  const tag = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer())
  const out: Tags = {}
  let p = 0
  while (p + 10 < tag.length) {
    const id = String.fromCharCode(...tag.subarray(p, p + 4))
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const s = tag.subarray(p + 4, p + 8)
    const len = ver === 4 ? ((s[0] & 0x7f) << 21) | ((s[1] & 0x7f) << 14) | ((s[2] & 0x7f) << 7) | (s[3] & 0x7f)
      : (s[0] << 24) | (s[1] << 16) | (s[2] << 8) | s[3]
    const body = tag.subarray(p + 10, p + 10 + len)
    if (id === 'TIT2') out.title = decodeText(body)
    else if (id === 'TPE1') out.artist = decodeText(body)
    else if (id === 'TALB') out.album = decodeText(body)
    else if (id === 'APIC' && !out.picture) {
      let q = 1
      const mimeEnd = body.indexOf(0, q)
      const mime = new TextDecoder('latin1').decode(body.subarray(q, mimeEnd)) || 'image/jpeg'
      q = mimeEnd + 2 // + picture type
      const wide = body[0] === 1 || body[0] === 2
      if (wide) { while (q + 1 < body.length && !(body[q] === 0 && body[q + 1] === 0)) q += 2; q += 2 }
      else { while (q < body.length && body[q] !== 0) q++; q += 1 }
      out.picture = new Blob([body.slice(q)], { type: mime.includes('/') ? mime : `image/${mime.toLowerCase()}` })
    }
    p += 10 + len
  }
  return out
}

function duration(url: string): Promise<number> {
  return new Promise((res) => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? a.duration : 0)
    a.onerror = () => res(0)
    a.src = url
  })
}

/** Cream paper label for records without embedded artwork. */
function paperCover(title: string, artist: string): string {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#e6dac2'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(90,70,40,${Math.random() * 0.06})`
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  g.fillStyle = '#1d1712'
  g.fillRect(0, 330, 512, 182)
  g.fillStyle = '#c4673f'
  g.fillRect(36, 300, 120, 30)
  g.fillStyle = '#ebe1cb'
  g.font = '600 46px "Cormorant Garamond", Georgia, serif'
  g.fillText(title.slice(0, 22), 36, 400)
  g.font = 'italic 500 32px "Cormorant Garamond", Georgia, serif'
  g.fillText(`— ${artist.slice(0, 26)}`, 36, 450)
  return c.toDataURL('image/jpeg', 0.9)
}

const urls: string[] = []
const keep = (blob: Blob) => {
  const u = URL.createObjectURL(blob)
  urls.push(u)
  return u
}

async function buildRecords(files: Stored[]): Promise<Album[]> {
  const groups = new Map<string, { tags: Tags; f: Stored }[]>()
  for (const f of files.sort((a, b) => a.added - b.added || a.name.localeCompare(b.name))) {
    const tags = await readTags(f.blob)
    const key = `${tags.artist ?? 'Unknown artist'}::${tags.album ?? tags.title ?? f.name}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ tags, f })
  }
  const records: Album[] = []
  for (const [key, items] of groups) {
    const [artist, album] = key.split('::')
    let t0 = 0
    const tracks: Track[] = []
    for (const { tags, f } of items) {
      const src = keep(f.blob)
      const d = await duration(src)
      tracks.push({ id: f.id, title: tags.title ?? f.name.replace(/\.[^.]+$/, ''), src, duration: d, start: t0, gainDb: -3 })
      t0 += d + 2
    }
    const pic = items.find((i) => i.tags.picture)?.tags.picture
    records.push({
      id: `local--${items[0].f.id}`, title: album, artist, cover: pic ? keep(pic) : paperCover(album, artist),
      dominant: '#3a2d22', accent: '#b07a4a', duration: Math.max(1, t0 - 2), tracks, licence: 'Your file',
      licenceUrl: '', attributionRequired: false, sourceUrl: '', artistUrl: '', source: 'local',
    })
  }
  return records
}

async function refresh() {
  const files = await tx<Stored[]>('readonly', (s) => s.getAll() as IDBRequest<Stored[]>)
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u))
  const local = await buildRecords(files)
  for (let i = ALBUMS.length - 1; i >= 0; i--) if (ALBUMS[i].source === 'local') ALBUMS.splice(i, 1)
  ALBUMS.push(...local)
  useJazz.setState((s) => ({ catalogVersion: s.catalogVersion + 1 }))
  return local
}

export const localLibrary = {
  /** Load previously imported files at startup. */
  init: () => refresh().catch(() => []),
  async add(files: FileList | File[]) {
    let n = 0
    for (const f of Array.from(files)) {
      if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i.test(f.name)) continue
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      await tx('readwrite', (s) => s.put({ id, name: f.name, type: f.type, blob: f, added: Date.now() } satisfies Stored))
      n++
    }
    await refresh()
    return n
  },
  async remove(record: Album) {
    for (const t of record.tracks) await tx('readwrite', (s) => s.delete(t.id))
    await refresh()
  },
  async clear() {
    await tx('readwrite', (s) => s.clear())
    await refresh()
  },
  /** Bytes used in this browser (for the privacy line). */
  async usage() {
    const files = await tx<Stored[]>('readonly', (s) => s.getAll() as IDBRequest<Stored[]>)
    return { files: files.length, bytes: files.reduce((a, f) => a + f.blob.size, 0) }
  },
}
