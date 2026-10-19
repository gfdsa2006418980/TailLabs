import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../public/assets/', import.meta.url);
const art = async (id) => {
  return `data:image/svg+xml;base64,${(await readFile(new URL(`serpentelas/rose/${id}.svg`, root))).toString('base64')}`;
};
const [a, b, c] = await Promise.all(['serpentela-w50-04', 'serpentela-w20-01', 'serpentela-w50-03'].map(art));
const magic = await readFile(new URL('magic-circle.svg', root), 'utf8');
const magicData = `data:image/svg+xml;base64,${Buffer.from(magic).toString('base64')}`;
const sprite = (src, x, y, size = 48, opacity = 1) => `<image href="${src}" x="${x}" y="${y}" width="${size}" height="${size}" opacity="${opacity}"/>`;
const floor = `<image href="${magicData}" x="0" y="96" width="260" height="86.67"/>`;
const wrap = (content) => `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="180" viewBox="0 0 260 180"><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0 0L5 3L0 6" fill="none" stroke="#855159"/></marker></defs>${content}</svg>`;
const files = {
  move: `${sprite(a, 43, 54, 48, .2)}${sprite(a, 106, 54)}${sprite(a, 169, 54, 48, .2)}<path d="M103 123H47M157 123H213" stroke="#855159" stroke-width="1.6" marker-end="url(#arrow)"/><path d="M130 26v16" stroke="#bd828a" stroke-dasharray="2 5"/>`,
  stick: `${floor}${sprite(b, 88, 106, 43.5)}${sprite(c, 130, 108, 43.5)}${sprite(a, 106, 37, 48)}<path d="M130 88v18" stroke="#855159" stroke-width="1.6" marker-end="url(#arrow)"/>`,
  tower: `${floor}${sprite(b, 83, 106, 43.5)}${sprite(c, 126, 106, 43.5)}${sprite(a, 106, 75, 43.5)}${sprite(c, 218, 125, 31.5)}<path d="M234 157v16" stroke="#855159" stroke-width="1.6" marker-end="url(#arrow)"/><path d="M230 105v9M230 118v1" stroke="#855159" stroke-width="2.6" stroke-linecap="round"/>`,
};
await mkdir(new URL('tutorial/', root), { recursive: true });
for (const [name, content] of Object.entries(files)) await writeFile(new URL(`tutorial/${name}.svg`, root), wrap(content));
