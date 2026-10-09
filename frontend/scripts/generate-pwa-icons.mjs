import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const publicDir = path.join(root, 'public')
const outDir = path.join(publicDir, 'pwa')
const bg = { r: 8, g: 11, b: 18, alpha: 1 }

const outputFiles = [
  path.join(publicDir, 'gold-dragon.png'),
  path.join(outDir, 'icon-192.png'),
  path.join(outDir, 'icon-512.png'),
  path.join(outDir, 'apple-touch-icon.png'),
  path.join(outDir, 'icon-maskable-512.png'),
]

async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function allOutputsExist() {
  const checks = await Promise.all(outputFiles.map((file) => pathExists(file)))
  return checks.every(Boolean)
}

const sourceCandidates = [
  path.join(root, 'src/img/gold_dragon_allModelAi.png'),
  path.join(publicDir, 'aihub-dragon.svg'),
  path.join(publicDir, 'favicon.svg'),
]

let src = null
for (const candidate of sourceCandidates) {
  if (await pathExists(candidate)) {
    src = candidate
    break
  }
}

if (!src) {
  if (await allOutputsExist()) {
    console.log('[pwa-icons] Source asset missing; reusing existing public PWA icons.')
    process.exit(0)
  }
  console.error(
    '[pwa-icons] No icon source found (expected src/img/gold_dragon_allModelAi.png or public/aihub-dragon.svg) and PWA outputs are missing.',
  )
  process.exit(1)
}

if (process.env.SKIP_PWA_ICON_GENERATION === 'true') {
  if (await allOutputsExist()) {
    console.log('[pwa-icons] SKIP_PWA_ICON_GENERATION=true; outputs present.')
    process.exit(0)
  }
  console.warn('[pwa-icons] SKIP_PWA_ICON_GENERATION=true but outputs missing; continuing generation.')
}

let sharp
try {
  sharp = (await import('sharp')).default
} catch (error) {
  if (await allOutputsExist()) {
    console.warn('[pwa-icons] sharp unavailable; reusing existing public PWA icons.', error.message)
    process.exit(0)
  }
  console.error('[pwa-icons] sharp is required to generate PWA icons:', error.message)
  process.exit(1)
}

await mkdir(outDir, { recursive: true })

const resizeIcon = (size, dest) =>
  sharp(src)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toFile(dest)

await sharp(src)
  .resize(512, 512, { fit: 'contain', background: bg })
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(publicDir, 'gold-dragon.png'))

await resizeIcon(192, path.join(outDir, 'icon-192.png'))
await resizeIcon(512, path.join(outDir, 'icon-512.png'))
await resizeIcon(180, path.join(outDir, 'apple-touch-icon.png'))

await sharp(src)
  .resize(410, 410, { fit: 'contain', background: bg })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: bg })
  .png()
  .toFile(path.join(outDir, 'icon-maskable-512.png'))

console.log(`[pwa-icons] PWA icons written from ${path.basename(src)}`)
