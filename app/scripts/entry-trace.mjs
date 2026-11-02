// Frame-by-frame trace of a transition on the integrated GPU: museum door entry (default) or the first map flight.
//   node scripts/entry-trace.mjs [museum|map]
import { chromium } from 'playwright-core'

const WHAT = process.argv[2] ?? 'museum'
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.env.DGPU ? ['--force_high_performance_gpu'] : [])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.addInitScript(() => {
  window.__stack = true
  window.__ev = []
  for (const name of ['texImage2D', 'texSubImage2D', 'compressedTexSubImage2D']) {
    const orig = WebGL2RenderingContext.prototype[name]
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const t = performance.now()
      const r = orig.apply(this, args)
      const src = args.find((a) => a && typeof a === 'object' && 'width' in a)
      const stack = (new Error().stack ?? '').split(String.fromCharCode(10)).slice(3, 7).map((l) => l.trim().split(' ')[1]).join('<')
      window.__ev.push(`${name} ${src ? src.width + 'x' + src.height : args[4] + 'x' + args[5]} ${Math.round(performance.now() - t)}ms ${stack}`)
      return r
    }
  }
  const lp = WebGL2RenderingContext.prototype.linkProgram
  WebGL2RenderingContext.prototype.linkProgram = function (...a) { window.__ev.push('linkProgram'); return lp.apply(this, a) }
})
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000 })
await page.waitForTimeout(24000)
await page.keyboard.press('Space')
await page.waitForTimeout(3000)
if (process.env.PRE === 'map') {
  await page.evaluate(() => window.__jazz.useJazz.getState().set({ station: 'map' }))
  await page.waitForTimeout(6000)
  await page.evaluate(() => window.__jazz.useJazz.getState().set({ station: 'home', timeSetting: 'DUSK' }))
  await page.waitForTimeout(2000)
}
await page.evaluate(() => {
  window.__rows = []
  let last = 0
  const f = (t) => {
    if (last && t - last > 45) {
      const m = window.__jazz.museumState
      window.__rows.push([Math.round(t - last), m ? `fade ${m.fade.toFixed(2)} door ${m.door.toFixed(2)}` : '', window.__jazz.useJazz.getState().station, window.__ev.slice(0, 6).join(' | ')])
    }
    window.__ev = []
    last = t
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
})
if (WHAT === 'museum') {
  await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
  await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
} else {
  await page.evaluate(() => window.__jazz.useJazz.getState().set({ station: 'map' }))
  await page.waitForTimeout(2000)
}
for (const r of await page.evaluate(() => window.__rows)) console.log(r.join('  ·  '))
await browser.close()
