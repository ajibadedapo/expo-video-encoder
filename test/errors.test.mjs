import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpoVideoEncoderError, isExpoVideoEncoderError } from '../build/errors.js';
import { assertEncodeVideoOptions, assertMixAudioOptions } from '../build/validation.js';
import { frameFileName, frameFilePath, toNativePath } from '../build/paths.js';

const encode = (overrides = {}) => ({
  framesDir: '/tmp/frames',
  frameCount: 30,
  fps: 30,
  width: 1280,
  height: 720,
  outputPath: '/tmp/out.mp4',
  ...overrides,
});

const track = (overrides = {}) => ({
  uri: '/tmp/audio.m4a',
  startMs: 0,
  durationMs: 1000,
  volume: 0.5,
  ...overrides,
});

const mix = (overrides = {}) => ({
  videoPath: '/tmp/video.mp4',
  outputPath: '/tmp/mixed.mp4',
  totalDurationMs: 4000,
  audioTracks: [track()],
  ...overrides,
});

function capture(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('expected a throw');
}

test('ExpoVideoEncoderError is a real Error with a name, code, and field', () => {
  const error = new ExpoVideoEncoderError('INVALID_OPTIONS', 'expo-video-encoder: width is bad.', 'width');
  assert.ok(error instanceof Error);
  assert.ok(error instanceof ExpoVideoEncoderError);
  assert.equal(error.name, 'ExpoVideoEncoderError');
  assert.equal(error.code, 'INVALID_OPTIONS');
  assert.equal(error.field, 'width');
  assert.equal(error.message, 'expo-video-encoder: width is bad.');
  assert.equal(new ExpoVideoEncoderError('UNSUPPORTED_PLATFORM', 'x').field, undefined);
});

test('isExpoVideoEncoderError narrows by class and optional code', () => {
  const error = new ExpoVideoEncoderError('INVALID_ARGUMENT', 'x');
  assert.equal(isExpoVideoEncoderError(error), true);
  assert.equal(isExpoVideoEncoderError(error, 'INVALID_ARGUMENT'), true);
  assert.equal(isExpoVideoEncoderError(error, 'INVALID_OPTIONS'), false);
  const lookalike = Object.assign(new Error('x'), { code: 'INVALID_ARGUMENT' });
  for (const value of [lookalike, null, undefined, 'INVALID_ARGUMENT', { code: 'INVALID_OPTIONS' }]) {
    assert.equal(isExpoVideoEncoderError(value), false, String(value));
  }
});

test('encode option failures carry INVALID_OPTIONS and the offending field', () => {
  const cases = [
    [encode({ framesDir: 'file:///tmp/frames' }), 'framesDir'],
    [encode({ framesDir: '/tmp/frames/frame_000000.jpg' }), 'framesDir'],
    [encode({ frameCount: 0 }), 'frameCount'],
    [encode({ frameCount: 216001, fps: 60 }), 'frameCount'],
    [encode({ fps: Number.NaN }), 'fps'],
    [encode({ fps: 241 }), 'fps'],
    [encode({ width: 1281 }), 'width'],
    [encode({ height: 8194 }), 'height'],
    [encode({ outputPath: '/tmp/out.mov' }), 'outputPath'],
    [encode({ outputPath: '/tmp/frames/out.mp4' }), 'outputPath'],
  ];
  for (const [options, field] of cases) {
    const error = capture(() => assertEncodeVideoOptions(options));
    assert.ok(isExpoVideoEncoderError(error, 'INVALID_OPTIONS'), field);
    assert.equal(error.field, field);
  }
  const missing = capture(() => assertEncodeVideoOptions(null));
  assert.equal(missing.code, 'INVALID_OPTIONS');
  assert.equal(missing.field, undefined);
});

test('fps below 1 is rejected before native timescale math', () => {
  for (const fps of [0.5, 0.999]) {
    const error = capture(() => assertEncodeVideoOptions(encode({ fps })));
    assert.equal(error.code, 'INVALID_OPTIONS');
    assert.equal(error.field, 'fps');
    assert.match(error.message, /fps must be 1 or greater/);
  }
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ fps: 1 })));
});

test('mix option failures report indexed track fields', () => {
  const cases = [
    [mix({ videoPath: '/tmp/video.mov' }), 'videoPath'],
    [mix({ outputPath: '/tmp/video.mp4' }), 'outputPath'],
    [mix({ totalDurationMs: 3600001 }), 'totalDurationMs'],
    [mix({ audioTracks: [] }), 'audioTracks'],
    [mix({ audioTracks: [track(), null] }), 'audioTracks[1]'],
    [mix({ audioTracks: [track({ uri: '/tmp/a.ogg' })] }), 'audioTracks[0].uri'],
    [mix({ audioTracks: [track({ startMs: 0.5 })] }), 'audioTracks[0].startMs'],
    [mix({ audioTracks: [track({ durationMs: -1 })] }), 'audioTracks[0].durationMs'],
    [mix({ audioTracks: [track({ volume: 1.5 })] }), 'audioTracks[0].volume'],
    [mix({ audioTracks: [track({ startMs: 3500 })] }), 'audioTracks[0]'],
    [mix({ audioTracks: [track(), track({ uri: '/tmp/AUDIO.m4a', startMs: 2000 })] }), 'audioTracks[1].uri'],
    [mix({ audioTracks: [track({ uri: '/tmp/b.m4a', startMs: 500 }), track()] }), 'audioTracks[0]'],
  ];
  for (const [options, field] of cases) {
    const error = capture(() => assertMixAudioOptions(options));
    assert.ok(isExpoVideoEncoderError(error, 'INVALID_OPTIONS'), field);
    assert.equal(error.field, field);
  }
});

test('path helper failures carry INVALID_ARGUMENT', () => {
  for (const fn of [
    () => frameFileName(-1),
    () => frameFilePath('/tmp/frames', 1.5),
    () => toNativePath(''),
    () => toNativePath('file:///tmp/%E0%A4%A.mp4'),
  ]) {
    const error = capture(fn);
    assert.ok(isExpoVideoEncoderError(error, 'INVALID_ARGUMENT'));
    assert.equal(error.field, undefined);
  }
});
