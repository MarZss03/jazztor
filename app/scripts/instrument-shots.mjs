// Legendary instruments + museum changes, end to end: the room (instruments, golden east light), clicking each room
// instrument (close-up + card), the vestibule (painting, plinths), each museum instrument, the painting's card, and
// door keyframes (handle down, leaves outward). Shots to OUT; prints state + errors.
//   node scripts/instrument-shots.mjs [high|low] [out]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const Q = process.argv[2] ?? 'high'
const OUT = (process.argv[3] ?? `D:/Jazztor/blender/renders/web/instruments-${Q}`) + '/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(Q === 'low' ? [] : ['--force_high_performance_gpu'])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 600)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const js = (fn, a) => page.evaluate(fn, a)
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` })
const st = () => js(() => { const s = window.__jazz.useJazz.getState(); return { station: s.station, room: s.museumRoom, inst: s.instrument, card: document.querySelector('.instcard h3')?.textContent ?? null } })
const centre = (name) => js((n) => {
  const { scene, THREE, projectWorld } = window.__jazz
  const o = scene.getObjectByName(n)
  if (!o) return null
  const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
  return projectWorld(c.x, c.y, c.z)
}, name)

await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${Q}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.waitForFunction(() => window.__jazz?.THREE, null, { timeout: 60000 })
for (const mode of ['NIGHT', 'DUSK']) {
  await js((m) => window.__jazz.useJazz.getState().set({ timeSetting: m }), mode)
  await sleep(4000)
  await shot(`01-room-${mode.toLowerCase()}`)
}
for (const id of ['Miles', 'Coltrane']) {
  const p = await centre(`JT_Inst_${id}_room`)
  console.log(id, 'at', JSON.stringify(p))
  if (!p) continue
  await page.mouse.move(p.x, p.y)
  await sleep(900)
  await shot(`02-hover-${id}`)
  await page.mouse.click(p.x, p.y)
  await sleep(2600)
  console.log('clicked', id, JSON.stringify(await st()))
  await shot(`03-closeup-${id}`)
  await page.keyboard.press('Escape')
  await sleep(1800)
}
await page.mouse.move(10, 450)
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
// door keyframes: handle down, leaves opening outward
const t0 = Date.now()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum', null, { timeout: 120000 })
for (const [n, ms] of [['04-door-handle', 700], ['05-door-swing', 1350], ['06-door-open', 2300]]) {
  await sleep(Math.max(0, ms - (Date.now() - t0)))
  await shot(n)
}
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 30000 })
await sleep(1500)
await shot('07-vestibule')
for (const id of ['armstrong', 'gillespie', 'parker']) {
  await js((i) => window.__jazz.museum.viewInstrument(i), id)
  await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 20000 })
  await sleep(1800)
  console.log('museum', id, JSON.stringify(await st()))
  await shot(`08-museum-${id}`)
}
await js(() => window.__jazz.museum.view('v-jazzband'))
await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 20000 })
await sleep(1500)
await shot('09-painting')
await js(() => window.__jazz.museum.go('toronto'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'toronto' && !window.__jazz.museumState.busy, null, { timeout: 20000 })
await sleep(1500)
await shot('10-toronto')
await js(() => window.__jazz.museum.go('world'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'world' && !window.__jazz.museumState.busy, null, { timeout: 20000 })
await sleep(1500)
await shot('11-world')
console.log('errors', errors.length ? errors.slice(0, 6).join('\n') : 'none')
await browser.close()
