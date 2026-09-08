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
npm install
npm run build          # compile src/ to build/
npm test               # run the test suite
npm run package:check  # build + test + verify the published package
```

Please run `npm run package:check` before opening a PR. It is the same gate CI runs, so passing it locally means CI should pass too.

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

- macOS (required for iOS native development)
- Xcode 14+
- Node.js 18+
- Yarn or npm
- An Expo project to test against (React Native 0.74+, Expo SDK 51+)

### Linking to a local Expo project for testing

In your test app's `package.json`:

```json
{
  "dependencies": {
    "expo-video-encoder": "file:../expo-video-encoder"
  }
}
```

Then run `npx expo prebuild` in the test app to pick up your local version.

### Editing the native module

Changes to `ios/VideoEncoderModule.swift` take effect after `npx expo prebuild` and rebuilding the Xcode project. Open `ios/YourApp.xcworkspace` in Xcode for the fastest native iteration loop.

### Editing the TypeScript API

```sh
npm run build  # compiles src/ to build/
```

---

## Project structure

```
expo-video-encoder/
├── src/
│   └── index.ts                  TypeScript JS/TS API (types + requireNativeModule)
├── ios/
│   └── VideoEncoderModule.swift  AVFoundation implementation (Swift)
├── test/                         node:test suites
├── scripts/                      package verification tooling
├── ExpoVideoEncoder.podspec      CocoaPods podspec
├── expo-module.config.json       Expo autolinking config
├── package.json
├── tsconfig.json
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
- iOS version and device (simulator or physical)
- A minimal reproduction (ideally a Snack or small repo)
- The full error message and stack trace

For anything security related, do **not** open a public issue. See [SECURITY.md](./SECURITY.md).
