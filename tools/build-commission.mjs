import { cpSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'dist/Commission');
cpSync(resolve(root, 'commission'), destination, { recursive: true });
mkdirSync(resolve(destination, 'assets'), { recursive: true });
for (const name of ['w50-01', 'w50-02', 'w50-03', 'w50-04', 'w50-05', 'w20-01', 'w20-03', 'w1-01']) {
  copyFileSync(
    resolve(root, `public/assets/serpentelas/serpentela-${name}.webp`),
    resolve(destination, `assets/serpentela-${name}.webp`),
  );
}
// Pages publishes both the game and the commission page from the same artifact.
writeFileSync(resolve(root, 'dist/.nojekyll'), '');
console.log('Commission page → dist/Commission/');
