import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import decomp from 'phaser/src/physics/matter-js/poly-decomp/index.js';
import Common from 'phaser/src/physics/matter-js/lib/core/Common.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';

Common.setDecomp(decomp);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const definitions = JSON.parse(await readFile(path.join(root, 'work/traced-colliders.json'), 'utf8'));
for (const definition of definitions) {
  const body = Bodies.fromVertices(0, 0, definition.outline.map((p) => ({ ...p })), {}, true, 0, 0);
  const original = definition.outline;
  const sum = original.reduce((acc, a, i) => {
    const b = original[(i + 1) % original.length];
    const cross = a.x * b.y - b.x * a.y;
    acc.x += (a.x + b.x) * cross;
    acc.y += (a.y + b.y) * cross;
    return acc;
  }, { x: 0, y: 0 });
  definition.center = { x: sum.x / (6 * definition.area), y: sum.y / (6 * definition.area) };
  definition.bounds = {
    minX: Math.min(...original.map((p) => p.x)), minY: Math.min(...original.map((p) => p.y)),
    maxX: Math.max(...original.map((p) => p.x)), maxY: Math.max(...original.map((p) => p.y)),
  };
  definition.parts = (body.parts.length > 1 ? body.parts.slice(1) : body.parts).map((part) =>
    part.vertices.map((p) => ({ x: Number((p.x + definition.center.x).toFixed(5)), y: Number((p.y + definition.center.y).toFixed(5)) })));
  const decomposedArea = (body.parts.length > 1 ? body.parts.slice(1) : body.parts).reduce((total, part) => total + part.area, 0);
  if (Math.abs(decomposedArea - definition.area) > 0.01) throw new Error(`Lost polygon area: ${definition.name}`);
}
const manifest = { version: 1, alphaThreshold: 128, displayScale: 0.75, definitions };
const json = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(path.join(root, 'public/assets/serpentelas/colliders.json'), json);
await writeFile(path.join(root, 'src/data/serpentelas.generated.json'), json);

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const points = (polygon) => polygon.map((p) => `${p.x},${p.y}`).join(' ');
const tiles = await Promise.all(definitions.map(async (definition, index) => {
  const bytes = await readFile(path.join(root, 'public/assets/serpentelas', definition.file));
  const x = 24 + (index % 5) * 204;
  const y = 90 + Math.floor(index / 5) * 218;
  return `<g transform="translate(${x} ${y})"><rect width="188" height="202" rx="12" fill="#fffef8" stroke="#d8ddcf"/><g transform="translate(22 12) scale(1.5)"><image width="96" height="96" href="data:image/webp;base64,${bytes.toString('base64')}"/>${definition.parts.map((part) => `<polygon points="${points(part)}" fill="#63b39b" fill-opacity=".08" stroke="#63b39b" stroke-width=".35"/>`).join('')}<polygon points="${points(definition.outline)}" fill="none" stroke="#d96c36" stroke-width=".9"/></g><text x="94" y="174" text-anchor="middle" fill="#284c3c" font-size="13">${escape(definition.name)}</text><text x="94" y="191" text-anchor="middle" fill="#7a8579" font-size="10">${definition.outline.length} 節點 · ${definition.parts.length} 凸形分塊</text></g>`;
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1052" height="770" viewBox="0 0 1052 770"><rect width="1052" height="770" fill="#f4f2e9"/><g font-family="Segoe UI,Microsoft JhengHei,sans-serif"><text x="24" y="38" fill="#284c3c" font-size="24" font-weight="600">TL001 · 15 種蛇貂碰撞輪廓</text><text x="24" y="64" fill="#7a8579" font-size="13">橘線：實際外框　綠線：凸形分塊　透明度門檻 128 / 255　原始 WebP 完整保留</text>${tiles.join('')}<text x="24" y="758" fill="#7a8579" font-size="11">尾巴與四肢的凹處保留；外框由原圖透明度描出，未重新生成或裁切美術。</text></g></svg>`;
await mkdir(path.join(root, 'docs'), { recursive: true });
await writeFile(path.join(root, 'docs/collider-overview.svg'), svg);
await writeFile(path.join(root, 'public/assets/serpentelas/collider-overview.svg'), svg);
console.log(JSON.stringify(definitions.map((d) => ({ name: d.name, vertices: d.outline.length, parts: d.parts.length, fitIoU: d.fitIoU })), null, 2));
