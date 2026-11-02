// Free walk in the museum: start exploring, walk through the vestibule into each wing with the keyboard, turn by
// dragging, bump into a wall (must slide, not pass), open a picture from the walk and come back to the same spot.
//   node scripts/explore-shots.mjs [high|low]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const Q = process.argv[2] ?? 'high'
const OUT = `D:/Jazztor/blender/renders/web/explore-${Q}/`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(Q === 'low' ? [] : ['--force_high_performance_gpu'])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 500)))
const js = (fn, a) => page.evaluate(fn, a)
const pos = () => js(() => { const w = window.__jazz.museumWalkState(); return { room: window.__jazz.useJazz.getState().museumRoom, x: +w.x.toFixed(2), y: +w.y.toFixed(2), yaw: +w.yaw.toFixed(2) } })
const hold = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(250) }

await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${Q}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await page.getByRole('button', { name: 'Explore freely' }).click()
await sleep(600)
console.log('start', JSON.stringify(await pos()))
await page.screenshot({ path: `${OUT}01-start.png` })
await hold('w', 1800)
console.log('walked', JSON.stringify(await pos()))
await page.screenshot({ path: `${OUT}02-walked.png` })
// line up with the World arch (strafe left), then walk through it into the wing; a slight turn by dragging
await hold('s', 900)
await hold('a', 1700)
await page.mouse.move(800, 400); await page.mouse.down(); await page.mouse.move(780, 400, { steps: 6 }); await page.mouse.up()
await sleep(300)
await hold('w', 5200)
console.log('world?', JSON.stringify(await pos()))
await page.screenshot({ path: `${OUT}03-world.png` })
// walk straight into a wall for a long time: must stop at the wall
await hold('a', 4000)
const wall = await pos()
console.log('wall', JSON.stringify(wall))
await page.screenshot({ path: `${OUT}04-wall.png` })
// open a picture from the walk (the accessible list), then back: same spot
const before = await pos()
await js(() => window.__jazz.museum.view('w-django'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'exhibit' && !window.__jazz.museumState.busy, null, { timeout: 20000 })
await sleep(500)
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'explore' && !window.__jazz.museumState.busy, null, { timeout: 20000 }).catch(() => {})
await sleep(400)
console.log('back', JSON.stringify(await pos()), 'was', JSON.stringify(before))
// the time switch while walking
await page.getByRole('radio', { name: 'DAY' }).click()
await sleep(2500)
await page.screenshot({ path: `${OUT}05-day.png` })
// guided tour again
await page.keyboard.press('Escape')
await sleep(1500)
console.log('guided', JSON.stringify(await js(() => window.__jazz.useJazz.getState().museumRoom)))
console.log('errors', errors.length ? errors.join('\n') : 'none')
await browser.close()
