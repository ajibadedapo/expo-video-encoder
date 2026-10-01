# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [1.1.0] - 2026-09-27

### Added
- Encode progress. `encodeVideo(options, { onProgress })` calls `onProgress` with `processedFrames`, `encodedFrames`, `frameCount`, and `progress` (0 to 1) while the native encoder works through the frames, on iOS and Android. Both native modules declare an `onEncodeProgress` event and send it at most once per whole percent plus once for the last frame, and skipped frames count as processed so `progress` still reaches 1. Each call passes its own job id to native code and only listens for its own events, so concurrent encodes do not mix, and the listener is removed when the promise settles. Without `onProgress` the options sent to native code are unchanged and no listener is added. A progress argument that is not an object, or an `onProgress` that is not a function, rejects with `INVALID_ARGUMENT` before native work. New types `EncodeProgress` and `EncodeVideoProgressOptions` are exported. Tests cover event forwarding, job isolation, malformed events, listener cleanup, and argument checks with the native module stubbed, and tie the event name and fields in the Swift and Kotlin modules to the JavaScript layer.
- `example/`, a runnable Expo app (not part of the npm package). It draws 60 JPEG frames in JavaScript, checks them with `findMissingFrames`, encodes them with `encodeVideo`, mixes in a generated tone with `mixAudio` where `isAudioMixSupported()` is true, plays the result with `expo-video`, and shows the typed `INVALID_OPTIONS` error for an odd width. It links the module from the repository root, so native edits show up after a rebuild.
- CI job that installs, typechecks and bundles the example app for iOS and Android on every push and pull request.
- Autolinking tests that check `expo-module.config.json` against the podspec, the Swift and Kotlin module classes, and the native module name the JavaScript layer requires.
- Unit tests for the package entry point with the native module stubbed: platform guards, `isAudioMixSupported`, validation running before any native call, and lazy one-time native module lookup. More boundary tests for option validation and path helpers.
- `npm run typecheck`. `npm run package:check` now typechecks first, and CI runs typecheck, build, tests, and package verification as separate steps on Node 20 and 22.
- `findMissingFrames(framesDir, frameCount, frameExists)`, a preflight check for the frame directory. Both native encoders skip missing or unreadable frames without an error, so an interrupted capture loop used to produce a short or gapped video with no warning. This helper calls your own file existence check for every expected `frame_NNNNNN.jpg` path and resolves the missing indexes, so an app can fail or retry before encoding. It keeps the package free of a file system dependency, rejects a check that returns a non-boolean (such as a whole file info object, which would otherwise look like "present"), and is exported with its `FrameExistsCheck` type.
- `frameFileName`, `frameFilePath`, `toNativePath`, and `isAudioMixSupported` helpers. They produce the exact `frame_000000.jpg` names the encoder reads, convert `file://` URIs (including percent-encoded folder names) to native paths, and let apps skip audio mixing where it is not implemented.
- Typed errors. Everything the JavaScript layer rejects (bad options, bad helper arguments, unsupported platforms) is now an `ExpoVideoEncoderError` with a `code` of `INVALID_OPTIONS`, `INVALID_ARGUMENT`, or `UNSUPPORTED_PLATFORM`, and for option errors a `field` naming the exact option, such as `audioTracks[1].volume`. `isExpoVideoEncoderError(error, code?)` narrows `unknown` errors in `catch` blocks. It is still an `Error` subclass and the messages are unchanged, so existing `instanceof Error` checks and message matching keep working.
- README: install steps for Expo (SDK 51+) and bare React Native (via `install-expo-modules`), a requirements table, a complete API reference that matches the exported TypeScript types and lists every validation rule, a native and JavaScript error code reference, and an honest limitations list.
- **Android support for `encodeVideo`** via `MediaCodec` (H.264) and `MediaMuxer`, matching the iOS output and API. Frames are decoded, converted to YUV, and queued with explicit presentation timestamps (`frame_index / fps`). Autolinking now covers Android through `expo-module.config.json`.

### Changed
- The npm package description now reflects Android encoding support.
- The JS platform guard now allows both iOS and Android for `encodeVideo` (previously iOS only). Non-mobile platforms still throw a clear error.

