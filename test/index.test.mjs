import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const platform = { OS: 'ios' };
const nativeCalls = [];
const requireNativeModuleCalls = [];
let nativeResult = true;

const fakeNativeModule = {
  encodeVideo: async (options) => {
    nativeCalls.push(['encodeVideo', options]);
    return nativeResult;
  },
  mixAudio: async (options) => {
    nativeCalls.push(['mixAudio', options]);
    return nativeResult;
  },
};

const stubs = {
  'react-native': { Platform: platform },
  'expo-modules-core': {
    requireNativeModule: (name) => {
      requireNativeModuleCalls.push(name);
      return fakeNativeModule;
    },
  },
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (Object.hasOwn(stubs, request)) return stubs[request];
  return originalLoad.call(this, request, parent, isMain);
};
const encoder = require('../build/index.js');
Module._load = originalLoad;

const validEncodeOptions = () => ({
  framesDir: '/tmp/frames',
  frameCount: 30,
  fps: 30,
  width: 1280,
  height: 720,
  outputPath: '/tmp/out.mp4',
});

const validMixOptions = () => ({
  videoPath: '/tmp/video.mp4',
  outputPath: '/tmp/mixed.mp4',
  totalDurationMs: 1000,
  audioTracks: [{ uri: '/tmp/audio.m4a', startMs: 0, durationMs: 1000, volume: 1 }],
});

beforeEach(() => {
  platform.OS = 'ios';
  nativeCalls.length = 0;
  nativeResult = true;
});

test('the package entry re-exports the path helpers', () => {
  assert.equal(encoder.frameFileName(3), 'frame_000003.jpg');
  assert.equal(encoder.frameFilePath('file:///tmp/f', 3), '/tmp/f/frame_000003.jpg');
  assert.equal(encoder.toNativePath('file:///tmp/a.mp4'), '/tmp/a.mp4');
});

test('importing the package does not load the native module', () => {
  assert.deepEqual(requireNativeModuleCalls, []);
});

test('isAudioMixSupported is true only on iOS', () => {
  const expected = { ios: true, android: false, web: false, windows: false, macos: false };
  for (const [os, supported] of Object.entries(expected)) {
    platform.OS = os;
    assert.equal(encoder.isAudioMixSupported(), supported, os);
  }
});

for (const os of ['ios', 'android']) {
  test(`encodeVideo passes validated options to the native module on ${os}`, async () => {
    platform.OS = os;
    const options = validEncodeOptions();
    assert.equal(await encoder.encodeVideo(options), true);
    assert.deepEqual(nativeCalls, [['encodeVideo', options]]);
  });
}

test('encodeVideo resolves to whatever the native module resolves', async () => {
  nativeResult = false;
  assert.equal(await encoder.encodeVideo(validEncodeOptions()), false);
});

test('encodeVideo rejects on unsupported platforms without touching native code', async () => {
  platform.OS = 'web';
  await assert.rejects(encoder.encodeVideo(validEncodeOptions()), /encodeVideo is only supported on iOS and Android/);
  assert.deepEqual(nativeCalls, []);
});

test('encodeVideo rejects invalid options before native work', async () => {
  await assert.rejects(encoder.encodeVideo({ ...validEncodeOptions(), width: 1281 }), /width must be an even integer/);
  await assert.rejects(encoder.encodeVideo(null), /encodeVideo options must be an object/);
  assert.deepEqual(nativeCalls, []);
});

test('mixAudio passes validated options to the native module on iOS', async () => {
  const options = validMixOptions();
  assert.equal(await encoder.mixAudio(options), true);
  assert.deepEqual(nativeCalls, [['mixAudio', options]]);
});

for (const os of ['android', 'web']) {
  test(`mixAudio rejects on ${os} without touching native code`, async () => {
    platform.OS = os;
    await assert.rejects(encoder.mixAudio(validMixOptions()), /mixAudio is only supported on iOS/);
    assert.deepEqual(nativeCalls, []);
  });
}

test('mixAudio rejects invalid options before native work', async () => {
  await assert.rejects(encoder.mixAudio({ ...validMixOptions(), totalDurationMs: 999 }), /must fit within totalDurationMs/);
  assert.deepEqual(nativeCalls, []);
});

test('the native module is resolved once by its registered name and reused', async () => {
  await encoder.encodeVideo(validEncodeOptions());
  await encoder.mixAudio(validMixOptions());
  assert.deepEqual(requireNativeModuleCalls, ['VideoEncoder']);
});
