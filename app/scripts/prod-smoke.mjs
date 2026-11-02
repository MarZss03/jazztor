// Smoke test of a PRODUCTION build (vite preview / a deployed URL): no dev test hooks exist there, so everything is
// checked from the outside - page errors, failed requests, the loader clearing, the room's buttons, the museum door,
// the Credits dialog, and a track actually streaming after Space.
//   node scripts/prod-smoke.mjs [url=http://localhost:4173/] [igpu|dgpu]
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:4173/'
const GPU = process.argv[3] ?? 'igpu'
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    ...(GPU === 'dgpu' ? ['--force_high_performance_gpu'] : [])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = [], failed = [], audio = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); if (/\.mp3/.test(r.url())) audio.push(r.status()) })
const t0 = Date.now()
await page.goto(URL, { waitUntil: 'commit' })
// the loader leaves once the room is interactive (the MUSEUM button becomes usable)
const loaded = await page.waitForFunction(() => !document.querySelector('.loader') || getComputedStyle(document.querySelector('.loader')).opacity === '0',
  null, { timeout: 180000 }).then(() => true).catch(() => false)
check('production build opens; loader clears', loaded, `${((Date.now() - t0) / 1000).toFixed(1)} s`)
const isDev = await page.evaluate(() => typeof window.__jazz !== 'undefined')
check('no dev test hooks in the production bundle', !isDev)
await page.waitForTimeout(3000)
await page.keyboard.press('Space')
await page.waitForTimeout(6000)
check('a track streams after Space', audio.some((s) => s === 200 || s === 206), `mp3 responses ${JSON.stringify(audio.slice(0, 4))}`)
await page.getByRole('button', { name: 'CREDITS' }).click()
const pics = await page.waitForFunction(() => document.querySelectorAll('.credits__pictures li').length, null, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => 0)
check('Credits lists the museum pictures', pics >= 20, `${pics} pictures`)
await page.locator('.credits__close').click()
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
const inMuseum = await page.waitForFunction(() => /Vestibule/.test(document.querySelector('.museum-ui__where')?.textContent ?? ''), null, { timeout: 120000 })
  .then(() => true).catch(() => false)
check('the museum opens through the door', inMuseum)
await page.screenshot({ path: 'D:/Jazztor/blender/renders/web/prod-smoke-museum.png' })
await page.waitForTimeout(1500)
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
check('no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '))
console.log(`${results.filter(Boolean).length}/${results.length} smoke checks passed`)
await browser.close()
