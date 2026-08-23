# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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
