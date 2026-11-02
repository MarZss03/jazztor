// Integrated-GPU cost bisection inside the museum: fps with individual features switched off.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.env.DGPU ? ['--force_high_performance_gpu'] : [])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000 })
await page.waitForTimeout(20000)
await page.evaluate(() => window.__jazz.useJazz.getState().set({ reducedMotion: true }))
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
const fps = () => page.evaluate(() => new Promise((r) => {
  const ft = []
  let last = 0
  const f = (t) => { if (last) ft.push(t - last); last = t; ft.length < 150 ? requestAnimationFrame(f) : r(ft) }
  requestAnimationFrame(f)
})).then((ft) => ({ fps: +(1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1), worst: Math.round(Math.max(...ft)), long: ft.filter((x) => x > 50).length }))
console.log('tier', await page.evaluate(() => window.__jazz.useJazz.getState().tier), 'dpr', await page.evaluate(() => window.__jazz.museumGl.getPixelRatio()))
console.log('baseline', JSON.stringify(await fps()))
const toggles = {
  outside: () => { window.__jazz.museumScene.getObjectByName('JT_Mus_Outside').visible = false },
  rectLights: () => { for (const l of window.__jazz.museumRig.lights.children) if (l.isRectAreaLight) l.visible = false },
  allLights: () => { for (const l of window.__jazz.museumRig.lights.children) l.visible = false },
  wallTexts: () => { window.__jazz.museumScene.traverse((o) => { if (/^JT_Mus_Ex(Text|Pic)_/.test(o.name)) o.visible = false }) },
}
for (const [k, fn] of Object.entries(toggles)) {
  await page.evaluate(fn)
  await page.waitForTimeout(600)
  console.log('without', k.padEnd(12), JSON.stringify(await fps()))
}
const info = await page.evaluate(() => ({ calls: window.__jazz.museumGl.info.render.calls, tris: window.__jazz.museumGl.info.render.triangles }))
console.log(JSON.stringify(info))
await browser.close()
