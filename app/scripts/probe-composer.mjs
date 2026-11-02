// Lists the post-processing passes / effects in the composer (is the colour grade in the chain?)
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.useJazz.getState().set({ station: 'museum' }))
for (let i = 0; i < 4; i++) { await page.waitForTimeout(700); console.log('t', i, await page.evaluate(() => { const g = window.__jazz.composer.passes.at(-1).effects[0]; return g.uniforms.get('uGain').value.z.toFixed(4) + ' station ' + window.__jazz.useJazz.getState().station + ' frames ' + window.__jazz.gl.info.render.frame })) }
console.log(await page.evaluate(() => { const g = window.__jazz.composer.passes.at(-1).effects[0]; const u = {}; g.uniforms.forEach((v, k) => (u[k] = v.value?.toArray ? v.value.toArray() : v.value)); return JSON.stringify(u) + ' frag has uGain: ' + g.fragmentShader.includes('uGain') }))
console.log(await page.evaluate(() => {
  const c = window.__jazz.composer
  if (!c) return 'no composer'
  return c.passes.map((p) => `${p.name}${p.effects ? ' [' + p.effects.map((e) => e.name).join(', ') + ']' : ''} enabled=${p.enabled}`).join('\n')
}))
await browser.close()
