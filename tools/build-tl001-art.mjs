import { readFile, writeFile, mkdir } from 'node:fs/promises';

// SVG filters retain the original silhouette and alpha without editing the source WebP.
// Channel maxima remove green, then a very light rose tint keeps the artwork in the UI palette.
const root = new URL('../public/assets/serpentelas/', import.meta.url);
await mkdir(new URL('rose/', root), { recursive: true });
const { definitions } = JSON.parse(await readFile(new URL('colliders.json', root), 'utf8'));
for (const { file } of definitions) {
  const name = file.replace(/\.webp$/, '');
  const art = (await readFile(new URL(name + '.webp', root))).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<defs><filter id="rose" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feComponentTransfer in="SourceGraphic" result="opaque"><feFuncA type="discrete" tableValues="1"/></feComponentTransfer>
<feColorMatrix in="opaque" values="0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 1 0" result="neutral"/>
<feBlend in="opaque" in2="neutral" mode="lighten"/>
<feColorMatrix values=".97 0 0 0 .03 0 .99 0 0 0 .01 0 .99 0 0 0 0 0 1 0"/>
<feComposite in2="SourceGraphic" operator="in"/>
</filter></defs><image width="96" height="96" href="data:image/webp;base64,${art}" filter="url(#rose)"/></svg>`;
  await writeFile(new URL('rose/' + name + '.svg', root), svg);
}
