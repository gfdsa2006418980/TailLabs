import { writeFile } from 'node:fs/promises';

const point = (angle, rx, ry) => [360 + Math.cos(angle) * rx, 120 + Math.sin(angle) * ry].map((n) => Number(n.toFixed(2)));
const triangle = (rotation) => Array.from({ length: 3 }, (_, index) => point(rotation + index * Math.PI * 2 / 3, 232, 61).join(',')).join(' ');
const marks = Array.from({ length: 24 }, (_, index) => {
  const angle = index * Math.PI / 12;
  const [x, y] = point(angle, 297, 78);
  if (index % 3 === 0) return `<path d="M${x} ${y - 5}l5 5-5 5-5-5Z" fill="#855159" opacity=".65"/>`;
  return `<path d="M${x - 3} ${y + 4}v-8l6 5v-5" fill="none" stroke="#bd828a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240" viewBox="0 0 720 240">
<defs><radialGradient id="mist"><stop stop-color="#efd9da" stop-opacity=".26"/><stop offset="1" stop-color="#efd9da" stop-opacity="0"/></radialGradient><linearGradient id="rose" x2="0" y2="1"><stop stop-color="#bd828a"/><stop offset=".55" stop-color="#d6b4b8"/><stop offset="1" stop-color="#855159"/></linearGradient></defs>
<ellipse cx="360" cy="132" rx="352" ry="104" fill="url(#mist)"/>
<ellipse cx="360" cy="120" rx="328" ry="90" fill="#f6e8e8" fill-opacity=".22" stroke="#e1b2b6" stroke-opacity=".13" stroke-width="10"/>
<g fill="none" stroke="url(#rose)"><ellipse cx="360" cy="120" rx="328" ry="90" stroke-width="2"/><ellipse cx="360" cy="120" rx="315" ry="86" stroke-width=".8" stroke-opacity=".65"/><ellipse cx="360" cy="120" rx="280" ry="66" stroke-width="1.8"/><ellipse cx="360" cy="120" rx="269" ry="62" stroke-width=".7" stroke-opacity=".7"/>
<polygon points="${triangle(-Math.PI / 2)}" stroke-width="1.3" stroke-opacity=".6"/><polygon points="${triangle(Math.PI / 2)}" stroke-width="1.3" stroke-opacity=".6"/>
<ellipse cx="360" cy="120" rx="103" ry="28" stroke-width="1.1" stroke-opacity=".65"/><path d="M330 120h60M360 109v22" stroke-width="1" stroke-opacity=".55"/></g>
${marks}<g fill="#855159"><path d="M25 120l7-4 7 4-7 4ZM681 120l7-4 7 4-7 4Z"/><path d="M360 25l4 5-4 5-4-5ZM360 205l4 5-4 5-4-5Z"/></g></svg>`;
await writeFile(new URL('../public/assets/magic-circle.svg', import.meta.url), svg);
