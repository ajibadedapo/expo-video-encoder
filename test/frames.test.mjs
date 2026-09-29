import test from 'node:test';
import assert from 'node:assert/strict';
import { findMissingFrames } from '../build/paths.js';
import { ExpoVideoEncoderError } from '../build/errors.js';

test('findMissingFrames returns an empty list when every frame exists', async () => {
  const checked = [];
  const missing = await findMissingFrames('/tmp/frames', 3, (path, index) => {
    checked.push([path, index]);
    return true;
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(checked, [
    ['/tmp/frames/frame_000000.jpg', 0],
    ['/tmp/frames/frame_000001.jpg', 1],
    ['/tmp/frames/frame_000002.jpg', 2],
  ]);
});

test('findMissingFrames reports missing indexes in ascending order', async () => {
  const present = new Set([0, 2, 3, 5]);
  const missing = await findMissingFrames('/tmp/frames', 7, (_path, index) => present.has(index));
  assert.deepEqual(missing, [1, 4, 6]);
});

test('findMissingFrames awaits async checks and keeps order when they settle out of order', async () => {
  const missing = await findMissingFrames('/tmp/frames', 40, async (_path, index) => {
    await new Promise((resolve) => setTimeout(resolve, (40 - index) % 7));
    return index % 10 !== 9;
  });
  assert.deepEqual(missing, [9, 19, 29, 39]);
});

test('findMissingFrames converts a file:// frames directory to native paths', async () => {
  const paths = [];
  await findMissingFrames('file:///var/mobile/My%20Clips/frames/', 1, (path) => {
    paths.push(path);
    return true;
  });
  assert.deepEqual(paths, ['/var/mobile/My Clips/frames/frame_000000.jpg']);
});

test('findMissingFrames rejects a check that does not return a boolean', async () => {
  await assert.rejects(
    findMissingFrames('/tmp/frames', 2, () => ({ exists: false })),
    (error) =>
      error instanceof ExpoVideoEncoderError &&
      error.code === 'INVALID_ARGUMENT' &&
      /frame 0/.test(error.message) &&
      /boolean/.test(error.message),
  );
});

test('findMissingFrames rejects frame counts the naming scheme cannot represent', async () => {
  for (const bad of [0, -1, 1.5, 1_000_001, Number.NaN, '3']) {
    await assert.rejects(
      findMissingFrames('/tmp/frames', bad, () => true),
      (error) => error instanceof ExpoVideoEncoderError && error.code === 'INVALID_ARGUMENT' && /frameCount/.test(error.message),
    );
  }
});

test('findMissingFrames accepts the largest representable frame count', async () => {
  const stop = new Error('validation passed');
  const paths = [];
  await assert.rejects(
    findMissingFrames('/tmp/frames', 1_000_000, (path) => {
      paths.push(path);
      throw stop;
    }),
    stop,
  );
  assert.equal(paths[0], '/tmp/frames/frame_000000.jpg');
});

test('findMissingFrames rejects a missing check function and a bad directory', async () => {
  await assert.rejects(findMissingFrames('/tmp/frames', 1), (error) => error instanceof ExpoVideoEncoderError && error.code === 'INVALID_ARGUMENT');
  await assert.rejects(findMissingFrames('', 1, () => true), (error) => error instanceof ExpoVideoEncoderError && error.code === 'INVALID_ARGUMENT');
});

test('findMissingFrames passes through errors thrown by the check', async () => {
  const failure = new Error('disk unavailable');
  await assert.rejects(findMissingFrames('/tmp/frames', 3, () => { throw failure; }), failure);
});
