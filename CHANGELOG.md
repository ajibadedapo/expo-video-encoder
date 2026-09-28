# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [1.1.0] - 2026-09-27

### Added
- Unit tests for the package entry point with the native module stubbed: platform guards, `isAudioMixSupported`, validation running before any native call, and lazy one-time native module lookup. More boundary tests for option validation and path helpers.
- `npm run typecheck`. `npm run package:check` now typechecks first, and CI runs typecheck, build, tests, and package verification as separate steps on Node 20 and 22.
- `frameFileName`, `frameFilePath`, `toNativePath`, and `isAudioMixSupported` helpers. They produce the exact `frame_000000.jpg` names the encoder reads, convert `file://` URIs (including percent-encoded folder names) to native paths, and let apps skip audio mixing where it is not implemented.
- Typed errors. Everything the JavaScript layer rejects (bad options, bad helper arguments, unsupported platforms) is now an `ExpoVideoEncoderError` with a `code` of `INVALID_OPTIONS`, `INVALID_ARGUMENT`, or `UNSUPPORTED_PLATFORM`, and for option errors a `field` naming the exact option, such as `audioTracks[1].volume`. `isExpoVideoEncoderError(error, code?)` narrows `unknown` errors in `catch` blocks. It is still an `Error` subclass and the messages are unchanged, so existing `instanceof Error` checks and message matching keep working.
- README: install steps for Expo (SDK 51+) and bare React Native (via `install-expo-modules`), a requirements table, a complete API reference that matches the exported TypeScript types and lists every validation rule, a native and JavaScript error code reference, and an honest limitations list.
- **Android support for `encodeVideo`** via `MediaCodec` (H.264) and `MediaMuxer`, matching the iOS output and API. Frames are decoded, converted to YUV, and queued with explicit presentation timestamps (`frame_index / fps`). Autolinking now covers Android through `expo-module.config.json`.

### Changed
- The npm package description now reflects Android encoding support.
- The JS platform guard now allows both iOS and Android for `encodeVideo` (previously iOS only). Non-mobile platforms still throw a clear error.

### Fixed
- `npm run build` (and therefore `prepare`, which runs on `npm pack` and `npm publish`) now deletes `build/` before compiling, so stale output from older builds can no longer end up in the published tarball. The package verifier also fails if the tarball contains `build/` files with no matching `src/` module, or any `test/` files.
- `tsconfig.json` now compiles under TypeScript 7 (the pinned dev version): set `module`/`moduleResolution` to `node16` and added an explicit `rootDir`. A clean `npm ci` previously failed in the `prepare` step because TS 7 removed `moduleResolution: "node"`, which was breaking CI.
- The package verifier now requires the Android native runtime files in the npm tarball before release.
- Reject same-file output and audio input collisions even when path casing differs on common iOS volumes.
- Reject `fps` values below 1 before native work. iOS builds its frame time scale from the whole-number part of `fps`, so values such as `0.5` produced an invalid zero time scale.
- The README no longer describes audio mixing as layering: overlapping clips have been rejected since 1.0.10, and the docs now say so. The `AudioTrack.uri` type comment now says it takes a native path, matching validation. The `mixAudio` doc comment was attached to `isAudioMixSupported` and is now on `mixAudio`.

### Notes
- `mixAudio` remains iOS only. On Android the JavaScript API rejects with `UNSUPPORTED_PLATFORM` before any native call (the native Android module itself rejects with `MIX_UNSUPPORTED` if reached directly); treat it as non-fatal and fall back to the silent video from `encodeVideo`. Android audio mixing is tracked as a follow-up.
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
