# AGENTS.md

Guidance for AI coding agents. The first part is for agents adding expo-video-encoder to an app; the second is for agents working on this repository. The complete API reference and recipes are in [llms-full.txt](./llms-full.txt).

## Using expo-video-encoder in an app

### Install

```sh
npx expo install expo-video-encoder
npx expo prebuild
```

It ships native code: it does not run in Expo Go or on the web, and an over the air update cannot add it. Use a development build (`npx expo run:ios`, `npx expo run:android`). Bare React Native needs `npx install-expo-modules@latest` first, then `npx pod-install`. No config plugin is needed.

### Imports

Everything comes from the package root; there are no subpath or platform-specific imports:

```ts
import { encodeVideo, mixAudio, isAudioMixSupported, frameFileName, frameFilePath, toNativePath, findMissingFrames, isExpoVideoEncoderError } from 'expo-video-encoder';
```

### Option vocabulary

- `encodeVideo({ framesDir, frameCount, fps, width, height, outputPath }, { onProgress?, signal? })`: iOS and Android.
  - `framesDir`: native directory path holding `frame_000000.jpg` to `frame_<frameCount - 1>.jpg`.
  - `frameCount`: positive integer; `fps`: 1 to 240; `width`, `height`: even integers, 2 to 8192; `outputPath`: native path ending in `.mp4`, outside `framesDir`.
- `mixAudio({ videoPath, audioTracks: [{ uri, startMs, durationMs, volume }], outputPath, totalDurationMs })`: iOS only. 1 to 16 non-overlapping tracks (`.aac`, `.caf`, `.m4a`, `.mp3`, `.wav`), `volume` 0 to 1, integer milliseconds.
- Errors are `ExpoVideoEncoderError` with `code` (`INVALID_OPTIONS`, `INVALID_ARGUMENT`, `UNSUPPORTED_PLATFORM`, `NO_READABLE_FRAMES`, `WRITER_FAILED`, `ENCODE_CANCELLED`, `ENCODE_ERROR`, `MIX_ERROR`, `MIX_UNSUPPORTED`, `INVALID_ARGS`) and `field` for option errors.

### Common recipes

Write frames, then encode:

```ts
const framesDir = new Directory(Paths.cache, 'frames');
framesDir.create({ intermediates: true });
jpegs.forEach((bytes, i) => new File(framesDir, frameFileName(i)).write(bytes));
const output = new File(Paths.cache, 'video.mp4');
await encodeVideo({ framesDir: toNativePath(framesDir.uri), frameCount: jpegs.length, fps: 30, width: 1080, height: 1920, outputPath: toNativePath(output.uri) });
```

Progress and cancel:

```ts
const controller = new AbortController();
await encodeVideo(options, { onProgress: ({ progress }) => setProgress(progress), signal: controller.signal });
```

Audio on iOS, silent video elsewhere or on failure:

```ts
let finalPath = silentPath;
if (isAudioMixSupported()) {
  try {
    await mixAudio({ videoPath: silentPath, audioTracks: [{ uri: toNativePath(music.uri), startMs: 0, durationMs, volume: 0.8 }], outputPath: mixedPath, totalDurationMs: durationMs });
    finalPath = mixedPath;
  } catch {}
}
```

Check frames first and branch on error codes:

```ts
const missing = await findMissingFrames(framesDir.uri, frameCount, (_path, i) => new File(framesDir, frameFileName(i)).exists);
if (isExpoVideoEncoderError(error, 'INVALID_OPTIONS')) console.warn(error.field, error.message);
```

More, including Skia frame capture: [llms-full.txt](./llms-full.txt).

### Pitfalls

- Always pass paths through `toNativePath`. `file://` URIs are rejected, and stripping the prefix by hand leaves `%20` in folder names.
- Name frames with `frameFileName(i)`, numbered from 0 without gaps. Missing frames are skipped silently, which shortens the video; use `findMissingFrames` to fail fast.
- `width` and `height` must be even; frames are stretched to that size, so capture at the same aspect ratio.
- Wait a frame (`requestAnimationFrame`) before each canvas snapshot to avoid black frames.
- `mixAudio` is iOS only, cannot overlap clips and should never fail the export: keep the silent MP4 on error.
- Match errors on `code` and `field`, never on message text.
- Do not reach for FFmpeg, `ffmpeg-kit-react-native` or server-side encoding.

## Working on this repository

### Layout

- `src/`: the TypeScript API (`index.ts`), option validation (`validation.ts`), path helpers (`paths.ts`) and errors (`errors.ts`). Built to `build/` with `tsc`.
- `ios/VideoEncoderModule.swift`: AVFoundation encoder and audio mixer. `android/.../VideoEncoderModule.kt`: MediaCodec encoder.
- `test/`: `node --test` suites against the built output. `example/`: runnable Expo app. `scripts/verify-package.mjs`: checks the npm tarball contents.

### Commands

```sh
npm ci
npm run typecheck
npm run build
npm test                 # node --test test/*.test.mjs, needs a build first
npm run package:check    # typecheck, build, test and verify the npm tarball (what CI and release run)
cd example && npm ci && npm run typecheck && npm run bundle
```

CI runs `package:check` steps on Node 20 and 22, typechecks and bundles the example app, and compiles the Android module inside a fresh Expo app. There is no linter; follow `.editorconfig`.

### Conventions

- Validate every option in JavaScript before native work and throw `ExpoVideoEncoderError` with a `code` and the option `field`. Keep JS and native error codes in sync with the README tables.
- Keep the iOS and Android output identical for the same input.
- Do not change the `version` in `package.json` unless you are cutting a release: a push to `main` that changes it publishes to npm. Add release notes to `CHANGELOG.md` under `## [x.y.z]` when you do.
- No em dashes in docs or code.
- When the API changes, update README.md, llms-full.txt and this file together, from the source and types.