### Fixed
- **iOS fractional frame rates.** The iOS encoder built its time scale from the whole-number part of `fps`, so `29.97` was timed as 29 fps (60 frames lasted 2.07 s instead of 2.002 s) and `1.5` as 1 fps (3 frames lasted 3 s instead of 2 s). Frames are now placed on a 90 kHz clock at `i / fps` seconds, matching Android. Checked on the iOS 26.2 simulator against the previous code with 64x48 test frames.
- **iOS writer failures.** The iOS encoder ignored the result of `AVAssetWriter.startWriting()` and reported every writer problem as a bare `Failed to append frame N`. It now checks the writer before, during and after encoding, stops waiting if the writer stops accepting frames, and rejects with `WRITER_FAILED` and the reason `AVAssetWriter` gave. It also creates missing parent folders of `outputPath`, which Android already did; before, a missing folder failed on iOS with `Failed to append frame 0`.
- **Android encoder parity with the iOS fixes.** Frame timestamps are now `round(i * 1000000 / fps)` microseconds. Before, each frame was placed at `i` times a frame duration that had already been truncated to whole microseconds, so `29.97` fps drifted by about 0.67 microseconds per frame (roughly 72 ms over an hour of video). The bit rate is computed from the fractional `fps` in floating point; before, it used the whole-number part of `fps` and an `Int` product that overflowed at sizes validation allows (for example 4096x4096 at 240 fps), which gave the encoder a negative bit rate. The `MediaCodec` frame rate hint is rounded rather than truncated. The end-of-stream timestamp now follows the last frame that was actually queued, not the count of queued frames, which was earlier than the last frame whenever frames were skipped.
- **Android muxer failures.** `MediaMuxer` errors (the output file could not be opened, the track could not be added, a sample could not be written, or the file could not be finished) now reject with `WRITER_FAILED` and the step that failed, the same code iOS uses for `AVAssetWriter`. A failing `muxer.stop()` was ignored before, so `encodeVideo` could resolve `true` with an unfinished MP4. If the encoder produces no samples at all, the call now rejects instead of resolving.
- **Android partial output.** A failed Android encode, including `NO_READABLE_FRAMES`, now deletes the file at `outputPath`. Before, `MediaMuxer` left an empty or unfinished file behind. An existing `outputPath` that cannot be deleted now fails with `ENCODE_ERROR` before encoding starts.
- **Android input buffer wait.** While waiting for a free `MediaCodec` input buffer, the encoder now keeps draining encoded output. Before, it waited in a loop without draining, which can stall on encoders that hold every input buffer until their output is collected.
- **Native errors are typed.** Rejections from the native modules are now `ExpoVideoEncoderError` too, with the native code as `code` and the original error as `cause`. Both platforms report `NO_READABLE_FRAMES` when none of the frame files could be read (previously `ENCODE_ERROR`), and the codes are exported as `ExpoVideoEncoderNativeErrorCode`. A test ties every code the Swift and Kotlin modules reject with to that type.
- **iOS autolinking.** Expo autolinking only looks for a podspec one folder deep, and `ExpoVideoEncoder.podspec` sits at the package root, so the iOS module was never registered with Expo. React Native community autolinking still installed the pod, so nothing failed at install time, but `VideoEncoderModule` was missing from the generated `ExpoModulesProvider.swift`, so `encodeVideo` and `mixAudio` failed at runtime on iOS with a missing native module error. `expo-module.config.json` now sets `ios.podspecPath`. Confirmed with a fresh `expo prebuild` and `pod install` on Expo SDK 57; the autolinking releases for SDK 51 to 56 use the same one-folder-deep search and read the same `podspecPath` setting.
- `npm run build` (and therefore `prepare`, which runs on `npm pack` and `npm publish`) now deletes `build/` before compiling, so stale output from older builds can no longer end up in the published tarball. The package verifier also fails if the tarball contains `build/` files with no matching `src/` module, or any `test/` files.
- `tsconfig.json` now compiles under TypeScript 7 (the pinned dev version): set `module`/`moduleResolution` to `node16` and added an explicit `rootDir`. A clean `npm ci` previously failed in the `prepare` step because TS 7 removed `moduleResolution: "node"`, which was breaking CI.
- The package verifier now requires the Android native runtime files in the npm tarball before release.
- Reject same-file output and audio input collisions even when path casing differs on common iOS volumes.
- Reject `fps` values below 1 before native work. iOS builds its frame time scale from the whole-number part of `fps`, so values such as `0.5` produced an invalid zero time scale.
- The README no longer describes audio mixing as layering: overlapping clips have been rejected since 1.0.10, and the docs now say so. The `AudioTrack.uri` type comment now says it takes a native path, matching validation. The `mixAudio` doc comment was attached to `isAudioMixSupported` and is now on `mixAudio`.

### Notes
- `mixAudio` remains iOS only. On Android the JavaScript API rejects with `UNSUPPORTED_PLATFORM` before any native call (the native Android module itself rejects with `MIX_UNSUPPORTED` if reached directly); treat it as non-fatal and fall back to the silent video from `encodeVideo`. Android audio mixing is tracked as a follow-up.
- Encode progress has not yet been built into an app or run on a device or simulator. The Swift and Kotlin modules were type checked against minimal stand-ins for the Expo Modules API (Swift with the iOS simulator SDK, Kotlin 2.1.20 against Android API 34), and they use the `Events` and `sendEvent` APIs that Expo Modules has had since SDK 51. Only the JavaScript layer is covered by tests.
- The Android native code was verified manually before release: the packed tarball was installed into a blank Expo SDK 57 app (React Native 0.86.3) and built with Gradle (`assembleRelease`, arm64-v8a) with no Kotlin errors or warnings from this module. On an Android 16 (API 36.1) arm64 emulator, `encodeVideo` turned 6 JPEG frames into playable H.264 MP4s at 320x240 (10 fps, same size as the frames) and 640x360 (30 fps, scaled up), and `ffprobe` reported 6 frames and the expected dimensions and frame rate. It has not been tested on a physical Android device. CI still covers only JS and package checks.

