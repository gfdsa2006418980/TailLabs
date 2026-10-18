export const DAY_CYCLE_SECONDS = 120;
export const SKY_STOPS = Object.freeze([
  { at: 0, top: 0xcce6ed, bottom: 0xfff2d1, tint: 0xffffff, stars: 0 },
  { at: 0.28, top: 0xb5dce9, bottom: 0xf9e9c9, tint: 0xffffff, stars: 0 },
  { at: 0.42, top: 0xcf7e83, bottom: 0xffcc81, tint: 0xf2c4a2, stars: 0 },
  { at: 0.53, top: 0x292d53, bottom: 0x9c6a7b, tint: 0x9b98b6, stars: 0.4 },
  { at: 0.66, top: 0x070e20, bottom: 0x1b2a46, tint: 0x7185a3, stars: 1 },
  { at: 0.82, top: 0x030710, bottom: 0x101c32, tint: 0x657b9c, stars: 1 },
  { at: 0.91, top: 0x7d86a5, bottom: 0xefbba3, tint: 0xb4b1b7, stars: 0.3 },
  { at: 1, top: 0xcce6ed, bottom: 0xfff2d1, tint: 0xffffff, stars: 0 },
]);
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
function mixColor(a: number, b: number, t: number): number {
  const r = Math.round((a >> 16) + ((b >> 16) - (a >> 16)) * t);
  const g = Math.round((a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * t);
  const blue = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
  return r << 16 | g << 8 | blue;
}
export function dayNightAt(seconds: number) {
  const phase = ((seconds % DAY_CYCLE_SECONDS + DAY_CYCLE_SECONDS) % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS;
  let index = 0;
  while (index < SKY_STOPS.length - 2 && phase >= SKY_STOPS[index + 1].at) index++;
  const a = SKY_STOPS[index], b = SKY_STOPS[index + 1];
  const progress = clamp((phase - a.at) / (b.at - a.at));
  const blend = progress * progress * (3 - 2 * progress);
  const sunT = phase < 0.5 ? phase / 0.5 : 0;
  const moonT = clamp((phase - 0.47) / 0.49);
  return {
    phase, index, blend,
    label: phase < 0.35 ? '白天' : phase < 0.5 ? '黃昏' : phase < 0.88 ? '月夜' : '黎明',
    tint: mixColor(a.tint, b.tint, blend),
    stars: a.stars + (b.stars - a.stars) * blend,
    sunX: 0.09 + 0.84 * sunT,
    sunY: phase > 0.91 ? 320 - (phase - 0.91) / 0.09 * 68 : 252 - Math.sin(Math.PI * sunT) * 210,
    sunAlpha: phase < 0.5 ? clamp((0.5 - phase) / 0.1) : clamp((phase - 0.91) / 0.09),
    moonX: 0.08 + 0.84 * moonT,
    moonY: 250 - Math.sin(Math.PI * moonT) * 185,
    moonAlpha: clamp((phase - 0.46) / 0.11) * clamp((0.98 - phase) / 0.12),
  };
}
