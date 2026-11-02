// CPU profile of the first seconds after the room is revealed: self time per function inside frames longer than 45 ms.
//   node scripts/idle-profile.mjs [seconds=2]   (integrated GPU unless DGPU=1)
import { chromium } from 'playwright-core'

const SECS = Number(process.argv[2] ?? 2)
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.env.DGPU ? ['--force_high_performance_gpu'] : [])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await page.addInitScript(() => {
  window.__long = []
  let last = 0
  const f = (t) => {
    if (last && t - last > 45 && window.__jazz?.useJazz.getState().loaded) window.__long.push([last, t])
    last = t
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
})
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000, polling: 16 })
await cdp.send('Profiler.start')
const origin = await page.evaluate(() => performance.timeOrigin)
await page.waitForTimeout(SECS * 1000)
const { profile } = await cdp.send('Profiler.stop')
const long = await page.evaluate(() => window.__long)
console.log('long frames (ms):', long.map(([a, b]) => Math.round(b - a)).join(', '))
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
// profile times are in microseconds on the monotonic clock; map to performance.now() via the page's time origin
let t = profile.startTime
const self = new Map()
const nowOf = (us) => us / 1000 - (origin - Math.floor(origin / 1e9) * 0)
void nowOf
// (monotonic vs performance.now offset: take the profile's start as the first sample after 'loaded')
const firstLong = long[0]?.[0] ?? 0
const startNow = await page.evaluate(() => performance.now()) - SECS * 1000
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i]
  const now = startNow + (t - profile.startTime) / 1000
  if (!long.some(([a, b]) => now >= a && now <= b)) continue
  const n = byId.get(profile.samples[i])
  const cf = n.callFrame
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`
  self.set(key, (self.get(key) ?? 0) + profile.timeDeltas[i] / 1000)
}
void firstLong
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(v.toFixed(1).padStart(7), 'ms ', k)
await browser.close()
