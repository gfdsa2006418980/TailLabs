import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRequiredAssets } from '../src/systems/AssetReadiness.ts';

const assets = [
  { key: 'snake-a', url: '/a.webp', type: 'image' },
  { key: 'snake-b', url: '/b.webp', type: 'image' },
  { key: 'magic-circle', url: '/circle.svg', type: 'svg' },
];
const options = () => ({ signal: new AbortController().signal, retryDelays: [0, 0] });

test('a completed loader with missing textures retries only the missing artwork', async () => {
  const cached = new Set(['snake-a']);
  const requests = [];
  const remaining = await loadRequiredAssets(assets, {
    exists: (key) => cached.has(key),
    async load(pending, attempt) {
      requests.push(pending.map((asset) => asset.key));
      for (const asset of pending) if (attempt > 1 || asset.key === 'snake-b') cached.add(asset.key);
    },
  }, options());
  assert.deepEqual(remaining, []);
  assert.deepEqual(requests, [['snake-b', 'magic-circle'], ['magic-circle']]);
});

test('persistent image failures stop after three attempts and can recover without a page reload', async () => {
  const cached = new Set();
  let online = false;
  let attempts = 0;
  const loader = {
    exists: (key) => cached.has(key),
    async load(pending) { attempts++; if (online) for (const asset of pending) cached.add(asset.key); },
  };
  assert.deepEqual(await loadRequiredAssets(assets, loader, options()), assets);
  assert.equal(attempts, 3);
  online = true;
  assert.deepEqual(await loadRequiredAssets(assets, loader, options()), []);
  assert.equal(attempts, 4);
});

test('fully cached artwork needs no network request', async () => {
  assert.deepEqual(await loadRequiredAssets(assets, {
    exists: () => true,
    load: () => assert.fail('Cached assets should not be requested again'),
  }, options()), []);
});

test('leaving the loading scene cancels pending retries', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const pending = loadRequiredAssets(assets, {
    exists: () => false,
    async load() { attempts++; },
  }, { signal: controller.signal, retryDelays: [1000, 1000] });
  setImmediate(() => controller.abort());
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(attempts, 1);
});
