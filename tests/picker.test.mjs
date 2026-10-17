import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SerpentelaPicker } from '../src/systems/SerpentelaPicker.ts';

const { definitions } = JSON.parse(await readFile(new URL('../public/assets/serpentelas/colliders.json', import.meta.url), 'utf8'));

test('the supplied 15 files have the actual 50/20/5/1 weight counts and total 367', () => {
  const counts = {};
  for (const item of definitions) counts[item.weight] = (counts[item.weight] ?? 0) + 1;
  assert.deepEqual(counts, { 1: 2, 5: 3, 20: 5, 50: 5 });
  assert.equal(definitions.reduce((sum, item) => sum + item.weight, 0), 367);
});

test('weighted interval boundaries select all groups, including both rare definitions', () => {
  const pool = [{ id: 'A', weight: 50 }, { id: 'B', weight: 20 }, { id: 'C', weight: 1 }, { id: 'D', weight: 1 }];
  for (const [sample, expected] of [[0, 'A'], [49 / 72, 'A'], [50 / 72, 'B'], [70 / 72, 'C'], [71 / 72, 'D']]) {
    assert.equal(new SerpentelaPicker(pool, () => sample).next().id, expected);
  }
});

test('a 1000-draw sequence excludes the last two identities and reset clears history', () => {
  let state = 773;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
  const picker = new SerpentelaPicker(definitions, random);
  const history = [];
  for (let i = 0; i < 1000; i++) {
    const selected = picker.next();
    assert.ok(!history.slice(-2).includes(selected.id));
    history.push(selected.id);
  }
  const deterministic = new SerpentelaPicker(definitions, () => 0);
  const first = deterministic.next();
  assert.notEqual(deterministic.next().id, first.id);
  deterministic.reset();
  assert.equal(deterministic.next().id, first.id);
});
