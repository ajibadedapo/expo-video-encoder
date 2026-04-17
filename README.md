# expo-video-encoder

[![npm version](https://img.shields.io/npm/v/expo-video-encoder.svg)](https://www.npmjs.com/package/expo-video-encoder)
[![npm downloads](https://img.shields.io/npm/dm/expo-video-encoder.svg)](https://www.npmjs.com/package/expo-video-encoder)
[![license](https://img.shields.io/npm/l/expo-video-encoder.svg)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-iOS-lightgrey.svg)](https://developer.apple.com/avfoundation/)
[![expo](https://img.shields.io/badge/expo-%3E%3D51-blue.svg)](https://expo.dev)

> Encode a sequence of JPEG frames into an H.264 MP4 — natively on iOS using AVFoundation. Zero external dependencies. No binaries to download. No servers.

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
| Writing AVFoundation yourself | This is that — already written for you. |

Apple ships a fully capable video encoder in every iPhone and iPad called **AVFoundation**. It handles H.264 encoding in hardware, supports audio mixing, and has been stable since iOS 4. This package exposes it to React Native through a lean Expo native module.

---

## Features

- **H.264 MP4 encoding** — industry-standard format, plays everywhere
- **Frame-by-frame assembly** — snapshot your canvas, Skia surface, or any pixel source
- **Audio mixing** — layer multiple audio tracks with independent start times and volumes
- **Hardware accelerated** — AVFoundation uses the device's video encoder chip
- **Zero external dependencies** — no CocoaPods binary downloads, no xcframework, no surprises
- **Expo autolinking** — install and it works, no manual native setup
- **iOS 13.4+** — covers virtually all devices in the wild today
- **TypeScript first** — full type definitions included

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
- Raw pixel arrays (RGBA) would be 4–10× larger to transfer across the JS bridge

---

## Installation

```sh
npm install expo-video-encoder
# or
yarn add expo-video-encoder
```

Then regenerate your native project:

```sh
npx expo prebuild
```

No `app.json` plugin is needed. Expo's autolinking detects the `expo-module.config.json` and wires up the native module automatically.

> **Note:** This module has no effect on Android — it throws a clear error if called on a non-iOS platform. Use a `Platform.OS === 'ios'` guard in your code.

---

## Quick start

The minimum viable video export:

```typescript
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { encodeVideo } from 'expo-video-encoder';

async function exportVideo() {
  const framesDir = `${FileSystem.cacheDirectory}frames/`;
  const outputPath = `${FileSystem.cacheDirectory}output.mp4`;

  // 1. Create the frames directory
  await FileSystem.makeDirectoryAsync(framesDir, { intermediates: true });

  // 2. Write your frames as frame_000000.jpg, frame_000001.jpg, …
  //    (see "Capturing frames" section below for how to do this with Skia)

  // 3. Encode
  await encodeVideo({
    framesDir:  framesDir.replace(/^file:\/\//, ''),
    frameCount: 60,   // number of frames you wrote
    fps:        30,
    width:      1920,
    height:     1080,
    outputPath: outputPath.replace(/^file:\/\//, ''),
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
for (let i = 0; i < totalFrames; i++) {
  // seek your animation to frame i / fps seconds
  seekTo(i / fps);
  await new Promise(r => requestAnimationFrame(r)); // let Skia render

  const base64 = await captureFrame();
  const frameName = `frame_${String(i).padStart(6, '0')}.jpg`;
  await FileSystem.writeAsStringAsync(
    `${framesDir}${frameName}`,
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

### `encodeVideo(options: EncodeVideoOptions): Promise<boolean>`

Assembles a directory of JPEG frames into an H.264 MP4 file.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `framesDir` | `string` | ✅ | Absolute filesystem path to the directory containing frame JPEGs. Must not have a `file://` prefix. |
| `frameCount` | `number` | ✅ | Total number of frames to encode. Frames must be named `frame_000000.jpg` … `frame_NNNNNN.jpg`. |
| `fps` | `number` | ✅ | Output frame rate. Common values: `24`, `30`, `60`. |
| `width` | `number` | ✅ | Output width in pixels. |
| `height` | `number` | ✅ | Output height in pixels. |
| `outputPath` | `string` | ✅ | Absolute filesystem path for the resulting `.mp4`. Must not have a `file://` prefix. |

**Returns:** `Promise<boolean>` — resolves `true` on success, throws on failure.

**Frame naming:** Frames must be zero-padded to 6 digits: `frame_000000.jpg`, `frame_000001.jpg`, etc. Gaps in the sequence are skipped silently (useful if some frames fail to capture).

---

### `mixAudio(options: MixAudioOptions): Promise<boolean>`

Mixes one or more audio tracks onto an existing silent MP4.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `videoPath` | `string` | ✅ | Absolute path to the source (silent) MP4. No `file://` prefix. |
| `audioTracks` | `AudioTrack[]` | ✅ | Tracks to mix in. |
| `outputPath` | `string` | ✅ | Absolute path for the mixed output MP4. No `file://` prefix. |
| `totalDurationMs` | `number` | ✅ | Total video duration in milliseconds. Used to set the export time range. |

**Returns:** `Promise<boolean>` — resolves `true` on success, throws on failure. Treat failure as non-fatal — fall back to the silent video.

#### `AudioTrack`

| Field | Type | Description |
|-------|------|-------------|
| `uri` | `string` | URI or absolute filesystem path to the audio file (MP3, M4A, AAC, WAV). |
| `startMs` | `number` | Millisecond offset from the start of the video at which this clip begins. |
| `durationMs` | `number` | How many milliseconds of the clip to use. |
| `volume` | `number` | Volume multiplier: `0.0` (silent) to `1.0` (full). |

---

## Complete export pipeline example

A production-ready export flow with progress reporting:

```typescript
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { encodeVideo, mixAudio } from 'expo-video-encoder';
import { Platform } from 'react-native';

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
  if (Platform.OS !== 'ios') throw new Error('Video export requires iOS');

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
    const name = `frame_${String(i).padStart(6, '0')}.jpg`;
    await FileSystem.writeAsStringAsync(`${framesDir}${name}`, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  // ── 3. Encode ───────────────────────────────────────────────────────────────
  onProgress('Encoding video', 0);
  await encodeVideo({
    framesDir:  framesDir.replace(/^file:\/\//, ''),
    frameCount,
    fps,
    width,
    height,
    outputPath: silentMp4.replace(/^file:\/\//, ''),
  });
  onProgress('Encoding video', 1);

  // ── 4. Mix audio (non-fatal) ─────────────────────────────────────────────
  let finalPath = silentMp4;
  if (audioTracks.length > 0) {
    onProgress('Mixing audio', 0);
    try {
      await mixAudio({
        videoPath:       silentMp4.replace(/^file:\/\//, ''),
        audioTracks,
        outputPath:      mixedMp4.replace(/^file:\/\//, ''),
        totalDurationMs,
      });
      finalPath = mixedMp4;
    } catch {
      // audio mix failed — continue with silent video
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

## Important: strip `file://` from paths

React Native's `expo-file-system` returns paths with a `file://` prefix (e.g. `file:///var/mobile/…`). AVFoundation expects plain filesystem paths. Always strip the prefix before passing to this module:

```typescript
const path = uri.replace(/^file:\/\//, '');
```

This is the most common source of "file not found" errors.

---

## Performance tips

**Use the device's resolution — not higher.** Encoding at 4K on a device with a 2K screen wastes time and produces imperceptibly better output. Match your canvas size.

**Keep frames on disk, not in memory.** The JPEG → disk → native pipeline is intentional. Passing large base64 strings through the JS bridge for every frame would be slower and more memory-intensive.

**Audio mixing is a second pass.** `mixAudio` reads the silent MP4 and the audio files, mixes them, and writes a new file. Keep `totalDurationMs` accurate — if it's longer than the video, the export session will pad with silence.

**Frame capture is usually the bottleneck.** The encoding step is hardware-accelerated and fast. The slow part is typically your canvas render + snapshot loop. Optimize there first.

---

## Troubleshooting

**"File not found" during encode**
→ You passed a `file://` URI. Strip it: `path.replace(/^file:\/\//, '')`

**"No video track in source file"**
→ `encodeVideo` failed silently and you called `mixAudio` on a corrupt/empty file. Check that `encodeVideo` resolved `true` before calling `mixAudio`.

**Frames appear in wrong order**
→ Frame files must be named with zero-padded numbers: `frame_000000.jpg`, not `frame_0.jpg`. Use `String(i).padStart(6, '0')`.

**Black frames in output**
→ Your canvas wasn't done rendering when you took the snapshot. Add `await new Promise(r => requestAnimationFrame(r))` before each snapshot.

**Module not found after install**
→ Run `npx expo prebuild` to regenerate the native project so autolinking can wire up the module.

**Build error: "No such module ExpoModulesCore"**
→ `ExpoModulesCore` is a peer dependency. Make sure `expo` is installed and `npx expo prebuild` has been run.

---

## Roadmap

- [ ] **Android support** via `MediaCodec` — same concept, Android's native H.264 encoder
- [ ] **Progress callbacks** — per-frame encode progress from native → JS
- [ ] **Quality presets** — CRF control for file size vs. quality tradeoff
- [ ] **HEVC / H.265** — smaller files at the same quality on iOS 11+
- [ ] **Frame timestamp control** — variable frame rate support

Want to contribute? Android support via `MediaCodec` would be the highest-impact next step. See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get started.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## License

MIT © [AJIBADE HAMMED ADEDAPO](https://github.com/ajibadedapo)
