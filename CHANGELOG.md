# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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
