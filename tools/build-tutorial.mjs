import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../public/assets/', import.meta.url);
const art = async (id) => `data:image/webp;base64,${(await readFile(new URL(`serpentelas/${id}.webp`, root))).toString('base64')}`;
const [a, b, c] = await Promise.all(['serpentela-w50-04', 'serpentela-w20-01', 'serpentela-w50-03'].map(art));
const sprite = (src, x, y, size = 64, opacity = 1) => `<image href="${src}" x="${x}" y="${y}" width="${size}" height="${size}" opacity="${opacity}"/>`;
const wrap = (content) => `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="160" viewBox="0 0 260 160"><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0 0L5 3L0 6" fill="none" stroke="#c47e4e"/></marker></defs><rect width="260" height="160" fill="#f0f0e5"/>${content}</svg>`;
const floor = '<ellipse cx="130" cy="141" rx="93" ry="14" fill="none" stroke="#9eaf95"/><rect x="48" y="133" width="164" height="6" rx="3" fill="#345442"/>';
const files = {
  move: `${sprite(a, 36, 49, 65, .22)}${sprite(a, 100, 49)}<path d="M98 117H43M166 117H213" stroke="#c47e4e" stroke-width="2" marker-end="url(#arrow)"/><rect x="198" y="12" width="48" height="48" rx="5" fill="#faf9f2" stroke="#b3bea7"/>${sprite(b, 202, 16, 40)}<path d="M128 20V36" stroke="#a1ad95" stroke-dasharray="3 4"/>`,
  stick: `${floor}${sprite(b, 83, 84, 58)}${sprite(c, 122, 88, 58)}${sprite(a, 100, 23, 62)}<path d="M130 82V96" stroke="#c47e4e" stroke-width="2" marker-end="url(#arrow)"/><circle cx="178" cy="52" r="18" fill="#faf9f2" stroke="#8a9f7a"/><path d="M178 39V52L185 57" fill="none" stroke="#345442" stroke-width="2"/><circle cx="178" cy="52" r="2" fill="#345442"/>`,
  tower: `${floor}${sprite(b, 80, 92, 50)}${sprite(c, 125, 92, 50)}${sprite(a, 102, 60, 50)}${sprite(b, 100, 25, 50)}<path d="M48 104V38" stroke="#c47e4e" stroke-width="2" marker-end="url(#arrow)"/><rect x="70" y="12" width="110" height="104" fill="none" rx="7" stroke="#a7b69b" stroke-dasharray="4 4"/>${sprite(c, 207, 100, 42, .6)}<path d="M222 145V153" stroke="#c47e4e" marker-end="url(#arrow)"/><path d="M196 94L203 101M203 94L196 101" stroke="#c47e4e" stroke-width="2"/>`,
};
await mkdir(new URL('tutorial/', root), { recursive: true });
for (const [name, content] of Object.entries(files)) await writeFile(new URL(`tutorial/${name}.svg`, root), wrap(content));
