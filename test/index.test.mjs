import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const platform = { OS: 'ios' };
const nativeCalls = [];
const requireNativeModuleCalls = [];
let nativeResult = true;
let nativeError = null;

const fakeNativeModule = {
  encodeVideo: async (options) => {
    nativeCalls.push(['encodeVideo', options]);
    if (nativeError) throw nativeError;
    return nativeResult;
  },
  mixAudio: async (options) => {
    nativeCalls.push(['mixAudio', options]);
    if (nativeError) throw nativeError;
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
  nativeError = null;
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
  await assert.rejects(encoder.encodeVideo(validEncodeOptions()), (error) => encoder.isExpoVideoEncoderError(error, 'UNSUPPORTED_PLATFORM'));
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
    await assert.rejects(encoder.mixAudio(validMixOptions()), (error) => encoder.isExpoVideoEncoderError(error, 'UNSUPPORTED_PLATFORM'));
    assert.deepEqual(nativeCalls, []);
  });
}

test('invalid options reject as ExpoVideoEncoderError with the field name', async () => {
  await assert.rejects(encoder.encodeVideo({ ...validEncodeOptions(), fps: 0.5 }), (error) => {
    assert.ok(error instanceof encoder.ExpoVideoEncoderError);
    assert.equal(error.code, 'INVALID_OPTIONS');
    assert.equal(error.field, 'fps');
    return true;
  });
  await assert.rejects(encoder.mixAudio({ ...validMixOptions(), outputPath: '/tmp/video.mp4' }), (error) => {
    assert.equal(error.code, 'INVALID_OPTIONS');
    assert.equal(error.field, 'outputPath');
    return true;
  });
  assert.deepEqual(nativeCalls, []);
});

test('mixAudio rejects invalid options before native work', async () => {
  await assert.rejects(encoder.mixAudio({ ...validMixOptions(), totalDurationMs: 999 }), /must fit within totalDurationMs/);
  assert.deepEqual(nativeCalls, []);
});

test('the native module is resolved once by its registered name and reused', async () => {
  await encoder.encodeVideo(validEncodeOptions());
  await encoder.mixAudio(validMixOptions());
  assert.deepEqual(requireNativeModuleCalls, ['VideoEncoder']);
});

test('the package entry re-exports findMissingFrames', async () => {
  const missing = await encoder.findMissingFrames('file:///tmp/f', 2, (path) => path.endsWith('frame_000000.jpg'));
  assert.deepEqual(missing, [1]);
  assert.deepEqual(nativeCalls, []);
});

const codedError = (code, message) => Object.assign(new Error(message), { code });

test('native encode rejections become ExpoVideoEncoderError with the native code and cause', async () => {
  for (const code of ['NO_READABLE_FRAMES', 'WRITER_FAILED', 'ENCODE_ERROR', 'INVALID_ARGS']) {
    nativeError = codedError(code, `native ${code}`);
    await assert.rejects(encoder.encodeVideo(validEncodeOptions()), (error) => {
      assert.ok(encoder.isExpoVideoEncoderError(error, code), code);
      assert.equal(error.message, `expo-video-encoder: native ${code}`);
      assert.equal(error.field, undefined);
      assert.equal(error.cause, nativeError);
      return true;
    });
  }
});

test('native mix rejections become ExpoVideoEncoderError', async () => {
  nativeError = codedError('MIX_ERROR', 'Export failed');
  await assert.rejects(encoder.mixAudio(validMixOptions()), (error) => encoder.isExpoVideoEncoderError(error, 'MIX_ERROR'));
});

test('native errors without a known code pass through unchanged', async () => {
  for (const value of [codedError('ERR_SOMETHING_ELSE', 'x'), new Error('plain'), 'a string']) {
    nativeError = value;
    await assert.rejects(encoder.encodeVideo(validEncodeOptions()), (error) => {
      assert.equal(error, value);
      return true;
    });
  }
});

test('a native error with an empty message falls back to its code', async () => {
  nativeError = codedError('WRITER_FAILED', '');
  await assert.rejects(encoder.encodeVideo(validEncodeOptions()), /expo-video-encoder: WRITER_FAILED/);
});
