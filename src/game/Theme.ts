/** TL001 shares Commission's rose, cocoa and blush palette. */
export const THEME = {
  ink: 0x332629,
  muted: 0x78696c,
  accent: 0xbd828a,
  accentDark: 0x855159,
  paper: 0xfaf5f3,
  blush: 0xf5eeec,
  glow: 0xefd9da,
  pale: 0xfff9f8,
} as const;

export const themeCss = (color: number): string => '#' + color.toString(16).padStart(6, '0');

// Phaser's built-in missing texture is green; keep the emergency placeholder on theme too.
export const MISSING_ART = 'data:image/svg+xml;base64,' + btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="1" y="1" width="30" height="30" rx="7" fill="${themeCss(THEME.blush)}" stroke="${themeCss(THEME.accent)}"/><path d="m11 11 10 10m0-10L11 21" stroke="${themeCss(THEME.accentDark)}" stroke-width="2" stroke-linecap="round"/></svg>`,
);

/** Use cached rose artwork while retaining the original WebP and collider geometry. */
export function serpentelaArtFile(file: string): string {
  return 'rose/' + file.replace(/\.webp$/, '.svg');
}
