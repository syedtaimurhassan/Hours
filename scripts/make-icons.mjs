// Generates the PWA icon set procedurally (no image tooling required):
//   public/icons/icon-192.png, icon-512.png, maskable-512.png,
//   public/apple-touch-icon.png (180x180)
// Design: white clock face on an emerald rounded square (full-bleed for maskable).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Signed-distance helpers (smooth ~1.5px anti-aliased edges).
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const coverage = (sd) => clamp01(0.5 - sd / 1.5)
const sdRoundRect = (x, y, half, r) => {
  const qx = Math.abs(x) - (half - r)
  const qy = Math.abs(y) - (half - r)
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  )
}
const sdSegment = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax
  const aby = by - ay
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
}

const EMERALD = [5, 150, 105] // emerald-600
const WHITE = [255, 255, 255]

function drawIcon(size, { fullBleed = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4)
  const c = size / 2
  // Maskable icons must fill the whole canvas; the clock shrinks into the
  // 80% safe zone instead.
  const bgHalf = fullBleed ? size / 2 + 2 : size * 0.46
  const bgRadius = fullBleed ? 0 : size * 0.21
  const clockR = fullBleed ? size * 0.32 : size * 0.3
  const ringW = Math.max(2, size * 0.035)
  const handW = Math.max(2, size * 0.03)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      let [r, g, b, a] = [0, 0, 0, 0]
      const bg = coverage(sdRoundRect(dx, dy, bgHalf, bgRadius))
      if (bg > 0) {
        ;[r, g, b] = EMERALD
        a = bg
        // Clock face ring
        const ring = coverage(Math.abs(Math.hypot(dx, dy) - clockR) - ringW)
        // Hands: minute hand up, hour hand to ~16:00 (down-right)
        const minute = coverage(
          sdSegment(dx, dy, 0, 0, 0, -clockR * 0.62) - handW,
        )
        const hour = coverage(
          sdSegment(dx, dy, 0, 0, clockR * 0.42, clockR * 0.18) - handW,
        )
        const dot = coverage(Math.hypot(dx, dy) - handW * 1.4)
        const white = Math.max(ring, minute, hour, dot)
        if (white > 0) {
          r = r + (WHITE[0] - r) * white
          g = g + (WHITE[1] - g) * white
          b = b + (WHITE[2] - b) * white
        }
      }
      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = Math.round(a * 255)
    }
  }
  return encodePng(size, rgba)
}

mkdirSync(join(root, 'public/icons'), { recursive: true })
writeFileSync(join(root, 'public/icons/icon-192.png'), drawIcon(192))
writeFileSync(join(root, 'public/icons/icon-512.png'), drawIcon(512))
writeFileSync(
  join(root, 'public/icons/maskable-512.png'),
  drawIcon(512, { fullBleed: true }),
)
// iOS composites apple-touch-icon on an opaque tile; full-bleed avoids a
// black-cornered icon on the home screen.
writeFileSync(
  join(root, 'public/apple-touch-icon.png'),
  drawIcon(180, { fullBleed: true }),
)
console.log('icons written')
