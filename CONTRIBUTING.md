# Contributing to expo-video-encoder

Thanks for your interest in contributing. Bug reports, docs fixes, and pull requests are all welcome. This guide covers how to report issues, set up a development environment, and open a pull request that gets merged quickly.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Ways to contribute

- **Report a bug:** open an [issue](https://github.com/ajibadedapo/expo-video-encoder/issues/new/choose) using the Bug report form.
- **Request a feature:** open an issue using the Feature request form.
- **Improve the docs:** typo fixes and clearer explanations are genuinely valued and easy to merge.
- **Write code:** fix a bug or pick up a roadmap item (see below). For anything large, open an issue first so we can agree on the approach before you spend time on it.

### Highest-impact contribution: Android audio mixing

Android frame encoding (`encodeVideo`) has landed. It lives in `android/src/main/java/expo/modules/videoencoder/VideoEncoderModule.kt` and uses `MediaCodec` (H.264, `COLOR_FormatYUV420Flexible`) feeding a `MediaMuxer`, matching the iOS output. It still needs broad on-device testing across encoders, so bug reports and fixes there are welcome.

The remaining Android gap is **`mixAudio`**. On Android it currently throws `MIX_UNSUPPORTED`, which callers treat as non-fatal (they fall back to the silent video). A full implementation combines multiple non-overlapping audio tracks, with per-track volume, onto the encoded video:

1. Copy the encoded video track from the source MP4 into the output.
2. For each audio track: decode with `MediaExtractor` + a `MediaCodec` decoder to PCM, apply the track volume, and place it at its `startMs` offset.
3. Re-encode the combined audio to AAC and mux it alongside the video with `MediaMuxer`.

Mind memory for long videos: mix in streamed chunks rather than buffering the whole PCM timeline. The JS validation layer already guarantees tracks do not overlap and stay within `totalDurationMs`, which simplifies the timeline.

Resources: [MediaCodec](https://developer.android.com/reference/android/media/MediaCodec) · [MediaMuxer](https://developer.android.com/reference/android/media/MediaMuxer) · [MediaExtractor](https://developer.android.com/reference/android/media/MediaExtractor) · [Expo modules Android guide](https://docs.expo.dev/modules/module-api/).

---

## The pull request workflow (fork based)

You do **not** have push access to this repository, and you do not need it. Like almost every open-source project, contributions come in through a fork and a pull request. If you tried `git push origin your-branch` against this repo and saw `Permission denied`, this is the flow you want instead.

### 1. Fork the repository

Click **Fork** at the top of [the repo page](https://github.com/ajibadedapo/expo-video-encoder). That creates `https://github.com/<your-username>/expo-video-encoder` under your own account, which you can push to freely.

### 2. Clone your fork (not the original)

```sh
git clone https://github.com/<your-username>/expo-video-encoder.git
cd expo-video-encoder
```

### 3. Add the original repo as `upstream`

This lets you keep your fork in sync with the main project.

```sh
git remote add upstream https://github.com/ajibadedapo/expo-video-encoder.git
git remote -v
# origin    https://github.com/<your-username>/expo-video-encoder.git (your fork, you can push here)
# upstream  https://github.com/ajibadedapo/expo-video-encoder.git      (the original, read only)
```

### 4. Create a branch off an up-to-date `main`

```sh
git fetch upstream
git checkout -b feat/android-support upstream/main
```

Use a descriptive branch name: `feat/...` for features, `fix/...` for bug fixes, `docs/...` for documentation.

### 5. Make your changes and validate locally

```sh
npm ci
npm run package:check  # typecheck + build + test + verify the published package
```

Please run `npm run package:check` before opening a PR. It runs the same steps as the Build workflow. The Android workflow additionally compiles the Kotlin module inside a fresh Expo app. See [Development setup](#development-setup) for running the module on a device.

### 6. Commit and push to your fork

```sh
git add .
git commit -m "feat: add Android MediaCodec encoder"
git push origin feat/android-support
```

Here `origin` is **your fork**, which you have permission to push to.

### 7. Open the pull request

Go to your fork on GitHub. It will offer a **Compare & pull request** button. Open the PR against `ajibadedapo/expo-video-encoder`'s `main` branch, fill in the template, and submit.

### 8. Keep your branch current (if asked)

If `main` moves while your PR is open:

```sh
git fetch upstream
git rebase upstream/main
git push --force-with-lease origin feat/android-support
```

---

## Development setup

### Prerequisites

- Node.js 20 or 22 (the versions CI runs)
- npm (the repo ships a `package-lock.json`, so use `npm ci` for a clean install)
- For iOS native work: macOS with Xcode
- For Android native work: JDK 17 and the Android SDK (Android Studio is the easiest way to get both)
- A host Expo app to run the module in (Expo SDK 51+, React Native 0.74+). Expo Go cannot load this module; you need a development build.

### Everyday commands

```sh
npm ci
npm run typecheck      # tsc --noEmit over src/
npm run build          # clean build/ and compile src/ to build/
npm test               # unit tests against build/, no device needed
npm run package:check  # typecheck + build + test + tarball verification (what CI runs)
```

`npm test` runs the compiled output in `build/`, so run `npm run build` first after editing `src/`.

### Unit tests

Tests live in `test/*.test.mjs` and use the built-in `node:test` runner, so there are no test dependencies to install.

- `test/paths.test.mjs` and `test/boundaries.test.mjs` cover the path helpers (`frameFileName`, `frameFilePath`, `toNativePath`) and the option validation in `src/validation.ts`, including limits and edge cases.
- `test/validation.test.mjs` covers the rejection paths that protect native code from unsafe input.
- `test/index.test.mjs` loads the real package entry with `react-native` and `expo-modules-core` replaced by in-memory stubs. It checks the platform guards, `isAudioMixSupported`, that invalid options are rejected before the native module is called, and that valid options reach it unchanged.

These tests do not exercise AVFoundation or MediaCodec. Native behavior still needs a run in a host app, described below.

### Package verification

`scripts/verify-package.mjs` runs `npm pack --dry-run` and fails if the tarball is missing a runtime file (JS build, Swift, Kotlin, podspec, autolinking config), includes development files (`test/`, `scripts/`, `.github/`, the lockfile), includes `build/` output with no matching `src/` module, or if `package-lock.json` has a different version from `package.json`.

### Running the module in a host app

There is no example app in this repository. Use a throwaway Expo app next to your clone, the same way the Android CI job does:

```sh
cd expo-video-encoder && npm ci && npm pack && cd ..
npx create-expo-app@latest host --template blank
cd host
npm install ../expo-video-encoder/expo-video-encoder-*.tgz
npx expo prebuild
npx expo run:ios       # or: npx expo run:android
```

Installing the packed tarball tests exactly what npm users get. For a faster edit loop, depend on the folder instead (`"expo-video-encoder": "file:../expo-video-encoder"`) and rerun `npx expo prebuild` after native changes.

To exercise the API, write JPEGs named with `frameFileName(i)` into a cache folder (for example with `expo-file-system`), pass the folder through `toNativePath`, and call `encodeVideo`. Guard `mixAudio` with `isAudioMixSupported()`. The README has a full walkthrough.

### Editing the native code

- iOS: `ios/VideoEncoderModule.swift`. After `npx expo prebuild`, open `host/ios/*.xcworkspace` in Xcode for the fastest iteration loop.
- Android: `android/src/main/java/expo/modules/videoencoder/VideoEncoderModule.kt`. Open `host/android` in Android Studio, or compile the module alone with `./gradlew :expo-video-encoder:compileDebugKotlin`.

When you change native behavior, say in the PR which platform, device or simulator, and OS version you ran it on.

---

## Project structure

```
expo-video-encoder/
├── src/
│   ├── index.ts                  Public API, platform guards, native module binding
│   ├── paths.ts                  frameFileName, frameFilePath, toNativePath
│   └── validation.ts             Option validation that runs before native work
├── ios/
│   └── VideoEncoderModule.swift  AVFoundation implementation (encodeVideo, mixAudio)
├── android/
│   ├── build.gradle
│   └── src/main/java/expo/modules/videoencoder/
│       └── VideoEncoderModule.kt MediaCodec + MediaMuxer implementation (encodeVideo)
├── test/                         node:test suites (not published)
├── scripts/verify-package.mjs    npm tarball verification (not published)
├── .github/workflows/            Build (JS + package) and Android (Gradle compile) CI
├── ExpoVideoEncoder.podspec      CocoaPods podspec
├── expo-module.config.json       Expo autolinking config
└── build/                        Compiled output (generated, not committed)
```

---

## Pull request checklist

Before you request review, confirm:

- [ ] The change is focused. One logical change per PR.
- [ ] `npm run package:check` passes locally.
- [ ] New behavior is covered by a test where practical, and tested in a real Expo project on a device or simulator for native changes.
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`.
- [ ] Docs (README/API reference) are updated if the public API changed.
- [ ] The PR description explains what changed and why.

Maintainers aim to give a first response within a few days. A green CI run and a filled-in template make review fast.

---

## Commit messages

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add HEVC output option
fix: strip file:// prefix before passing paths to AVFoundation
docs: clarify the fork based contribution flow
```

This is a preference, not a hard gate. Clear history matters more than exact syntax.

---

## Reporting bugs

Open an issue at https://github.com/ajibadedapo/expo-video-encoder/issues and include:

- `expo-video-encoder` version
- Expo SDK version
- React Native version
- Platform (iOS or Android), OS version, and device (physical, simulator, or emulator)
- The options you passed to `encodeVideo` or `mixAudio`
- A minimal reproduction (ideally a Snack or small repo)
- The full error message and stack trace

For anything security related, do **not** open a public issue. See [SECURITY.md](./SECURITY.md).
