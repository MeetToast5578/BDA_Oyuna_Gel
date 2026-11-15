// Run from the repository root: node scripts/generate-icons.mjs
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = new URL('../public/icons/oyunagel.svg', import.meta.url)
for (const [size, target] of [
  [180, '../app/apple-icon.png'],
  [192, '../public/icons/icon-192.png'],
  [512, '../public/icons/icon-512.png'],
]) {
  await sharp(source.pathname).resize(size, size).png().toFile(new URL(target, import.meta.url).pathname)
}

// ICO supports PNG frames, retaining sharp artwork at each browser-tab size.
const sizes = [16, 32, 48]
const frames = await Promise.all(sizes.map((size) => sharp(source.pathname).resize(size, size).png().toBuffer()))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
frames.forEach((frame, index) => {
  const entry = 6 + index * 16
  header[entry] = sizes[index]
  header[entry + 1] = sizes[index]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})
await writeFile(new URL('../app/favicon.ico', import.meta.url), Buffer.concat([header, ...frames]))
