// Home-view cost bisection on the integrated GPU: fps with individual parts hidden.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000 })
await page.waitForTimeout(30000)
const fps = () => page.evaluate(() => new Promise((r) => {
  const ft = []
  let last = 0
  const f = (t) => { if (last) ft.push(t - last); last = t; ft.length < 150 ? requestAnimationFrame(f) : r(ft) }
  requestAnimationFrame(f)
})).then((ft) => +(1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1))
console.log('tier', await page.evaluate(() => window.__jazz.useJazz.getState().tier), 'baseline', await fps())
const hide = async (label, fn) => { await page.evaluate(fn); await page.waitForTimeout(500); console.log('without', label.padEnd(22), await fps()) }
await hide('backdrop', () => window.__jazz.scene.traverse((o) => { if (o.material?.uniforms?.uLayer) o.visible = false }))
await hide('turntable', () => { const t = window.__jazz.scene.getObjectByName('JT_Turntable'); if (t) t.visible = false })
await hide('whiskey', () => { const t = window.__jazz.scene.getObjectByName('JT_Whiskey'); if (t) t.visible = false })
await hide('cabinet', () => { const t = window.__jazz.scene.getObjectByName('JT_Cabinet'); if (t) t.visible = false })
await hide('room', () => { const t = window.__jazz.scene.getObjectByName('JT_Room'); if (t) t.visible = false })
console.log(JSON.stringify(await page.evaluate(() => ({ calls: window.__jazz.gl.info.render.calls, tris: window.__jazz.gl.info.render.triangles }))))
await browser.close()
