// Museum look-development shots in headless Edge: door keyframes, vestibule, both wings, reading views.
//   node scripts/museum-shots.mjs [high|medium|low] [out-dir]     (dev server on JT_URL, default :5174)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const QUALITY = process.argv[2] ?? 'high'
const OUT = (process.argv[3] ?? `D:/Jazztor/blender/renders/web/museum-${QUALITY}`) + '/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 800)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('response', (r) => r.status() >= 400 && errors.push('HTTP ' + r.status() + ' ' + r.url()))
const js = (fn, a) => page.evaluate(fn, a)
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` })
const idle = (room) => page.waitForFunction((r) => window.__jazz.useJazz.getState().museumRoom === r && !window.__jazz.museumState.busy, room, { timeout: 20000 })

await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${QUALITY}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await sleep(2000)
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum', null, { timeout: 120000 })
// door keyframes: closed, handle down, leaves at ~40 %, open + dolly
const t0 = Date.now()
const marks = [['18-door-closed', 250], ['19-door-handle', 750], ['20-door-swing', 1350], ['21-door-open', 2300]]
for (const [n, ms] of marks) {
  await sleep(Math.max(0, ms - (Date.now() - t0)))
  await shot(n)
  console.log(n, JSON.stringify(await js(() => { const m = window.__jazz.museumState; return { h: +m.handle.toFixed(2), l: +m.latch.toFixed(2), d: +m.door.toFixed(2) } })))
}
await idle('vestibule')
await sleep(1500)
await shot('13-museum-vestibule')
await js(() => window.__jazz.museum.go('world'))
await idle('world')
await js(() => window.__jazz.useJazz.getState().set({ museumWorld: 'kind-of-blue-1959' }))
await sleep(1500)
await shot('14-museum-world')
await js(() => window.__jazz.museum.go('world-read'))
await idle('world-read')
await sleep(800)
await shot('15-museum-world-placard')
await js(() => window.__jazz.museum.go('toronto'))
await idle('toronto')
await js(() => window.__jazz.useJazz.getState().set({ museumToronto: 'massey-1953' }))
await sleep(1500)
await shot('16-museum-toronto')
await js(() => window.__jazz.museum.go('toronto-read'))
await idle('toronto-read')
await sleep(800)
await shot('22-museum-toronto-placard')
for (const id of ['v-intro', 'v-armstrong', 'w-mintons', 'w-hotfive', 't-massey', 't-ella-oscar']) {
  await js((x) => window.__jazz.museum.view(x), id)
  await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 20000 })
  await sleep(900)
  await shot('ex-' + id)
}
const fps = await js(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => (++n, performance.now() - t < 2000 ? requestAnimationFrame(f) : r(n / 2)); requestAnimationFrame(f) }))
console.log('fps', fps, 'errors', errors.length ? errors.slice(0, 5).join('\n') : 'none')
await browser.close()
