import { cpSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'dist/Commission');
cpSync(resolve(root, 'commission'), destination, { recursive: true });
// Pages publishes both the game and the commission page from the same artifact.
writeFileSync(resolve(root, 'dist/.nojekyll'), '');
console.log('Commission page → dist/Commission/');
