import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEncodeVideoOptions, assertMixAudioOptions } from '../build/validation.js';

test('accepts valid encode options', () => {
  assert.doesNotThrow(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames',
    frameCount: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/out.mp4',
  }));
});

test('rejects unsafe encode options before native work', () => {
  assert.throws(() => assertEncodeVideoOptions({
    framesDir: 'file:///tmp/frames',
    frameCount: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/out.mp4',
  }), /framesDir must not include/);

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames',
    frameCount: 0,
    fps: 30,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/out.mp4',
  }), /frameCount must be a positive integer/);

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames',
    frameCount: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/out.mov',
  }), /outputPath must end with \.mp4/);
});

test('accepts valid mix audio options', () => {
  assert.doesNotThrow(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 2000,
    audioTracks: [
      {
        uri: '/tmp/audio.m4a',
        startMs: 0,
        durationMs: 2000,
        volume: 0.75,
      },
    ],
  }));
});

test('rejects unsafe mix audio options before native work', () => {
  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 2000,
    audioTracks: [],
  }), /audioTracks must contain at least one track/);

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 2000,
    audioTracks: [
      {
        uri: '/tmp/audio.m4a',
        startMs: 0,
        durationMs: 2000,
        volume: 2,
      },
    ],
  }), /volume must be between 0 and 1/);

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 2000,
    audioTracks: [
      {
        uri: '/tmp/audio.m4a',
        startMs: 1500,
        durationMs: 800,
        volume: 0.8,
      },
    ],
  }), /must fit within totalDurationMs/);
});
