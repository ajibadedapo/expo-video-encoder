import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const platform = { OS: 'ios' };
const nativeCalls = [];
const requireNativeModuleCalls = [];
let nativeResult = true;
let nativeError = null;
let nativeEventsDuringEncode = [];
let nativeEncodeImpl = null;
const cancelCalls = [];
const listeners = new Set();

const emitNative = (eventName, event) => {
  for (const listener of listeners) {
    if (listener.eventName === eventName) listener.callback(event);
  }
};

const fakeNativeModule = {
  addListener: (eventName, callback) => {
    const listener = { eventName, callback };
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
  encodeVideo: async (options) => {
    nativeCalls.push(['encodeVideo', options]);
    for (const event of nativeEventsDuringEncode) {
      emitNative('onEncodeProgress', typeof event === 'function' ? event(options) : event);
    }
    if (nativeEncodeImpl) return nativeEncodeImpl(options);
    if (nativeError) throw nativeError;
    return nativeResult;
  },
  cancelEncode: (cancelId) => {
    cancelCalls.push(cancelId);
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
  nativeEventsDuringEncode = [];
  nativeEncodeImpl = null;
  cancelCalls.length = 0;
  listeners.clear();
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

const progressEvent = (processedFrames, encodedFrames, frameCount = 30) => (options) => ({
  progressId: options.progressId,
  processedFrames,
  encodedFrames,
  frameCount,
});

test('encodeVideo without onProgress sends the options unchanged and adds no listener', async () => {
  const options = validEncodeOptions();
  await encoder.encodeVideo(options, {});
  await encoder.encodeVideo(options);
  assert.deepEqual(nativeCalls, [['encodeVideo', options], ['encodeVideo', options]]);
  assert.equal(listeners.size, 0);
});

test('encodeVideo forwards native progress events for its own job to onProgress', async () => {
  nativeEventsDuringEncode = [progressEvent(3, 3), progressEvent(15, 14), progressEvent(30, 29)];
  const received = [];
  assert.equal(await encoder.encodeVideo(validEncodeOptions(), { onProgress: (progress) => received.push(progress) }), true);
  assert.deepEqual(received, [
    { processedFrames: 3, encodedFrames: 3, frameCount: 30, progress: 0.1 },
    { processedFrames: 15, encodedFrames: 14, frameCount: 30, progress: 0.5 },
    { processedFrames: 30, encodedFrames: 29, frameCount: 30, progress: 1 },
  ]);
  const [[, sentOptions]] = nativeCalls;
  assert.match(sentOptions.progressId, /^encode-\d+$/);
  assert.deepEqual({ ...sentOptions, progressId: undefined }, { ...validEncodeOptions(), progressId: undefined });
  assert.equal(listeners.size, 0);
});

test('concurrent encodes only see their own progress events', async () => {
  const first = [];
  const second = [];
  nativeEventsDuringEncode = [progressEvent(10, 10), { progressId: 'encode-someone-else', processedFrames: 1, encodedFrames: 1, frameCount: 30 }];
  await Promise.all([
    encoder.encodeVideo(validEncodeOptions(), { onProgress: (progress) => first.push(progress.processedFrames) }),
    encoder.encodeVideo({ ...validEncodeOptions(), outputPath: '/tmp/other.mp4' }, { onProgress: (progress) => second.push(progress.processedFrames) }),
  ]);
  assert.notEqual(nativeCalls[0][1].progressId, nativeCalls[1][1].progressId);
  assert.deepEqual(first, [10]);
  assert.deepEqual(second, [10]);
});

test('malformed native progress events are ignored', async () => {
  nativeEventsDuringEncode = [
    null,
    (options) => ({ progressId: options.progressId }),
    (options) => ({ progressId: options.progressId, processedFrames: '3', encodedFrames: 3, frameCount: 30 }),
    progressEvent(1, 1, 0),
    progressEvent(6, 6),
  ];
  const received = [];
  await encoder.encodeVideo(validEncodeOptions(), { onProgress: (progress) => received.push(progress.processedFrames) });
  assert.deepEqual(received, [6]);
});

test('the progress listener is removed when the native encode rejects', async () => {
  nativeEventsDuringEncode = [progressEvent(2, 0)];
  nativeError = Object.assign(new Error('no frames'), { code: 'NO_READABLE_FRAMES' });
  const received = [];
  await assert.rejects(
    encoder.encodeVideo(validEncodeOptions(), { onProgress: (progress) => received.push(progress) }),
    (error) => encoder.isExpoVideoEncoderError(error, 'NO_READABLE_FRAMES'),
  );
  assert.equal(received.length, 1);
  assert.equal(listeners.size, 0);
});

test('invalid progress options reject as INVALID_ARGUMENT before native work', async () => {
  for (const progressOptions of [null, 'fast', { onProgress: 'yes' }, { onProgress: {} }]) {
    await assert.rejects(encoder.encodeVideo(validEncodeOptions(), progressOptions), (error) => {
      assert.ok(encoder.isExpoVideoEncoderError(error, 'INVALID_ARGUMENT'), String(progressOptions));
      return true;
    });
  }
  assert.deepEqual(nativeCalls, []);
  assert.equal(listeners.size, 0);
});

test('invalid encode options reject before a progress listener is added', async () => {
  await assert.rejects(encoder.encodeVideo({ ...validEncodeOptions(), fps: 0 }, { onProgress: () => {} }), /fps/);
  assert.equal(listeners.size, 0);
});

const cancelledByNative = () => Object.assign(new Error('Encoding was cancelled'), { code: 'ENCODE_CANCELLED' });

const pendingNativeEncode = () => {
  let settle;
  nativeEncodeImpl = (options) =>
    new Promise((resolve, reject) => {
      settle = { resolve, reject, options };
    });
  return () => settle;
};

const trackedSignal = (controller) => {
  const added = [];
  const removed = [];
  const { signal } = controller;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type, listener, options) => {
    added.push(type);
    add(type, listener, options);
  };
  signal.removeEventListener = (type, listener, options) => {
    removed.push(type);
    remove(type, listener, options);
  };
  return { signal, added, removed };
};

test('encodeVideo with an already aborted signal rejects as ENCODE_CANCELLED without native work', async () => {
  const controller = new AbortController();
  const reason = new Error('user left the screen');
  controller.abort(reason);
  await assert.rejects(encoder.encodeVideo(validEncodeOptions(), { signal: controller.signal }), (error) => {
    assert.ok(encoder.isExpoVideoEncoderError(error, 'ENCODE_CANCELLED'));
    assert.equal(error.cause, reason);
    return true;
  });
  assert.deepEqual(nativeCalls, []);
  assert.deepEqual(cancelCalls, []);
  assert.equal(listeners.size, 0);
});

test('aborting during an encode asks the native encoder to cancel that job and rejects with its typed error', async () => {
  const native = pendingNativeEncode();
  const controller = new AbortController();
  const tracked = trackedSignal(controller);
  const encoding = encoder.encodeVideo(validEncodeOptions(), { signal: tracked.signal });
  await Promise.resolve();
  const { options, reject } = native();
  assert.match(options.cancelId, /^encode-\d+$/);
  assert.equal(options.progressId, undefined);
  controller.abort();
  assert.deepEqual(cancelCalls, [options.cancelId]);
  reject(cancelledByNative());
  await assert.rejects(encoding, (error) => encoder.isExpoVideoEncoderError(error, 'ENCODE_CANCELLED'));
  assert.deepEqual(tracked.added, ['abort']);
  assert.deepEqual(tracked.removed, ['abort']);
});

test('an encode that finishes before abort resolves normally and a later abort does nothing', async () => {
  const controller = new AbortController();
  const tracked = trackedSignal(controller);
  assert.equal(await encoder.encodeVideo(validEncodeOptions(), { signal: tracked.signal }), true);
  const [[, sentOptions]] = nativeCalls;
  assert.match(sentOptions.cancelId, /^encode-\d+$/);
  assert.deepEqual(tracked.removed, ['abort']);
  controller.abort();
  assert.deepEqual(cancelCalls, []);
});

test('progress and cancellation for one call share the same job id', async () => {
  const native = pendingNativeEncode();
  const controller = new AbortController();
  const encoding = encoder.encodeVideo(validEncodeOptions(), { signal: controller.signal, onProgress: () => {} });
  await Promise.resolve();
  const { options, resolve } = native();
  assert.equal(options.cancelId, options.progressId);
  resolve(true);
  assert.equal(await encoding, true);
  assert.equal(listeners.size, 0);
});

test('concurrent encodes cancel only the job whose signal aborted', async () => {
  const jobs = [];
  nativeEncodeImpl = (options) => new Promise((resolve, reject) => jobs.push({ options, resolve, reject }));
  const first = new AbortController();
  const second = new AbortController();
  const a = encoder.encodeVideo(validEncodeOptions(), { signal: first.signal });
  const b = encoder.encodeVideo({ ...validEncodeOptions(), outputPath: '/tmp/other.mp4' }, { signal: second.signal });
  await Promise.resolve();
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[0].options.cancelId, jobs[1].options.cancelId);
  second.abort();
  assert.deepEqual(cancelCalls, [jobs[1].options.cancelId]);
  jobs[0].resolve(true);
  jobs[1].reject(cancelledByNative());
  assert.equal(await a, true);
  await assert.rejects(b, (error) => encoder.isExpoVideoEncoderError(error, 'ENCODE_CANCELLED'));
});

test('a native build without cancelEncode gets no cancelId and abort leaves the encode running', async () => {
  const { cancelEncode } = fakeNativeModule;
  delete fakeNativeModule.cancelEncode;
  try {
    const native = pendingNativeEncode();
    const controller = new AbortController();
    const encoding = encoder.encodeVideo(validEncodeOptions(), { signal: controller.signal });
    await Promise.resolve();
    const { options, resolve } = native();
    assert.equal(options.cancelId, undefined);
    controller.abort();
    resolve(true);
    assert.equal(await encoding, true);
  } finally {
    fakeNativeModule.cancelEncode = cancelEncode;
  }
  assert.deepEqual(cancelCalls, []);
});

test('an error thrown by the native cancelEncode call does not escape the abort handler', async () => {
  const { cancelEncode } = fakeNativeModule;
  fakeNativeModule.cancelEncode = () => {
    throw new Error('native module gone');
  };
  try {
    const native = pendingNativeEncode();
    const controller = new AbortController();
    const encoding = encoder.encodeVideo(validEncodeOptions(), { signal: controller.signal });
    await Promise.resolve();
    assert.doesNotThrow(() => controller.abort());
    native().resolve(true);
    assert.equal(await encoding, true);
  } finally {
    fakeNativeModule.cancelEncode = cancelEncode;
  }
});

test('a signal that is not an AbortSignal rejects as INVALID_ARGUMENT before native work', async () => {
  for (const signal of [null, true, {}, { aborted: false }, { aborted: 'no', addEventListener() {}, removeEventListener() {} }]) {
    await assert.rejects(encoder.encodeVideo(validEncodeOptions(), { signal }), (error) => {
      assert.ok(encoder.isExpoVideoEncoderError(error, 'INVALID_ARGUMENT'), JSON.stringify(signal));
      return true;
    });
  }
  assert.deepEqual(nativeCalls, []);
});

test('invalid encode options are reported before an aborted signal', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(encoder.encodeVideo({ ...validEncodeOptions(), width: 3 }, { signal: controller.signal }), (error) =>
    encoder.isExpoVideoEncoderError(error, 'INVALID_OPTIONS'),
  );
});
