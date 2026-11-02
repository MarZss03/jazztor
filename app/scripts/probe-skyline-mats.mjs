// Lists the museum skyline's materials: emissive map / colour / intensity and triangle share (dark = invisible at night).
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=high`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.museumScene?.getObjectByName('JT_Mus_Outside'), null, { timeout: 180000 })
console.log(await page.evaluate(() => {
  const rows = []
  window.__jazz.museumScene.getObjectByName('JT_Mus_Outside').traverse((o) => {
    if (!o.isMesh) return
    const m = o.material
    const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
    rows.push(`${o.name.padEnd(30)} ${String(m.name).padEnd(26)} ${m.type.padEnd(22)} tris ${String(Math.round(tris)).padStart(6)} emisMap ${!!m.emissiveMap} emis ${m.emissive?.getHexString?.()} x${m.emissiveIntensity} col ${m.color?.getHexString?.()}`)
  })
  return rows.join('\n')
}))
await browser.close()
