// Final QA pass in headless Edge: page load, stutter (long frames) and frame rate in every space, music playback,
// lighting sanity (no black / blown frames), and the museum window (modelled exterior, no photograph).
//   node scripts/qa.mjs [auto|high|medium|low] [dgpu|igpu]
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const QUALITY = process.argv[2] ?? 'auto'
const GPU = process.argv[3] ?? 'dgpu'
const OUT = `D:/Jazztor/blender/renders/web/qa-${QUALITY}-${GPU}/`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    ...(GPU === 'dgpu' ? ['--force_high_performance_gpu'] : [])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
page.on('response', (r) => r.status() >= 400 && errors.push('HTTP ' + r.status() + ' ' + r.url()))
const js = (fn, a) => page.evaluate(fn, a)
const S = () => js(() => window.__jazz.useJazz.getState())

// frame timing: every rAF interval is recorded; a window reports fps, worst frame and frames > 50 ms
await page.addInitScript(() => {
  window.__ft = []
  window.__ff = [] // how black the screen was (the museum door fade) when each frame ended
  let last = 0
  const f = (t) => { if (last) { window.__ft.push(t - last); window.__ff.push(window.__jazz?.museumState?.fade ?? 0) } last = t; requestAnimationFrame(f) }
  requestAnimationFrame(f)
})
const frames = async (ms) => {
  await js(() => (window.__ft = []))
  await sleep(ms)
  const ft = await js(() => window.__ft.slice())
  const total = ft.reduce((a, b) => a + b, 0)
  return { fps: ft.length / (total / 1000), worst: Math.max(...ft), long: ft.filter((x) => x > 50).length, n: ft.length }
}
const lum = async (name) => {
  const buf = await page.screenshot({ path: `${OUT}${name}.png`, clip: { x: 0, y: 0, width: 1600, height: 780 } })
  const img = PNG.sync.read(buf)
  let s = 0, black = 0, white = 0
  const n = img.width * img.height
  for (let i = 0; i < n; i++) {
    const l = (0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2]) / 255
    s += l
    if (l < 0.02) black++
    if (l > 0.98) white++
  }
  return { mean: s / n, black: black / n, white: white / n }
}
const lightingOk = (l) => l.mean > 0.04 && l.mean < 0.75 && l.black < 0.8 && l.white < 0.08

// ---- load
const t0 = Date.now()
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}${QUALITY === 'auto' ? '' : `?quality=${QUALITY}`}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
const loadS = (Date.now() - t0) / 1000
const tier = (await S()).tier
check('page opens and the room is interactive', loadS < 25, `${loadS.toFixed(1)} s, tier ${tier}`)
// the listener sits in the room while the map (6 s) and the museum (14 s) load and compile in the background
const idle = await frames(22000)
// (the one-time background preload may cost a few 50-100 ms frames; a freeze - 120 ms or more - fails)
check('idle in the room while stations load in the background: no freezes', idle.worst < 120,
  `${idle.fps.toFixed(0)} fps over 22 s, worst ${idle.worst.toFixed(0)} ms, ${idle.long} long frames`)

// ---- music
await js(() => window.__jazz.useJazz.getState().set({ timeSetting: 'DUSK' }))
// the longest record on the deck: the run takes minutes, and a short one (the 94 s default) plays out and stops before
// the museum checks - a correct turntable, a false "music stopped" failure
await js(() => {
  const s = window.__jazz.useJazz.getState()
  const all = window.__jazz.visibleAlbums('FOR_YOU', s.myCrate)
  s.set({ albumId: all.reduce((a, b) => (b.duration > a.duration ? b : a)).id })
})
// Space starts the record (the keyboard shortcut) - also the user gesture audio needs, without clicking into the scene
await page.keyboard.press('Space')
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'playing', null, { timeout: 30000 }).catch(() => {})
const p1 = await js(() => window.__jazz.audio.position())
await sleep(3000)
const p2 = await js(() => window.__jazz.audio.position())
const lv = await js(() => window.__jazz.audio.levels())
check('music plays (position advances, signal on the meters)', p2 - p1 > 2.3 && Math.max(...lv) > 0.001,
  `+${(p2 - p1).toFixed(2)} s in 3 s, levels ${lv.map((v) => v.toFixed(3)).join('/')}`)

