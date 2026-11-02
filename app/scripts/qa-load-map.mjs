// Re-test two QA checks on their own, with QA's exact measurements and thresholds (scripts/qa.mjs):
//   page opens and the room is interactive  (navigation -> loaded < 25 s)
//   first flight to the map table: smooth  (<= 1 frame over 50 ms, none over 150 ms; after QA's 22 s idle)
// One untimed warm-up (a cold dev-server bundle cache after a reboot), then N measured runs, a fresh browser each.
//   node scripts/qa-load-map.mjs [dgpu|igpu] [runs=3]
import { chromium } from 'playwright-core'

const GPU = process.argv[2] ?? 'dgpu'
const RUNS = Number(process.argv[3] ?? 3)
const URL = process.env.JT_URL ?? 'http://localhost:5174/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(label, measure) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
      ...(GPU === 'dgpu' ? ['--force_high_performance_gpu'] : [])] })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await page.addInitScript(() => {
    window.__ft = []
    let last = 0
    const f = (t) => { if (last) window.__ft.push(t - last); last = t; requestAnimationFrame(f) }
    requestAnimationFrame(f)
  })
  const t0 = Date.now()
  await page.goto(URL, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000 })
  const loadS = (Date.now() - t0) / 1000
  if (!measure) { console.log(`${label}: loaded in ${loadS.toFixed(1)} s (untimed)`); await browser.close(); return null }
  await sleep(22000) // QA's idle: the map station loads in the background meanwhile
  await page.evaluate(() => { window.__ft = [] })
  await page.evaluate(() => window.__jazz.useJazz.getState().set({ station: 'map', mapRequested: true }))
  await sleep(1600)
  const fl = await page.evaluate(() => window.__ft.slice())
  const worst = Math.max(...fl), long = fl.filter((x) => x > 50).length
  const r = { loadS, loadOk: loadS < 25, worst, long, flightOk: long <= 1 && worst < 150 }
  console.log(`${label}: ${r.loadOk ? 'PASS' : 'FAIL'} load ${loadS.toFixed(1)} s · ${r.flightOk ? 'PASS' : 'FAIL'} map flight worst ${worst.toFixed(0)} ms, ${long} long frames`)
  await browser.close()
  return r
}

await run('warm-up', false)
const rs = []
for (let i = 1; i <= RUNS; i++) rs.push(await run(`run ${i}`, true))
console.log(`load: ${rs.filter((r) => r.loadOk).length}/${RUNS} pass · map flight: ${rs.filter((r) => r.flightOk).length}/${RUNS} pass`)
