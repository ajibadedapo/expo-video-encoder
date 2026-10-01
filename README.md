# expo-video-encoder

[![npm version](https://img.shields.io/npm/v/expo-video-encoder.svg)](https://www.npmjs.com/package/expo-video-encoder)
[![npm downloads](https://img.shields.io/npm/dm/expo-video-encoder.svg)](https://www.npmjs.com/package/expo-video-encoder)
[![Build](https://github.com/ajibadedapo/expo-video-encoder/actions/workflows/build.yml/badge.svg)](https://github.com/ajibadedapo/expo-video-encoder/actions/workflows/build.yml)
[![license](https://img.shields.io/npm/l/expo-video-encoder.svg)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey.svg)](#platform-support)
[![expo](https://img.shields.io/badge/expo-%3E%3D51-blue.svg)](https://expo.dev)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](./CODE_OF_CONDUCT.md)

NPM registry: [expo-video-encoder](https://www.npmjs.com/package/expo-video-encoder)

> Encode a sequence of JPEG frames into an H.264 MP4, natively on iOS (AVFoundation) and Android (MediaCodec). Zero external dependencies. No binaries to download. No servers.

---

## Why this exists

**`ffmpeg-kit-react-native` is dead.** The project was archived in late 2023 and every release binary on GitHub returns 404. If you've been building video export for a React Native iOS app, you already know this pain.

The alternatives people try:

| Option | Problem |
|--------|---------|
| `ffmpeg-kit-react-native` | Archived. All binaries 404. |
| Server-side encoding | Requires internet. Privacy risk. Adds latency. |
| FFmpeg WASM | Doesn't run on Hermes (React Native's JS engine). |
| Other RN packages | All depend on the same dead arthenica binaries. |
| Writing AVFoundation yourself | This is that, already written for you. |

Apple ships a fully capable video encoder in every iPhone and iPad called **AVFoundation**. It handles H.264 encoding in hardware, supports audio mixing, and has been stable since iOS 4. This package exposes it to React Native through a lean Expo native module.

---

## Features

- **H.264 MP4 encoding:** industry-standard format, plays everywhere
- **Cross-platform:** frame encoding runs on iOS (AVFoundation) and Android (MediaCodec) behind one API
- **Frame-by-frame assembly:** snapshot your canvas, Skia surface, or any pixel source
- **Encode progress:** an optional `onProgress` callback reports how many frames have been processed, on iOS and Android
- **Audio mixing:** place up to 16 non-overlapping audio clips on the timeline, each with its own start time and volume (iOS today, see [Platform support](#platform-support))
- **Hardware accelerated:** uses the device's built-in video encoder chip on both platforms
- **Zero external dependencies:** no CocoaPods binary downloads, no xcframework, no surprises
- **Expo autolinking:** install and it works, no manual native setup
- **iOS 13.4+ and Android 7.0+ (API 24):** covers virtually all devices in the wild today
- **TypeScript first:** full type definitions included

---

## How it works

Understanding the pipeline helps you use it correctly and debug when something goes wrong.

### Frame encoding

```
JPEG files on disk
       │
       ▼
 UIImage (decoded)
       │
       ▼
CVPixelBuffer (ARGB)         ← one per frame
       │
       ▼
AVAssetWriterInputPixelBufferAdaptor
       │   appends each buffer at presentation timestamp
       ▼
AVAssetWriterInput  (H.264, libx264 via VideoToolbox)
       │
       ▼
AVAssetWriter  →  output.mp4
```

Each frame is:
1. Read from disk as a JPEG
2. Decoded into a `UIImage`
3. Drawn into a `CVPixelBuffer` via `CGContext`
4. Appended to the `AVAssetWriterInputPixelBufferAdaptor` at its presentation timestamp (`frame_index / fps`)

The `AVAssetWriter` session is kept open across all frames, then finalized with `markAsFinished()` + `finishWriting()`.

On Android the same pipeline runs through `MediaCodec` (an H.264 encoder configured with `COLOR_FormatYUV420Flexible`) feeding a `MediaMuxer`. Each JPEG is decoded to a `Bitmap`, converted to YUV, and queued as an input buffer with an explicit presentation timestamp of `frame_index / fps`; encoded samples are drained to the muxer until end of stream. The public API and the output MP4 are identical to iOS.

### Audio mixing

```
Silent MP4  ──────────────────┐
                               ▼
Audio track A (narration)  → AVMutableComposition
Audio track B (music)      → AVMutableComposition
                               │
                               ▼
                    AVAssetExportSession
                     (AVAssetExportPresetHighestQuality)
                               │
                               ▼
                           mixed.mp4
```

Each audio track is inserted into an `AVMutableComposition` at its specified millisecond offset. The composition is then exported with `AVAssetExportSession`, which handles resampling, mixing, and rendering.

### Why JPEG frames, not raw pixels?

JPEG is the most practical format for frame transfer between JavaScript and native code in React Native:
- `@shopify/react-native-skia` and most canvas libraries can snapshot to JPEG base64
- `expo-file-system` can write base64 to disk in one call
- JPEG decode on iOS is hardware-accelerated
- Raw pixel arrays (RGBA) would be 4 to 10x larger to transfer across the JS bridge

---

## Installation

This package ships native code, so it does not run inside Expo Go. Use an Expo development build, a prebuilt Expo app, or a bare React Native app.

### Expo managed or prebuild projects (SDK 51 or newer)

```sh
npx expo install expo-video-encoder
npx expo prebuild
```

`npx expo run:ios` and `npx expo run:android` also prebuild for you. No `app.json` config plugin is needed: Expo autolinking reads `expo-module.config.json` and wires up the native module on iOS and Android. For EAS Build, create a new development or production build after installing, because an over-the-air update cannot add native code.

### Bare React Native (0.74 or newer)

The module is built on the Expo Modules API, so a bare app needs Expo modules support first. If your app does not have it yet:

```sh
npx install-expo-modules@latest
```

Then install the package and the iOS pods:

```sh
npm install expo-video-encoder
npx pod-install
```

Android picks the module up through autolinking on the next Gradle build.

### Requirements

| Requirement | Minimum | Source |
|-------------|---------|--------|
| `expo` | 51 | `peerDependencies` |
| `react-native` | 0.74 | `peerDependencies` |
| iOS | 13.4 | `ExpoVideoEncoder.podspec` |
| Android | API 24 (7.0) | `android/build.gradle` default `minSdkVersion` |

> **Note:** `encodeVideo` runs on iOS and Android. `mixAudio` is iOS only for now (see [Platform support](#platform-support)); on Android it throws, and since audio mixing is designed to be non-fatal, callers should fall back to the silent video. On any non-mobile platform (web) both functions throw a clear error.

---

## Platform support

| Function | iOS | Android | Native backend |
|----------|-----|---------|----------------|
| `encodeVideo` | ✅ 13.4+ | ✅ 7.0+ (API 24) | AVFoundation (iOS), MediaCodec + MediaMuxer (Android) |
| `mixAudio` | ✅ 13.4+ | ⬜ not yet | AVMutableComposition + AVAssetExportSession (iOS) |

Android audio mixing is tracked as a follow-up. Because `mixAudio` failures are expected to be non-fatal, the recommended pattern already falls back to the silent video when it throws, so Android apps keep working with export-without-audio today. See [CONTRIBUTING.md](./CONTRIBUTING.md) if you want to help build it.

---

## Quick start

The minimum viable video export:

```typescript
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { encodeVideo, toNativePath } from 'expo-video-encoder';

async function exportVideo() {
  const framesDir = `${FileSystem.cacheDirectory}frames/`;
  const outputPath = `${FileSystem.cacheDirectory}output.mp4`;

  // 1. Create the frames directory
  await FileSystem.makeDirectoryAsync(framesDir, { intermediates: true });

  // 2. Write your frames as frame_000000.jpg, frame_000001.jpg, …
  //    (see "Capturing frames" section below for how to do this with Skia)

  // 3. Encode
  await encodeVideo({
    framesDir:  toNativePath(framesDir),
    frameCount: 60,   // number of frames you wrote
    fps:        30,
    width:      1920,
    height:     1080,
    outputPath: toNativePath(outputPath),
  });

  // 4. Save to Photos library
  await MediaLibrary.createAssetAsync(outputPath);
}
```

---

## Capturing frames

### With @shopify/react-native-skia

```typescript
import { useCanvasRef } from '@shopify/react-native-skia';

const ref = useCanvasRef();

async function captureFrame(): Promise<string> {
  const image = await ref.current?.makeImageSnapshotAsync();
  if (!image) throw new Error('Snapshot failed');
  // encodeAsBase64() returns JPEG base64 by default
  return image.encodeToBase64();
}
```

Then in your frame loop:

```typescript
import { frameFileName } from 'expo-video-encoder';

for (let i = 0; i < totalFrames; i++) {
  // seek your animation to frame i / fps seconds
  seekTo(i / fps);
  await new Promise(r => requestAnimationFrame(r)); // let Skia render

  const base64 = await captureFrame();
  await FileSystem.writeAsStringAsync(
    `${framesDir}${frameFileName(i)}`,
    base64,
    { encoding: FileSystem.EncodingType.Base64 }
  );
}
```

### With expo-gl / WebGL

```typescript
import { GLView } from 'expo-gl';
import * as FileSystem from 'expo-file-system';

async function captureGLFrame(gl: WebGLRenderingContext): Promise<string> {
  const { width, height } = gl.drawingBufferWidth
    ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }
    : { width: 1920, height: 1080 };

  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // convert to base64 JPEG before writing…
}
```

---

## API reference

Everything below is exported from `expo-video-encoder`:

| Export | Kind | Platforms |
|--------|------|-----------|
| `encodeVideo` | async function | iOS, Android |
| `mixAudio` | async function | iOS |
| `isAudioMixSupported` | function | any (returns `false` off iOS) |
| `frameFileName`, `frameFilePath`, `toNativePath` | functions | any (pure JavaScript) |
| `findMissingFrames` | async function | any (you supply the file check) |
| `ExpoVideoEncoderError`, `isExpoVideoEncoderError` | error class and type guard | any |
| `EncodeVideoOptions`, `EncodeVideoProgressOptions`, `EncodeProgress`, `MixAudioOptions`, `AudioTrack`, `FrameExistsCheck`, `ExpoVideoEncoderErrorCode`, `ExpoVideoEncoderNativeErrorCode` | types | |

### Types

```typescript
type EncodeVideoOptions = {
  framesDir: string;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  outputPath: string;
};

type EncodeProgress = {
  processedFrames: number;
  encodedFrames: number;
  frameCount: number;
  progress: number;
};

type EncodeVideoProgressOptions = {
  onProgress?: (progress: EncodeProgress) => void;
};

type AudioTrack = {
  uri: string;
  startMs: number;
  durationMs: number;
  volume: number;
};

type MixAudioOptions = {
  videoPath: string;
  audioTracks: AudioTrack[];
  outputPath: string;
  totalDurationMs: number;
};

type FrameExistsCheck = (path: string, index: number) => boolean | Promise<boolean>;

type ExpoVideoEncoderNativeErrorCode =
  | 'NO_READABLE_FRAMES'
  | 'WRITER_FAILED'
  | 'ENCODE_ERROR'
  | 'MIX_ERROR'
  | 'MIX_UNSUPPORTED'
  | 'INVALID_ARGS';

type ExpoVideoEncoderErrorCode =
  | 'INVALID_OPTIONS'
  | 'INVALID_ARGUMENT'
  | 'UNSUPPORTED_PLATFORM'
  | ExpoVideoEncoderNativeErrorCode;

class ExpoVideoEncoderError extends Error {
  readonly code: ExpoVideoEncoderErrorCode;
  readonly field: string | undefined;
  readonly cause: unknown;
}

function encodeVideo(options: EncodeVideoOptions, progressOptions?: EncodeVideoProgressOptions): Promise<boolean>;
function mixAudio(options: MixAudioOptions): Promise<boolean>;
function isAudioMixSupported(): boolean;
function frameFileName(index: number): string;
function frameFilePath(framesDir: string, index: number): string;
function toNativePath(uri: string): string;
function findMissingFrames(framesDir: string, frameCount: number, frameExists: FrameExistsCheck): Promise<number[]>;
function isExpoVideoEncoderError(error: unknown, code?: ExpoVideoEncoderErrorCode): error is ExpoVideoEncoderError;
```

### Native paths

Every path option (`framesDir`, `outputPath`, `videoPath`, and `AudioTrack.uri`) must be a plain absolute native path. It must start with `/`, must not start with `file://`, must not have leading or trailing whitespace, and must not contain `.` or `..` segments. Convert paths from `expo-file-system` with `toNativePath` first. Path comparisons (output inside `framesDir`, output equal to input, duplicate audio files) ignore letter case and trailing slashes, so the checks stay conservative on case-insensitive file systems.

### `encodeVideo(options: EncodeVideoOptions, progressOptions?: EncodeVideoProgressOptions): Promise<boolean>`

Assembles a directory of JPEG frames into an H.264 MP4 file. Resolves `true` on success.

| Option | Type | Rules checked before native work |
|--------|------|----------------------------------|
| `framesDir` | `string` | Native path (see above). Must be a directory, so it must not end in `.jpg` or `.jpeg`. |
| `frameCount` | `number` | Positive integer. `frameCount / fps` must be one hour (3600000 ms) or less. |
| `fps` | `number` | Finite number from 1 to 240. |
| `width` | `number` | Even integer from 2 to 8192. |
| `height` | `number` | Even integer from 2 to 8192. |
| `outputPath` | `string` | Native path ending in `.mp4` (any case). Must be outside `framesDir`. |

Behaviour:

- Frames are read as `framesDir/frame_000000.jpg` up to `frame_{frameCount - 1}` (six digit zero padding). Use `frameFileName(i)` or `frameFilePath(dir, i)` to produce those names.
- Frame `i` is shown at `i / fps` seconds. Missing or unreadable frames are skipped without an error, but at least one readable frame is required, otherwise the promise rejects with `NO_READABLE_FRAMES`. A skipped frame is not replaced: the other frames keep their `i / fps` timestamps, and missing frames at the end make the video shorter. Run `findMissingFrames` first if a partial capture should fail the export (see [Checking frames before encoding](#checking-frames-before-encoding)).
- Each frame is scaled to `width` x `height`. Aspect ratio is not preserved, so capture frames at the output size or the same aspect ratio.
- An existing file at `outputPath` is replaced, and missing parent folders of `outputPath` are created. On Android, a failed encode deletes the partial file at `outputPath`.
- Fractional `fps` such as `29.97` is kept on both platforms. iOS places frames on a 90 kHz clock and Android rounds `i / fps` to the nearest microsecond, so 60 frames at `29.97` last 2.002 seconds on either.

#### Progress

Pass `{ onProgress }` as the second argument to follow a long encode:

```typescript
await encodeVideo(options, {
  onProgress: ({ processedFrames, frameCount, progress }) => {
    setLabel(`Encoding ${processedFrames} of ${frameCount}`);
    setBar(progress);
  },
});
```

| `EncodeProgress` field | Meaning |
|------------------------|---------|
| `processedFrames` | Frame files handled so far, from 1 to `frameCount`. Skipped (missing or unreadable) frames count as handled. |
| `encodedFrames` | Frames actually handed to the encoder so far. Lower than `processedFrames` when frames were skipped. |
| `frameCount` | The `frameCount` you passed. |
| `progress` | `processedFrames / frameCount`, from 0 to 1. |

- The native encoder sends at most one event per whole percent, plus one for the last frame, so a 100000 frame encode produces about 100 callbacks, and an encode of fewer than 100 frames produces one per frame.
- `progress` reaching 1 means every frame has been read and queued. The MP4 is still being finished after that; the promise resolving is the completion signal.
- Events arrive asynchronously from the native thread. The listener is removed as soon as the promise settles, so an event still in flight at that moment is dropped. Do not rely on seeing a final `progress: 1` before `await encodeVideo` returns.
- Each call gets its own job id, so concurrent encodes only see their own progress.
- Without `onProgress` nothing changes: no listener is added and the native side sends no events.
- A second argument that is not an object, or an `onProgress` that is not a function, rejects with `INVALID_ARGUMENT` before any native work.
- The callback runs on the JavaScript thread. An error it throws is not caught by `encodeVideo`.
- Progress needs the native code from this version. With newer JavaScript on an older native build (for example an over the air update), `encodeVideo` still works and `onProgress` is simply never called.

### `mixAudio(options: MixAudioOptions): Promise<boolean>`

Mixes audio clips onto an existing silent MP4 and writes a new MP4. Resolves `true` on success.

> **iOS only for now.** On other platforms it rejects with `UNSUPPORTED_PLATFORM` before any native call. Check `isAudioMixSupported()` first, and treat any failure as non-fatal by falling back to the silent video (the pipeline example below does this).

| Option | Type | Rules checked before native work |
|--------|------|----------------------------------|
| `videoPath` | `string` | Native path ending in `.mp4`. |
| `audioTracks` | `AudioTrack[]` | 1 to 16 tracks. Tracks must not overlap in time (back to back is fine) and must use different files. |
| `outputPath` | `string` | Native path ending in `.mp4`. Must be different from `videoPath`. An existing file is replaced. |
| `totalDurationMs` | `number` | Positive integer, 3600000 (one hour) or less. Sets the export time range. |

#### `AudioTrack`

| Field | Type | Rules checked before native work |
|-------|------|----------------------------------|
| `uri` | `string` | Native path (despite the name, `file://` URIs are rejected) ending in `.aac`, `.caf`, `.m4a`, `.mp3`, or `.wav` (any case). |
| `startMs` | `number` | Integer, 0 or greater. Where the clip starts in the output. |
| `durationMs` | `number` | Positive integer. How much of the clip to use, from its start. `startMs + durationMs` must be `totalDurationMs` or less. |
| `volume` | `number` | From `0` (silent) to `1` (full). |

On iOS, a track whose file has no readable audio is skipped rather than failing the export.

### `isAudioMixSupported(): boolean`

`true` where `mixAudio` is implemented (iOS today). Use it to skip the audio step instead of catching an error.

### Path and frame helpers

| Function | Returns | Description |
|---|---|---|
| `frameFileName(index)` | `string` | The file name the encoder reads for a frame, e.g. `frameFileName(7)` is `frame_000007.jpg`. Throws `INVALID_ARGUMENT` for anything but an integer from 0 to 999999. |
| `frameFilePath(framesDir, index)` | `string` | `framesDir` (plain path or `file://` URI) joined with `frameFileName(index)`, as a native path. Trailing slashes on `framesDir` are ignored. |
| `toNativePath(uri)` | `string` | Trims whitespace, strips `file://` (and `file://localhost`), decodes percent-encoding, and returns a plain absolute path. Plain paths pass through trimmed. Throws `INVALID_ARGUMENT` for an empty string or broken percent-encoding. |
| `findMissingFrames(framesDir, frameCount, frameExists)` | `Promise<number[]>` | Calls `frameExists(path, index)` for every frame from `0` to `frameCount - 1` (32 checks at a time) and resolves the indexes that returned `false`, in ascending order. `path` is the native path the encoder will read. Rejects with `INVALID_ARGUMENT` if `frameCount` is not an integer from 1 to 1000000, if `frameExists` is not a function, or if it returns anything other than a boolean (for example a whole file info object). Errors thrown by `frameExists` are passed through. |

#### Checking frames before encoding

The native encoders skip a frame file that is missing or cannot be decoded and keep going, so a capture loop that failed halfway still produces a video. `findMissingFrames` lets you catch that in JavaScript first. The package has no file system dependency, so you pass the existence check. It only checks that each file exists, not that it is a valid JPEG.

```typescript
import * as FileSystem from 'expo-file-system';
import { encodeVideo, findMissingFrames, frameFileName, toNativePath } from 'expo-video-encoder';

const framesDir = `${FileSystem.cacheDirectory}frames/`;

const missing = await findMissingFrames(framesDir, frameCount, async (_path, index) => {
  const info = await FileSystem.getInfoAsync(`${framesDir}${frameFileName(index)}`);
  return info.exists;
});

if (missing.length > 0) {
  throw new Error(`Frames not written: ${missing.slice(0, 10).join(', ')}`);
}

await encodeVideo({ framesDir: toNativePath(framesDir), frameCount, fps, width, height, outputPath });
```

### Errors

Problems this package can detect in JavaScript are thrown (or, from the async functions, rejected) as `ExpoVideoEncoderError` before any native work starts:

| `code` | When | `field` |
|--------|------|---------|
| `INVALID_OPTIONS` | An `encodeVideo` or `mixAudio` option breaks a rule listed above. | The option path, such as `'fps'`, `'outputPath'`, or `'audioTracks[1].volume'`. `undefined` when the options value itself is not an object. |
| `INVALID_ARGUMENT` | A path or frame helper (including `findMissingFrames`) received a value it cannot use, or the `encodeVideo` progress argument is not `{ onProgress?: function }`. | `undefined` |
| `UNSUPPORTED_PLATFORM` | `encodeVideo` off iOS and Android, or `mixAudio` off iOS. | `undefined` |

Failures inside the native modules are also rejected as `ExpoVideoEncoderError`, with the native code kept as `code` and the original Expo Modules error as `cause`:

| `code` | When |
|--------|------|
| `NO_READABLE_FRAMES` | `encodeVideo` found none of the `frameCount` frame files, or none decoded as JPEG. No output file is left behind. |
| `WRITER_FAILED` | The MP4 could not be written. On iOS, `AVAssetWriter` could not be created, refused the H.264 settings, failed to start, stopped during encoding (for example when the disk is full), or could not finish the file, and the message includes the reason `AVAssetWriter` gave. On Android, `MediaMuxer` could not open `outputPath`, add the video track, write a frame, or finish the file, or the encoder produced no frames; the message names the step that failed. |
| `ENCODE_ERROR` | Any other encoding failure, for example an Android `MediaCodec` error or an existing `outputPath` that could not be replaced. |
| `MIX_ERROR` | iOS audio mixing failed, for example the video has no video track or the export failed. |
| `MIX_UNSUPPORTED` | The Android native module was called for `mixAudio` directly. The JavaScript API rejects with `UNSUPPORTED_PLATFORM` first. |
| `INVALID_ARGS` | The native side could not read the options (normally caught earlier by `INVALID_OPTIONS`). |

Errors from the native layer that do not carry one of these codes are passed through unchanged.

```typescript
import { encodeVideo, isExpoVideoEncoderError } from 'expo-video-encoder';

try {
  await encodeVideo(options);
} catch (error) {
  if (isExpoVideoEncoderError(error, 'INVALID_OPTIONS')) {
    console.warn(`Fix ${error.field}: ${error.message}`);
  } else if (isExpoVideoEncoderError(error, 'NO_READABLE_FRAMES')) {
    console.warn('No frames were captured, nothing to encode.');
  } else {
    throw error;
  }
}
```

Error messages are meant for developers and may be reworded in minor releases. Match on `code` and `field`, not on message text.

### Limitations

- Input is JPEG files on disk with the fixed `frame_000000.jpg` naming. There is no in-memory or PNG input.
- Output is H.264 in MP4 only. The bitrate is derived from `width * height * fps / 8` and cannot be configured yet.
- There is no cancellation. Progress is reported per frame read (see [Progress](#progress)), not for finishing the MP4 file or for `mixAudio`.
- Audio mixing is iOS only, and overlapping clips (for example narration over music) are rejected. Mix overlapping audio into one file first.
- Web and other platforms are not supported.
- Android encoding has been verified on an emulator (see the 1.1.0 notes in [CHANGELOG.md](./CHANGELOG.md)), not yet on a physical Android device. CI covers the JavaScript layer and package contents, not native builds.

---

## Complete export pipeline example

A production-ready export flow with progress reporting:

```typescript
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { encodeVideo, frameFileName, isAudioMixSupported, mixAudio, toNativePath } from 'expo-video-encoder';

type ExportOptions = {
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  captureFrame: (frameIndex: number) => Promise<string>; // returns JPEG base64
  audioTracks?: {
    uri: string;
    startMs: number;
    durationMs: number;
    volume: number;
  }[];
  totalDurationMs: number;
  saveToLibrary: boolean;
  onProgress: (phase: string, percent: number) => void;
};

export async function runExport(options: ExportOptions): Promise<string | null> {
  const {
    frameCount, fps, width, height,
    captureFrame, audioTracks = [],
    totalDurationMs, saveToLibrary, onProgress,
  } = options;

  const exportId  = `export_${Date.now()}`;
  const tempDir   = `${FileSystem.cacheDirectory}${exportId}/`;
  const framesDir = `${tempDir}frames/`;
  const silentMp4 = `${tempDir}silent.mp4`;
  const mixedMp4  = `${tempDir}mixed.mp4`;

  // ── 1. Prepare ──────────────────────────────────────────────────────────────
  onProgress('Preparing', 0);
  await FileSystem.makeDirectoryAsync(framesDir, { intermediates: true });

  // ── 2. Capture frames ───────────────────────────────────────────────────────
  for (let i = 0; i < frameCount; i++) {
    onProgress('Capturing frames', i / frameCount);
    const base64 = await captureFrame(i);
    await FileSystem.writeAsStringAsync(`${framesDir}${frameFileName(i)}`, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  // ── 3. Encode ───────────────────────────────────────────────────────────────
  onProgress('Encoding video', 0);
  await encodeVideo(
    {
      framesDir:  toNativePath(framesDir),
      frameCount,
      fps,
      width,
      height,
      outputPath: toNativePath(silentMp4),
    },
    { onProgress: (encode) => onProgress('Encoding video', encode.progress) },
  );
  onProgress('Encoding video', 1);

  // ── 4. Mix audio (non-fatal) ─────────────────────────────────────────────
  let finalPath = silentMp4;
  if (audioTracks.length > 0 && isAudioMixSupported()) {
    onProgress('Mixing audio', 0);
    try {
      await mixAudio({
        videoPath:       toNativePath(silentMp4),
        audioTracks,
        outputPath:      toNativePath(mixedMp4),
        totalDurationMs,
      });
      finalPath = mixedMp4;
    } catch {
      // audio mix failed, continue with silent video
    }
    onProgress('Mixing audio', 1);
  }

  // ── 5. Save ─────────────────────────────────────────────────────────────────
  onProgress('Saving', 0);
  let outputUri: string | null = null;

  if (saveToLibrary) {
    const asset = await MediaLibrary.createAssetAsync(finalPath);
    outputUri = asset.uri;
  } else {
    await Sharing.shareAsync(finalPath, { mimeType: 'video/mp4' });
    outputUri = finalPath;
  }

  // ── 6. Cleanup ───────────────────────────────────────────────────────────────
  await FileSystem.deleteAsync(framesDir, { idempotent: true });
  if (finalPath !== silentMp4) {
    await FileSystem.deleteAsync(silentMp4, { idempotent: true });
  }

  onProgress('Done', 1);
  return outputUri;
}
```

---

## Example app

[`example/`](./example) is a runnable Expo app. It draws 60 JPEG frames in JavaScript, checks them with `findMissingFrames`, encodes a 2 second MP4 with `encodeVideo`, mixes in a generated tone with `mixAudio` on iOS, plays the result, and shows the typed error for an invalid width. The encoding code is in [`example/src/pipeline.ts`](./example/src/pipeline.ts).

```sh
npm ci
cd example && npm ci
npm run ios        # or: npm run android
```

It needs a development build, because Expo Go cannot load this module. See [CONTRIBUTING.md](./CONTRIBUTING.md#running-the-example-app) for details.

---

## Important: strip `file://` from paths

React Native's `expo-file-system` returns paths with a `file://` prefix (e.g. `file:///var/mobile/…`), and folder names with spaces arrive percent-encoded (`My%20Clips`). The native encoders expect plain filesystem paths. Convert with `toNativePath` before passing a path to this module:

```typescript
import { toNativePath } from 'expo-video-encoder';

const outputPath = toNativePath(FileSystem.cacheDirectory + 'export.mp4');
```

A bare `uri.replace(/^file:\/\//, '')` strips the prefix but leaves `%20` in place, which points at a folder that does not exist. This is the most common source of "file not found" errors.

---

## Performance tips

**Use the device's resolution, not higher.** Encoding at 4K on a device with a 2K screen wastes time and produces imperceptibly better output. Match your canvas size.

**Keep frames on disk, not in memory.** The JPEG → disk → native pipeline is intentional. Passing large base64 strings through the JS bridge for every frame would be slower and more memory-intensive.

**Audio mixing is a second pass.** `mixAudio` reads the silent MP4 and the audio files, mixes them, and writes a new file. Keep `totalDurationMs` accurate. If it is longer than the video, the export session will pad with silence.

**Frame capture is usually the bottleneck.** The encoding step is hardware-accelerated and fast. The slow part is typically your canvas render + snapshot loop. Optimize there first.

---

## Troubleshooting

**"File not found" during encode**
→ You passed a `file://` URI. Convert it with `toNativePath(path)`.

**"No video track in source file"**
→ `encodeVideo` failed silently and you called `mixAudio` on a corrupt/empty file. Check that `encodeVideo` resolved `true` before calling `mixAudio`.

**Video is shorter than expected, or freezes on one frame**
→ Some frame files were missing or unreadable and the encoder skipped them. Run `findMissingFrames` before `encodeVideo` to list the missing indexes.

**Frames appear in wrong order**
→ Frame files must be named with zero-padded numbers: `frame_000000.jpg`, not `frame_0.jpg`. Use `frameFileName(i)`.

**Black frames in output**
→ Your canvas wasn't done rendering when you took the snapshot. Add `await new Promise(r => requestAnimationFrame(r))` before each snapshot.

**Module not found after install**
→ Run `npx expo prebuild` to regenerate the native project so autolinking can wire up the module.

**iOS: "Cannot find native module 'VideoEncoder'"**
→ Versions up to 1.0.23 keep the podspec at the package root without telling Expo autolinking where it is, so the pod is installed but the module is never registered on iOS. Upgrade to 1.1.0 or later, then run `npx expo prebuild --clean` (or `pod install` in bare projects).

**Build error: "No such module ExpoModulesCore"**
→ `ExpoModulesCore` is a peer dependency. Make sure `expo` is installed and `npx expo prebuild` has been run.

---

## Roadmap

- [x] **Android frame encoding** via `MediaCodec` + `MediaMuxer` (`encodeVideo`)
- [ ] **Android audio mixing** (`mixAudio`) via `MediaExtractor` + `MediaMuxer`
- [x] **Progress callbacks:** per-frame encode progress from native to JS (`encodeVideo(options, { onProgress })`)
- [ ] **Quality presets:** CRF control for file size vs. quality tradeoff
- [ ] **HEVC / H.265:** smaller files at the same quality on iOS 11+
- [ ] **Frame timestamp control:** variable frame rate support

Want to contribute? Android audio mixing is now the highest-impact next step. See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Contributing

Contributions are welcome. Because you cannot push to this repo directly, contributions go through a fork and a pull request, see [CONTRIBUTING.md](./CONTRIBUTING.md) for the step-by-step flow, local setup, and the PR checklist. Android support via `MediaCodec` is the highest-impact place to start.

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md) code of conduct. Security issues should be reported privately, see [SECURITY.md](./SECURITY.md).

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## License

MIT © [AJIBADE HAMMED ADEDAPO](https://github.com/ajibadedapo)
