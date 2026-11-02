// Does the music stop inside the museum? Starts the longest record, then follows QA's museum route and logs the deck
// state, the playback position and the audio context state at every step.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`.slice(0, 200)))
page.on('pageerror', (e) => logs.push('pageerror: ' + String(e).slice(0, 200)))
const js = (fn, a) => page.evaluate(fn, a)
const t0 = Date.now()
const st = async (label) => console.log(String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6), label.padEnd(22), JSON.stringify(await js(() => {
  const s = window.__jazz.useJazz.getState()
  return { deck: s.deck, album: s.albumId.slice(0, 18), pos: +window.__jazz.audio.position().toFixed(2), room: s.museumRoom, station: s.station,
    ctx: window.__jazz.audio.ctx?.state ?? window.__jazz.audio.context?.state ?? '?' }
})))
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await js(() => {
  const s = window.__jazz.useJazz.getState()
  const all = window.__jazz.visibleAlbums('FOR_YOU', s.myCrate)
  s.set({ albumId: all.reduce((a, b) => (b.duration > a.duration ? b : a)).id })
})
await page.keyboard.press('Space')
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'playing', null, { timeout: 30000 }).catch(() => {})
await st('playing')
await page.waitForTimeout(3000)
await st('+3 s')
for (const station of ['platter', 'cabinet', 'map', 'home']) {
  await js((x) => window.__jazz.useJazz.getState().set({ station: x }), station)
  await page.waitForTimeout(2500)
  await st(station)
}
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await st('vestibule')
for (const [n, go] of [['world', () => js(() => window.__jazz.museum.go('world'))], ['exhibit', () => js(() => window.__jazz.museum.view('w-mintons'))],
  ['toronto', () => js(() => window.__jazz.museum.go('toronto'))]]) {
  await go()
  await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await st(n)
}
await page.waitForTimeout(2000)
await st('end')
console.log(logs.filter((l) => !/vite|HMR|DevTools/.test(l)).slice(-15).join('\n'))
await browser.close()
