// Which texture uploads are slow? Wraps WebGL texImage2D / texSubImage2D and logs calls over 15 ms (size + stack).
import { chromium } from 'playwright-core'

const MS = Number(process.argv[2] ?? 26000)
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.addInitScript(() => {
  window.__up = []
  for (const name of ['texImage2D', 'texSubImage2D', 'compressedTexSubImage2D', 'compressedTexImage2D']) {
    const orig = WebGL2RenderingContext.prototype[name]
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const t = performance.now()
      const r = orig.apply(this, args)
      const dt = performance.now() - t
      if (dt > 15) {
        const src = args.find((a) => a && typeof a === 'object' && ('width' in a))
        window.__up.push([Math.round(t), name, Math.round(dt), src ? `${src.constructor?.name} ${src.width}x${src.height}` : '',
          (new Error().stack ?? '').split('\n').slice(3, 9).map((l) => l.trim().replace(/\(?http:\/\/localhost:5174\//, '').replace(/\?[^:]*/, '')).join(' < ')])
      }
      return r
    }
  }
})
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.waitForTimeout(MS)
for (const u of await page.evaluate(() => window.__up)) console.log(u[0], u[1], u[2] + ' ms', u[3], '\n     ', u[4].slice(0, 400))
await browser.close()
