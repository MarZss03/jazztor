// A plain typographic sleeve for records published without artwork (e.g. FMA singles): artist + title on warm card,
// in the room's type. It is a JazzTor design, not release artwork - build-catalog marks it as such.
//   node scripts/make-type-cover.mjs "<artist>" "<title>" <out.png>
import { chromium } from 'playwright-core'

const [artist, title, out] = process.argv.slice(2)
if (!out) throw new Error('usage: make-type-cover.mjs "<artist>" "<title>" <out.png>')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
await page.setContent(`<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@500&display=block" rel="stylesheet">
<style>html,body{margin:0;width:1024px;height:1024px;background:#1b130d}</style></head>
<body><canvas id="c" width="1024" height="1024"></canvas></body></html>`)
await page.evaluate(() => document.fonts.ready)
await page.evaluate(async ([artist, title]) => {
  await Promise.all(['600 120px "Cormorant Garamond"', 'italic 500 60px "Cormorant Garamond"', '500 30px Jost'].map((f) => document.fonts.load(f)))
  const g = document.getElementById('c').getContext('2d')
  // deep oxblood card, a brass rule frame, a faint record ring
  const grd = g.createRadialGradient(512, 430, 80, 512, 512, 760)
  grd.addColorStop(0, '#5a2a1c')
  grd.addColorStop(1, '#1e110c')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 1024)
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(255,230,190,${Math.random() * 0.035})`
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 1.5, 1.5)
  }
  g.strokeStyle = 'rgba(214,179,122,0.75)'
  g.lineWidth = 4
  g.strokeRect(56, 56, 912, 912)
  g.lineWidth = 1.5
  g.strokeRect(72, 72, 880, 880)
  g.strokeStyle = 'rgba(214,179,122,0.18)'
  for (const r of [150, 190, 230]) { g.beginPath(); g.arc(512, 380, r, 0, Math.PI * 2); g.stroke() }
  g.fillStyle = '#d6b37a'
  g.beginPath(); g.arc(512, 380, 34, 0, Math.PI * 2); g.fill()
  g.textAlign = 'center'
  g.fillStyle = '#f1e4c8'
  let size = 120
  g.font = `600 ${size}px "Cormorant Garamond"`
  while (g.measureText(artist).width > 820 && size > 60) g.font = `600 ${(size -= 4)}px "Cormorant Garamond"`
  g.fillText(artist, 512, 740)
  g.fillStyle = '#d6b37a'
  g.font = 'italic 500 60px "Cormorant Garamond"'
  g.fillText(title, 512, 820)
  g.font = '500 26px Jost'
  g.letterSpacing = '8px'
  g.fillStyle = 'rgba(214,179,122,0.8)'
  g.fillText('JAZZTOR · FREE MUSIC ARCHIVE', 512, 905)
}, [artist, title])
const data = await page.evaluate(() => document.getElementById('c').toDataURL('image/png').split(',')[1])
const { writeFileSync, mkdirSync } = await import('node:fs')
mkdirSync(out.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
writeFileSync(out, Buffer.from(data, 'base64'))
console.log('wrote', out)
await browser.close()
