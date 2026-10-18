import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerMusic } from '../src/tl002/RunnerMusic.ts';

function fakeTrack() {
  return {
    loop: false, muted: true, volume: 0, paused: true, playCount: 0,
    play() { this.paused = false; this.playCount++; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
}

test('TL002 BGM stays silent until the countdown ends, then loops once at the selected volume', () => {
  const track = fakeTrack(), music = new RunnerMusic(track, true, 0.175);
  assert.equal(track.loop, true); assert.equal(track.volume, 0.175); assert.equal(track.playCount, 0);
  music.setEnabled(true); assert.equal(track.playCount, 0);
  music.afterCountdown();
  assert.equal(track.paused, false); assert.equal(track.playCount, 1);
  music.afterCountdown(); assert.equal(track.playCount, 1);
  music.destroy(); assert.equal(track.paused, true);
});

test('TL002 BGM waits while muted, then stays playing through mute, pause, menu and later countdowns', () => {
  const track = fakeTrack(), music = new RunnerMusic(track, false, 0.175);
  music.afterCountdown(); assert.equal(track.playCount, 0);
  music.setEnabled(true); assert.equal(track.playCount, 1);
  music.setEnabled(false); assert.equal(track.muted, true); assert.equal(track.paused, false);
  music.setEnabled(true); assert.equal(track.muted, false); assert.equal(track.paused, false);
  music.afterCountdown(); assert.equal(track.paused, false); assert.equal(track.playCount, 1);
  music.afterCountdown(); assert.equal(track.playCount, 1);
  music.destroy(); assert.equal(track.paused, true);
});

test('TL002 music volume stays adjustable and cannot exceed the new half-volume ceiling', () => {
  const track = fakeTrack(), music = new RunnerMusic(track, true, 0.175);
  music.setVolume(1.3); assert.equal(track.volume, 0.5);
  music.setVolume(-1); assert.equal(track.volume, 0);
  music.setVolume(0.175); music.afterCountdown(); assert.equal(track.volume, 0.175);
});
