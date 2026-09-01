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

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames ',
    frameCount: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/out.mp4',
  }), /framesDir must not include leading or trailing whitespace/);

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames/',
    frameCount: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/frames/output.mp4',
  }), /outputPath must be outside framesDir/);

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames/frame_000001.jpg',
    frameCount: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/out.mp4',
  }), /framesDir must point to a directory/);

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames',
    frameCount: 30,
    fps: 30,
    width: 1919,
    height: 1080,
    outputPath: '/tmp/out.mp4',
  }), /width must be an even integer/);

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames',
    frameCount: 30,
    fps: 30,
    width: 1920,
    height: 1079,
    outputPath: '/tmp/out.mp4',
  }), /height must be an even integer/);

  assert.throws(() => assertEncodeVideoOptions({
    framesDir: '/tmp/frames',
    frameCount: 30,
    fps: 241,
    width: 1920,
    height: 1080,
    outputPath: '/tmp/out.mp4',
  }), /fps must be 240 or less/);
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
    audioTracks: Array.from({ length: 17 }, (_, index) => ({
      uri: `/tmp/audio-${index}.m4a`,
      startMs: 0,
      durationMs: 1000,
      volume: 0.8,
    })),
  }), /audioTracks must contain 16 tracks or fewer/);

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

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/video.mp4',
    totalDurationMs: 2000,
    audioTracks: [
      {
        uri: '/tmp/audio.m4a',
        startMs: 0,
        durationMs: 1000,
        volume: 0.8,
      },
    ],
  }), /outputPath must be different from videoPath/);

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 2000,
    audioTracks: [
      {
        uri: 'file:///tmp/audio.m4a',
        startMs: 0,
        durationMs: 1000,
        volume: 0.8,
      },
    ],
  }), /audioTracks\[0\]\.uri must not include/);

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 3000,
    audioTracks: [
      {
        uri: '/tmp/voiceover.m4a',
        startMs: 0,
        durationMs: 1500,
        volume: 0.8,
      },
      {
        uri: '/tmp/music.m4a',
        startMs: 1200,
        durationMs: 1000,
        volume: 0.4,
      },
    ],
  }), /must not overlap/);

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 4000,
    audioTracks: [
      {
        uri: '/tmp/voiceover.m4a',
        startMs: 0,
        durationMs: 1000,
        volume: 0.8,
      },
      {
        uri: '/tmp/voiceover.m4a',
        startMs: 2000,
        durationMs: 1000,
        volume: 0.4,
      },
    ],
  }), /audioTracks\[1\]\.uri must be different/);

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 4000,
    audioTracks: [
      {
        uri: '/tmp/not-audio.txt',
        startMs: 0,
        durationMs: 1000,
        volume: 0.8,
      },
    ],
  }), /supported audio extension/);

  assert.throws(() => assertMixAudioOptions({
    videoPath: '/tmp/video.mp4 ',
    outputPath: '/tmp/mixed.mp4',
    totalDurationMs: 4000,
    audioTracks: [
      {
        uri: '/tmp/audio.m4a',
        startMs: 0,
        durationMs: 1000,
        volume: 0.8,
      },
    ],
  }), /videoPath must not include leading or trailing whitespace/);
});