---

## [1.0.23] - 2026-09-02

### Fixed
- Reject frame sequences whose `frameCount` and `fps` would encode more than one hour of video before native AVFoundation work starts.

---

## [1.0.22] - 2026-09-02

### Fixed
- Reject `mixAudio` jobs longer than one hour before native AVFoundation work starts.

---

## [1.0.21] - 2026-09-02

### Fixed
- Reject frame encoding dimensions above 8192 pixels before native H.264 work starts.

---

## [1.0.20] - 2026-09-01

### Fixed
- Reject fractional `mixAudio` start and duration values before native composition starts.

---

## [1.0.19] - 2026-09-01

### Fixed
- Reject `framesDir` values that point at a JPEG frame file before native encoding starts.

---

## [1.0.18] - 2026-08-31

### Fixed
- Reject `mixAudio` calls with more than 16 audio tracks before native AVFoundation work starts.

---

## [1.0.17] - 2026-08-31

### Fixed
- Reject frame encoding above 240 fps before native work starts, so accidental extreme frame rates fail with a clear JavaScript error.

---

## [1.0.16] - 2026-08-30

### Fixed
- Reject odd video dimensions before H.264 frame encoding starts, so callers see a clear JavaScript error instead of a native export failure.

---

## [1.0.15] - 2026-08-30

### Fixed
- Reject frame encoding outputs that are placed inside the frame input directory before native work starts.

---

## [1.0.14] - 2026-08-30

### Fixed
- Fail native frame encoding when no readable frame can be appended, instead of exporting an empty-looking success.

---

## [1.0.13] - 2026-08-29

### Fixed
- Reject native file paths with leading or trailing whitespace before iOS encoding or audio mixing starts.

---

## [1.0.12] - 2026-08-29

### Fixed
- Reject `mixAudio` audio track inputs that do not end with a supported audio-file extension before native composition starts.

---

## [1.0.11] - 2026-08-28

### Fixed
- Reject `mixAudio` calls that reuse the same audio input path across multiple tracks before native composition starts.

---

## [1.0.10] - 2026-08-27

### Fixed
- Reject overlapping `mixAudio` audio tracks before native audio composition starts.

---

## [1.0.9] - 2026-08-27

### Fixed
- Reject `mixAudio` audio track URIs with `file://` prefixes before native audio composition starts.

---

## [1.0.8] - 2026-08-27

### Fixed
- Reject `mixAudio` calls that use the same source video path and output path before native export can remove the input file.

---

## [1.0.7] - 2026-08-26

### Fixed
- Reject non-MP4 video paths and audio tracks that extend beyond the requested export duration before native AVFoundation work starts.

---

## [1.0.6] - 2026-08-26

### Added
- Added JavaScript-side option validation for frame encoding and audio mixing, so invalid paths, dimensions, frame counts, fps values, track timing, and volume fail before native AVFoundation work starts.
- Added package tests for the validation boundary and folded them into `npm run package:check`.

---

## [1.0.5] - 2026-08-25

### Fixed
- Added a release verifier that blocks stale package-lock versions and missing npm tarball contents before publish.
- Switched CI to the same package check used locally, so GitHub and npm release proof cover the same gate.

---

## [1.0.4] - 2026-08-24

### Added
- Added GitHub Actions build and package-content verification so every pushed change proves TypeScript output and npm tarball contents before release.
- Added an npm `package:check` script for the same local package-content verification used by CI.

---

## [1.0.3] - 2026-08-24

### Changed
- Added an explicit npm package file whitelist so published tarballs only include the JavaScript build, TypeScript source, iOS native module, Expo module config, podspec, and project metadata.

---

## [1.0.2] - 2026-08-23

### Fixed
- Normalized npm repository metadata so published package metadata no longer relies on npm auto-correction.

---

## [1.0.1] - 2026-08-23

### Changed
- Added the npm registry link to the README so GitHub readers can verify the published package directly.
- Cleaned public README and package-description punctuation for a more consistent npm-facing presentation.

---

## [1.0.0] - 2025-04-17

### Added
- `encodeVideo()` assembles JPEG frame sequences into H.264 MP4 using `AVAssetWriter` + `CVPixelBuffer`
- `mixAudio()` mixes multiple audio tracks onto a silent MP4 using `AVMutableComposition` + `AVAssetExportSession`
- Full TypeScript types for all options and return values
- Expo autolinking via `expo-module.config.json`
- iOS 13.4+ support
- Zero external dependencies, pure AVFoundation

### Context
Born as a replacement for `ffmpeg-kit-react-native` after the project was archived and all release binaries became permanently unavailable.
