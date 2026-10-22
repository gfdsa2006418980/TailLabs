// Builds TL004 attacker art: resized WebP textures plus collision outlines traced from alpha.
// Source PNGs live in art/tl004/attackers/. Needs ImageMagick (`magick`) on PATH.
// Usage: node tools/build-tl004-art.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'art/tl004/attackers');
const OUT_IMAGES = path.join(ROOT, 'TL004/public/assets/attackers');
const OUT_DATA = path.join(ROOT, 'src/tl004/data/attackers.generated.json');

/** Order = default launch order. */
const ATTACKERS = [
  { id: 'caideng', name: '彩燈', file: 'caideng.png' },
  { id: 'zhusun', name: '竹筍', file: 'zhusun.png' },
  { id: 'poker', name: '撲克', file: 'poker.png' },
  { id: 'jiangpian', name: '薑片', file: 'jiangpian.png' },
  { id: 'youfan3d', name: '3D油飯', file: 'youfan3d.png' },
];

/** On-screen size (px, 1080p safe area) of the art box; matches the 96 px serpentelas. */
const DISPLAY = 100;
/** Texture resolution: 2× display for crisp phones, never upscaled. */
const MAX_TEXTURE = 200;
const ALPHA = 128;

function magick(args, binary = false) {
  return execFileSync('magick', args, { maxBuffer: 64 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' });
}

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const dirIndex = (dx, dy) => DIRS.findIndex(([x, y]) => x === dx && y === dy);

/** Keeps only the largest 8-connected opaque region (drops stray specks). */
function largestRegion(mask, size) {
  const label = new Int32Array(size * size).fill(-1);
  let best = -1, bestCount = 0, next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const stack = [start];
    label[start] = next;
    let count = 0;
    while (stack.length) {
      const i = stack.pop();
      count++;
      const x = i % size, y = (i / size) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const j = ny * size + nx;
        if (mask[j] && label[j] === -1) { label[j] = next; stack.push(j); }
      }
    }
    if (count > bestCount) { bestCount = count; best = next; }
    next++;
  }
  return Uint8Array.from(label, (value) => (value === best ? 1 : 0));
}

/** Moore-neighbour boundary trace (clockwise on screen), pixel centres. */
function traceBoundary(mask, size) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && mask[y * size + x] === 1;
  const startIndex = mask.indexOf(1);
  const sx = startIndex % size, sy = (startIndex / size) | 0;
  const contour = [[sx, sy]];
  let cx = sx, cy = sy, back = 4;
  for (let guard = 0; guard < size * size * 4; guard++) {
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!inside(nx, ny)) continue;
      const p = (d + 7) % 8;
      const bx = cx + DIRS[p][0], by = cy + DIRS[p][1];
      cx = nx; cy = ny;
      back = dirIndex(bx - cx, by - cy);
      moved = true;
      break;
    }
    if (!moved) break;
    if (cx === sx && cy === sy) break;
    contour.push([cx, cy]);
  }
  return contour;
}

function pointLineDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function simplifyOpen(points, epsilon) {
  if (points.length <= 2) return points;
  let index = 0, max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], points[0], points.at(-1));
    if (d > max) { max = d; index = i; }
  }
  if (max <= epsilon) return [points[0], points.at(-1)];
  return [...simplifyOpen(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyOpen(points.slice(index), epsilon)];
}

/** Ramer–Douglas–Peucker on a closed ring, split at the point farthest from the first. */
function simplifyClosed(ring, epsilon) {
  let far = 0, farDistance = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farDistance) { farDistance = d; far = i; }
  }
  const a = simplifyOpen(ring.slice(0, far + 1), epsilon);
  const b = simplifyOpen([...ring.slice(far), ring[0]], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

mkdirSync(OUT_IMAGES, { recursive: true });
mkdirSync(path.dirname(OUT_DATA), { recursive: true });
const definitions = [];
for (const attacker of ATTACKERS) {
  const source = path.join(SOURCE, attacker.file);
  const [width, height] = magick(['identify', '-format', '%w %h', source]).trim().split(' ').map(Number);
  if (width !== height) throw new Error(`${attacker.file}: expected a square image, got ${width}x${height}`);
  const texture = Math.min(width, MAX_TEXTURE);
  const output = path.join(OUT_IMAGES, `${attacker.id}.webp`);
  magick([source, '-resize', `${texture}x${texture}`, '-quality', '92', '-define', 'webp:alpha-quality=100', output]);
  const alpha = magick([source, '-resize', `${texture}x${texture}`, '-alpha', 'extract', '-depth', '8', 'gray:-'], true);
  const mask = largestRegion(Uint8Array.from(alpha, (value) => (value >= ALPHA ? 1 : 0)), texture);
  const ring = traceBoundary(mask, texture);
  let epsilon = texture / 100;
  let simplified = simplifyClosed(ring, epsilon);
  while (simplified.length > 48) { epsilon *= 1.25; simplified = simplifyClosed(ring, epsilon); }
  const scale = DISPLAY / texture;
  // Pixel centres sit half a pixel inside the art edge; push outward by using centre + 0.5.
  const outline = simplified.map(([x, y]) => ({ x: +((x + 0.5) * scale).toFixed(2), y: +((y + 0.5) * scale).toFixed(2) }));
  definitions.push({
    id: attacker.id, name: attacker.name, file: `${attacker.id}.webp`,
    width: DISPLAY, height: DISPLAY, textureSize: texture, textureScale: +scale.toFixed(4),
    area: +polygonArea(outline).toFixed(1), outline,
  });
  console.log(`${attacker.name.padEnd(5)} ${width}px → ${texture}px texture, ${ring.length} edge px → ${outline.length} points, area ${polygonArea(outline).toFixed(0)}`);
}
writeFileSync(OUT_DATA, `${JSON.stringify({ version: 1, display: DISPLAY, alphaThreshold: ALPHA, definitions }, null, 2)}\n`);
console.log(`wrote ${path.relative(ROOT, OUT_DATA)}`);
