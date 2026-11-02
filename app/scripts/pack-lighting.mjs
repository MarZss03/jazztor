// Web delivery for the Cycles bake: lightmaps PNG -> JPEG (4096 high/medium, 2048 low); lightmaps.json updated.
// (Reflection HDRs are downsampled in Blender, see blender/scripts/pack_env.py.)
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { readFileSync, writeFileSync, statSync } from 'node:fs'

const DIR = process.argv[2] ?? 'D:/Jazztor/app/public/assets/lighting' // or the museum: public/assets/museum
const meta = JSON.parse(readFileSync(`${DIR}/lightmaps.json`, 'utf8'))

function half(img) {
  const w = img.width >> 1, h = img.height >> 1, out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      const i = (((y * 2) * img.width + x * 2) * 4) + c
      out[(y * w + x) * 4 + c] = (img.data[i] + img.data[i + 4] + img.data[i + img.width * 4] + img.data[i + img.width * 4 + 4]) >> 2
    }
  }
  return { width: w, height: h, data: out }
}

for (const [k, m] of Object.entries(meta.maps)) {
  const src = m.png ?? m.file
  const img = PNG.sync.read(readFileSync(`${DIR}/${src}`))
  const full = `lm-${k}.jpg`, low = `lm-${k}-2048.jpg`
  writeFileSync(`${DIR}/${full}`, jpeg.encode(img, 92).data)
  writeFileSync(`${DIR}/${low}`, jpeg.encode(half(img), 90).data)
  Object.assign(m, { png: src, file: full, fileLow: low })
  console.log(k, `${(statSync(`${DIR}/${src}`).size / 1e6).toFixed(1)} MB png ->`, `${(statSync(`${DIR}/${full}`).size / 1e6).toFixed(2)} MB jpg,`,
    `${(statSync(`${DIR}/${low}`).size / 1e6).toFixed(2)} MB low`)
}
writeFileSync(`${DIR}/lightmaps.json`, JSON.stringify(meta, null, 1))
