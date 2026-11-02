// Why does the Toronto wing's window show only part of the city? Counts the skyline meshes and their visibility, then
// shoots the window as-is and with frustum culling off (a wrong bounding volume culls buildings that are in view).
import { chromium } from 'playwright-core'

const OUT = 'D:/Jazztor/blender/renders/web/toronto-window/'
const { mkdirSync } = await import('node:fs')
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${process.env.Q ?? 'high'}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.useJazz.getState().set({ timeSetting: 'NIGHT' }))
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.museum.go('toronto'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'toronto' && !window.__jazz.museumState.busy, null, { timeout: 20000 })
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const s = window.__jazz.museumScene
  const out = s.getObjectByName('JT_Mus_Outside')
  let meshes = 0, culled = 0, vis = 0, tris = 0
  const scales = new Set()
  out?.traverse((o) => {
    if (!o.isMesh) return
    meshes++
    if (o.visible) vis++
    if (o.frustumCulled) culled++
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
    scales.add(o.getWorldScale(new window.__jazz.THREE.Vector3()).x.toFixed(3))
  })
  const cam = window.__jazz.museumCamera
  return { meshes, vis, culled, tris: Math.round(tris), scales: [...scales].slice(0, 6), near: cam.near, far: cam.far,
    cam: cam.position.toArray().map((x) => +x.toFixed(2)) }
})
console.log(JSON.stringify(info))
await page.screenshot({ path: `${OUT}as-is.png` })
await page.evaluate(() => window.__jazz.museumScene.getObjectByName('JT_Mus_Outside')?.traverse((o) => { o.frustumCulled = false }))
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}no-cull.png` })
await browser.close()
