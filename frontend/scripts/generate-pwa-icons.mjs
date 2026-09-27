import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const src = path.join(root, 'src/img/gold_dragon_allModelAi.png')
const publicDir = path.join(root, 'public')
const outDir = path.join(publicDir, 'pwa')
const bg = { r: 8, g: 11, b: 18, alpha: 1 }

await mkdir(outDir, { recursive: true })
await sharp(src)
  .resize(512, 512, { fit: 'contain', background: bg })
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(publicDir, 'gold-dragon.png'))

const resizeIcon = (size, dest) =>
  sharp(src)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toFile(dest)

await resizeIcon(192, path.join(outDir, 'icon-192.png'))
await resizeIcon(512, path.join(outDir, 'icon-512.png'))
await resizeIcon(180, path.join(outDir, 'apple-touch-icon.png'))

await sharp(src)
  .resize(410, 410, { fit: 'contain', background: bg })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: bg })
  .png()
  .toFile(path.join(outDir, 'icon-maskable-512.png'))

console.log('PWA icons written to public/pwa/ and public/gold-dragon.png')