// ---- spaces: smoothness + lighting
const spaces = [
  ['home-dusk', async () => {}],
  ['home-night', async () => js(() => window.__jazz.useJazz.getState().set({ timeSetting: 'NIGHT' }))],
  ['home-day', async () => js(() => window.__jazz.useJazz.getState().set({ timeSetting: 'DAY' }))],
  ['platter', async () => js(() => window.__jazz.useJazz.getState().set({ station: 'platter' }))],
  ['cabinet', async () => js(() => window.__jazz.useJazz.getState().set({ station: 'cabinet' }))],
  ['map', async () => {
    await js(() => { window.__ft = [] })
    await js(() => window.__jazz.useJazz.getState().set({ station: 'map', mapRequested: true }))
    await sleep(1600)
    const fl = await js(() => window.__ft.slice())
    check('first flight to the map table: smooth', fl.filter((x) => x > 50).length <= 1 && Math.max(...fl) < 150,
      `worst ${Math.max(...fl).toFixed(0)} ms, ${fl.filter((x) => x > 50).length} long frames`)
  }],
]
for (const [name, go] of spaces) {
  await go()
  await sleep(2600)
  const f = await frames(2500)
  const l = await lum(name)
  check(`${name}: smooth`, f.fps > 45 && f.long <= 2, `${f.fps.toFixed(0)} fps, worst ${f.worst.toFixed(0)} ms, ${f.long} long frames`)
  check(`${name}: lighting`, lightingOk(l), `mean ${l.mean.toFixed(3)}, black ${(l.black * 100).toFixed(1)} %, clipped ${(l.white * 100).toFixed(2)} %`)
}
await js(() => window.__jazz.useJazz.getState().set({ station: 'home', timeSetting: 'DUSK' }))
await sleep(1500)

// ---- museum: entry without stutter, every room smooth and lit, music still playing
await js(() => { window.__ft = []; window.__ff = [] })
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && window.__jazz.museumState && !window.__jazz.museumState.busy,
  null, { timeout: 120000 })
// stutter the listener can see: long frames while the picture is on screen (not under the black of the door fade)
const entry = await js(() => window.__ft.map((t, i) => [t, window.__ff[i]]))
const seen = entry.filter(([, f]) => f < 0.98).map(([t]) => t)
const entryLong = seen.filter((x) => x > 50)
check('museum opens through the door without visible stutter', entryLong.length <= 1 && Math.max(...seen) < 120,
  `${entry.length} frames, worst visible ${Math.max(...seen).toFixed(0)} ms, ${entryLong.length} visible > 50 ms; worst under the fade ${Math.max(...entry.map(([t]) => t)).toFixed(0)} ms`)
const win = await js(() => ({ photo: !!window.__jazz.museumScene.getObjectByName('JT_Mus_TorontoView'),
  outside: !!window.__jazz.museumScene.getObjectByName('JT_Mus_Outside'),
  buildings: (() => { let n = 0; window.__jazz.museumScene.getObjectByName('JT_Mus_Outside')?.traverse((o) => { if (o.isMesh) n++ }); return n })() }))
check('museum window: a modelled city, not a photograph', !win.photo && win.outside && win.buildings > 10, JSON.stringify(win))
for (const [name, go] of [
  ['museum-vestibule', async () => {}],
  ['museum-world', async () => js(() => window.__jazz.museum.go('world'))],
  ['museum-exhibit', async () => js(() => window.__jazz.museum.view('w-mintons'))],
  ['museum-toronto', async () => js(() => window.__jazz.museum.go('toronto'))],
]) {
  await go()
  await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 20000 }).catch(() => {})
  await sleep(900)
  const f = await frames(2500)
  const l = await lum(name)
  check(`${name}: smooth`, f.fps > 45 && f.long <= 2, `${f.fps.toFixed(0)} fps, worst ${f.worst.toFixed(0)} ms, ${f.long} long frames`)
  check(`${name}: lighting`, lightingOk(l), `mean ${l.mean.toFixed(3)}, black ${(l.black * 100).toFixed(1)} %, clipped ${(l.white * 100).toFixed(2)} %`)
}
const p3 = await js(() => window.__jazz.audio.position())
await sleep(2000)
const p4 = await js(() => window.__jazz.audio.position())
const dk = await js(() => { const s = window.__jazz.useJazz.getState(); return `${s.deck}, ${s.albumId}, at ${window.__jazz.audio.position().toFixed(1)} s, audio ${window.__jazz.audio.ctx?.state ?? '?'}` })
check('music keeps playing inside the museum', p4 - p3 > 1.5 && (await S()).deck === 'playing', `+${(p4 - p3).toFixed(2)} s in 2 s (${dk})`)
await page.keyboard.press('Escape')
await sleep(1500)
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'home' && !window.__jazz.museumState.busy, null, { timeout: 20000 }).catch(() => {})
check('back home from the museum', (await S()).station === 'home')
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
const failed = results.filter((r) => !r.ok).length
writeFileSync(`${OUT}qa.json`, JSON.stringify({ quality: QUALITY, gpu: GPU, results }, null, 1))
console.log(`\n${results.length - failed}/${results.length} QA checks passed (${QUALITY}, ${GPU}). Shots: ${OUT}`)
process.exit(failed ? 1 : 0)
