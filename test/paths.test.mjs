import test from 'node:test';
import assert from 'node:assert/strict';
import { frameFileName, frameFilePath, toNativePath } from '../build/paths.js';

test('frameFileName zero-pads to the six digits the native encoder reads', () => {
  assert.equal(frameFileName(0), 'frame_000000.jpg');
  assert.equal(frameFileName(42), 'frame_000042.jpg');
  assert.equal(frameFileName(999999), 'frame_999999.jpg');
});

test('frameFileName rejects indexes the naming scheme cannot represent', () => {
  for (const bad of [-1, 1.5, 1_000_000, Number.NaN]) {
    assert.throws(() => frameFileName(bad), /frame index/);
  }
});

test('toNativePath strips file:// and decodes percent-encoded characters', () => {
  assert.equal(
    toNativePath('file:///var/mobile/Containers/Data/Application/ABC/Documents/My%20Clips/out.mp4'),
    '/var/mobile/Containers/Data/Application/ABC/Documents/My Clips/out.mp4',
  );
  assert.equal(toNativePath('file://localhost/tmp/out.mp4'), '/tmp/out.mp4');
  assert.equal(toNativePath('FILE:///tmp/a.mp4'), '/tmp/a.mp4');
});

test('toNativePath leaves plain native paths alone', () => {
  assert.equal(toNativePath('/data/user/0/app/cache/frames'), '/data/user/0/app/cache/frames');
  assert.equal(toNativePath('  /tmp/out.mp4  '), '/tmp/out.mp4');
});

test('toNativePath rejects empty input and broken encoding', () => {
  assert.throws(() => toNativePath(''), /non-empty/);
  assert.throws(() => toNativePath('file:///tmp/%E0%A4%A.mp4'), /percent-encoding/);
});

test('frameFilePath joins a directory URI and a frame name', () => {
  assert.equal(frameFilePath('file:///tmp/frames/', 7), '/tmp/frames/frame_000007.jpg');
  assert.equal(frameFilePath('/tmp/frames', 0), '/tmp/frames/frame_000000.jpg');
});
