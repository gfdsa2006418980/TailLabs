import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardSystem, compareEntries, playerName, recordId } from '../src/systems/LeaderboardSystem.ts';
const storage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
const entry = (id, placedCount = 1, extra = {}) => ({ id, playerName: '煉金術士', target: 500, placedCount, droppedCount: 500, elapsedMilliseconds: 10000, maxHeight: 100, baseScore: placedCount * 100, heightBonus: 200, speedBonus: 0, score: placedCount * 100 + 200, completed: false, createdAt: '2026-10-17T05:00:00.000Z', ...extra });

test('completed rounds outrank failures, then score and completion time break ties', () => {
  const fail = entry('fail', 499, { score: 999999 });
  const slow = entry('slow', 500, { completed: true, score: 60000, elapsedMilliseconds: 20000 });
  const fast = entry('fast', 500, { completed: true, score: 60000, elapsedMilliseconds: 10000 });
  assert.deepEqual([fail, slow, fast].sort(compareEntries).map((e) => e.id), ['fast', 'slow', 'fail']);
});
test('failure ranking prioritizes placed count, score and then survival time', () => {
  assert.ok(compareEntries(entry('a', 100), entry('b', 99, { score: 999999 })) < 0);
  assert.ok(compareEntries(entry('a', 100, { elapsedMilliseconds: 20000 }), entry('b', 100)) < 0);
});
test('top one hundred persist across reloads and name updates do not duplicate a result', () => {
  const saved = storage(); const board = new LeaderboardSystem(saved);
  for (let n = 0; n < 105; n++) board.save(entry(`round-${n}`, n));
  assert.equal(board.top(500).length, 100);
  const best = { ...board.top(500)[0], playerName: '新的名字' };
  board.save(best); board.save(best);
  const reload = new LeaderboardSystem(saved);
  assert.equal(reload.top(500).length, 100); assert.equal(reload.top(500)[0].playerName, '新的名字');
  assert.equal(reload.top(500).filter((e) => e.id === best.id).length, 1);
});
test('practice scores are kept separate from the 500-piece challenge', () => {
  const board = new LeaderboardSystem(storage());
  board.save(entry('main', 2));
  board.save(entry('practice', 10, { target: 10, droppedCount: 10, completed: true }));
  assert.deepEqual(board.top(500).map((e) => e.id), ['main']);
  assert.deepEqual(board.top(10).map((e) => e.id), ['practice']);
});
test('several open tabs merge new rounds and read updated names instead of overwriting each other', () => {
  const saved = storage();
  const first = new LeaderboardSystem(saved), second = new LeaderboardSystem(saved);
  first.save(entry('first', 2)); second.save(entry('second', 3));
  assert.equal(first.top(500).length, 2);
  second.save(entry('first', 2, { playerName: '更新名字' }));
  assert.equal(first.top(500).find((e) => e.id === 'first').playerName, '更新名字');
});
test('corrupt data, invalid scores and unavailable storage do not interrupt gameplay', () => {
  const corrupt = new LeaderboardSystem({ getItem() { return '{bad'; }, setItem() { throw Error('blocked'); } });
  assert.deepEqual(corrupt.top(500), []);
  assert.equal(corrupt.save(entry('negative', -1)), undefined);
  assert.equal(corrupt.save(entry('overflow', 501)), undefined);
  assert.equal(corrupt.save(entry('nan', 1, { score: NaN })), undefined);
  assert.equal(corrupt.save(entry('valid')), 1); assert.equal(corrupt.persistent, false);
  const unavailable = new LeaderboardSystem(); unavailable.save(entry('session'));
  assert.equal(unavailable.persistent, false); assert.equal(unavailable.top(500).length, 1);
});
test('names are trimmed, Unicode-safe, limited to twelve characters and have an anonymous fallback', () => {
  assert.equal(playerName('   '), '匿名飼主'); assert.equal(playerName('  小蛇貂  '), '小蛇貂');
  assert.equal(Array.from(playerName('🐾'.repeat(20))).length, 12);
});
test('HTTP phone previews can save a local result without crypto.randomUUID', () => {
  const board = new LeaderboardSystem(storage());
  const id = recordId(); assert.ok(id.startsWith('local-'));
  assert.equal(board.save(entry(id)), 1);
  assert.equal(recordId(() => 'secure-id'), 'secure-id');
});
