# Contributing to expo-video-encoder

Thank you for your interest in contributing. This document covers how to set up a development environment, the project structure, and the contribution process.

---

## Project structure

```
expo-video-encoder/
├── src/
│   └── index.ts              # TypeScript JS/TS API — types + requireNativeModule
├── ios/
│   └── VideoEncoderModule.swift  # AVFoundation implementation (Swift)
├── ExpoVideoEncoder.podspec  # CocoaPods podspec
├── expo-module.config.json   # Expo autolinking config
├── package.json
├── tsconfig.json
└── build/                    # Compiled output (generated, not committed)
```

---

## Development setup

### Prerequisites

- macOS (required for iOS native development)
- Xcode 14+
- Node.js 18+
- Yarn or npm
- An Expo project to test against (React Native 0.74+, Expo SDK 51+)

### Local development

1. **Fork and clone the repo**

```sh
git clone https://github.com/ajibadedapo/expo-video-encoder.git
cd expo-video-encoder
npm install
```

2. **Link to a local Expo project for testing**

In your test app's `package.json`:
```json
{
  "dependencies": {
    "expo-video-encoder": "file:../expo-video-encoder"
  }
}
```

Then run `npx expo prebuild` in your test app to pick up the local version.

3. **Edit the Swift module**

Changes to `ios/VideoEncoderModule.swift` take effect after running `npx expo prebuild` + rebuilding the Xcode project. Open `ios/YourApp.xcworkspace` in Xcode for the fastest native iteration loop.

4. **Edit the TypeScript API**

```sh
npm run build  # compiles src/ → build/
```

---

## The highest-impact contribution: Android support

The module currently only supports iOS. The Android equivalent uses `MediaCodec` — Android's built-in hardware H.264 encoder. The API surface would be identical; only the native layer differs.

**What's needed:**

```
android/
├── build.gradle
├── src/main/
│   ├── AndroidManifest.xml
│   └── java/expo/modules/videoencoder/
│       └── VideoEncoderModule.kt    ← MediaCodec implementation
```

The Kotlin implementation would follow the same pattern:
1. Open a `MediaCodec` encoder in `CONFIGURE_FLAG_ENCODE` mode
2. For each JPEG frame: decode to `Bitmap` → draw to `Surface` input
3. Drain the output buffers into a `MediaMuxer`
4. For audio mixing: use `MediaExtractor` + `MediaMuxer` to combine tracks

**Resources:**
- [MediaCodec Android docs](https://developer.android.com/reference/android/media/MediaCodec)
- [MediaMuxer Android docs](https://developer.android.com/reference/android/media/MediaMuxer)
- [Expo modules Android guide](https://docs.expo.dev/modules/module-api/)

---

## Submitting a pull request

1. Create a branch from `main`: `git checkout -b feat/android-support`
2. Make your changes
3. Build TypeScript: `npm run build`
4. Test in a real Expo project on a physical device or simulator
5. Update `CHANGELOG.md` with a brief description under `[Unreleased]`
6. Open a PR with a clear description of what changed and why

---

## Reporting bugs

Open an issue at https://github.com/ajibadedapo/expo-video-encoder/issues

Please include:
- Expo SDK version
- React Native version
- iOS version
- A minimal reproduction (ideally a Snack or small repo)
- The full error message and stack trace
