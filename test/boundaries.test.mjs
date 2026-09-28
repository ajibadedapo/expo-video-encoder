import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEncodeVideoOptions, assertMixAudioOptions } from '../build/validation.js';
import { frameFilePath, toNativePath } from '../build/paths.js';

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

test('encode limits are inclusive at their documented maximums', () => {
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ width: 8192, height: 8192 })));
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ fps: 240 })));
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ frameCount: 216000, fps: 60 })));
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ fps: 29.97 })));
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ width: 2, height: 2, frameCount: 1 })));
});

test('encode rejects non-numeric and non-finite values', () => {
  for (const fps of [0, -30, Number.NaN, Number.POSITIVE_INFINITY, '30']) {
    assert.throws(() => assertEncodeVideoOptions(encode({ fps })), /fps must be/, String(fps));
  }
  for (const frameCount of [1.5, -1, Number.NaN, '30']) {
    assert.throws(() => assertEncodeVideoOptions(encode({ frameCount })), /frameCount must be/, String(frameCount));
  }
  assert.throws(() => assertEncodeVideoOptions(encode({ width: 0 })), /width must be a positive integer/);
});

test('encode rejects missing options and non-string paths', () => {
  assert.throws(() => assertEncodeVideoOptions(undefined), /options must be an object/);
  assert.throws(() => assertEncodeVideoOptions(encode({ framesDir: 42 })), /framesDir must be a non-empty path string/);
  assert.throws(() => assertEncodeVideoOptions(encode({ outputPath: '   ' })), /outputPath must be a non-empty path string/);
  assert.throws(() => assertEncodeVideoOptions(encode({ framesDir: '/tmp/frames/frame_000000.JPEG' })), /framesDir must point to a directory/);
});

test('an output beside framesDir with a shared prefix is allowed', () => {
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ framesDir: '/tmp/frames', outputPath: '/tmp/frames-out.mp4' })));
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ outputPath: '/tmp/OUT.MP4' })));
});

test('mix audio accepts boundary values', () => {
  assert.doesNotThrow(() => assertMixAudioOptions(mix({ audioTracks: [track({ volume: 0 })] })));
  assert.doesNotThrow(() => assertMixAudioOptions(mix({ audioTracks: [track({ volume: 1 })] })));
  assert.doesNotThrow(() => assertMixAudioOptions(mix({ totalDurationMs: 3600000, audioTracks: [track({ durationMs: 3600000 })] })));
  assert.doesNotThrow(() => assertMixAudioOptions(mix({ totalDurationMs: 1000, audioTracks: [track({ durationMs: 1000 })] })));
  for (const extension of ['aac', 'caf', 'm4a', 'mp3', 'wav', 'M4A']) {
    assert.doesNotThrow(() => assertMixAudioOptions(mix({ audioTracks: [track({ uri: `/tmp/a.${extension}` })] })), extension);
  }
  assert.doesNotThrow(() => assertMixAudioOptions(mix({
    audioTracks: Array.from({ length: 16 }, (_, index) => track({ uri: `/tmp/a-${index}.m4a`, startMs: index * 250, durationMs: 250 })),
  })));
});

test('mix audio allows back-to-back tracks and checks overlap regardless of input order', () => {
  assert.doesNotThrow(() => assertMixAudioOptions(mix({
    audioTracks: [track({ uri: '/tmp/b.m4a', startMs: 1000 }), track({ uri: '/tmp/a.m4a', startMs: 0 })],
  })));
  assert.throws(() => assertMixAudioOptions(mix({
    audioTracks: [track({ uri: '/tmp/b.m4a', startMs: 1500 }), track({ uri: '/tmp/a.m4a', startMs: 1000 })],
  })), /audioTracks\[0\] must not overlap audioTracks\[1\]/);
});

test('mix audio rejects malformed tracks and durations', () => {
  assert.throws(() => assertMixAudioOptions(null), /mixAudio options must be an object/);
  assert.throws(() => assertMixAudioOptions(mix({ audioTracks: 'track' })), /at least one track/);
  assert.throws(() => assertMixAudioOptions(mix({ audioTracks: [null] })), /audioTracks\[0\] must be an object/);
  assert.throws(() => assertMixAudioOptions(mix({ audioTracks: [track({ startMs: -1 })] })), /startMs must be 0 or greater/);
  assert.throws(() => assertMixAudioOptions(mix({ audioTracks: [track({ durationMs: 0 })] })), /durationMs must be a positive integer/);
  assert.throws(() => assertMixAudioOptions(mix({ audioTracks: [track({ volume: -0.1 })] })), /volume must be between 0 and 1/);
  assert.throws(() => assertMixAudioOptions(mix({ audioTracks: [track({ volume: Number.NaN })] })), /volume must be a finite number/);
  assert.throws(() => assertMixAudioOptions(mix({ totalDurationMs: 0 })), /totalDurationMs must be a positive integer/);
  assert.throws(() => assertMixAudioOptions(mix({ videoPath: '/tmp/video.mov' })), /videoPath must end with \.mp4/);
});

test('path helpers handle repeated slashes and reject non-strings', () => {
  assert.equal(frameFilePath('/tmp/frames///', 1), '/tmp/frames/frame_000001.jpg');
  assert.equal(toNativePath('file:///tmp/%23hash%20dir/a.mp4'), '/tmp/#hash dir/a.mp4');
  assert.throws(() => toNativePath(undefined), /non-empty/);
  assert.throws(() => toNativePath('   '), /non-empty/);
  assert.throws(() => frameFilePath('/tmp/frames', -1), /frame index/);
});

test('toNativePath output passes native path validation', () => {
  const framesDir = toNativePath('file:///var/mobile/Documents/My%20Frames/');
  const outputPath = toNativePath('file:///var/mobile/Documents/out.mp4');
  assert.doesNotThrow(() => assertEncodeVideoOptions(encode({ framesDir, outputPath })));
});
