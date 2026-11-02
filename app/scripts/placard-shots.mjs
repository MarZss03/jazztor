// Placard reading views as a first-time visitor sees them (nothing chosen), then with a choice made.
//   node scripts/placard-shots.mjs [high|medium|low] [out-dir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const QUALITY = process.argv[2] ?? 'high'
const OUT = (process.argv[3] ?? 'D:/Jazztor/blender/renders/web/placard') + '/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 800)))
const js = (fn, a) => page.evaluate(fn, a)
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` })
const idle = (room) => page.waitForFunction((r) => window.__jazz.useJazz.getState().museumRoom === r && !window.__jazz.museumState.busy, room, { timeout: 20000 })

await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${QUALITY}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await js(() => window.__jazz.useJazz.getState().set({ museumWorld: null, museumToronto: null }))
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum', null, { timeout: 120000 })
await idle('vestibule')
for (const wing of ['world', 'toronto']) {
  await js((w) => window.__jazz.museum.go(w), wing)
  await idle(wing)
  await sleep(1200)
  await shot(`${wing}-room`)
  await page.getByRole('button', { name: 'Read placard' }).click().catch(() => js((w) => window.__jazz.museum.go(`${w}-read`), wing))
  await idle(`${wing}-read`)
  await sleep(1200)
  await shot(`${wing}-read`)
  for (const name of (process.env.CLICKS ?? '').split(',').filter(Boolean)) {
    await page.getByRole('button', { name }).first().click().catch(() => {})
    await sleep(900)
  }
  if (process.env.CLICKS) await shot(`${wing}-read-after`)
}
console.log('errors', errors.length ? errors.join('\n') : 'none')
await browser.close()
