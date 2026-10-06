---
name: expo-video-encoder
description: Use when an Expo or React Native app needs to turn frames, a canvas, a Skia drawing or an animation into an MP4 video on device, or add audio to that video, with the expo-video-encoder package. Triggers include "encode video frames to MP4 in Expo", "export a video from React Native", "make an MP4 from images on iOS or Android", "replace ffmpeg-kit-react-native", "H.264 encoder for Expo", "render a Skia animation to video", "add music to the exported video", and any code importing expo-video-encoder.
---

# expo-video-encoder

Native H.264 MP4 encoding from JPEG frames on disk for Expo and React Native: AVFoundation on iOS, MediaCodec on Android, audio mixing on iOS. No FFmpeg.

## Steps

1. Install: `npx expo install expo-video-encoder`, then make a development build (`npx expo run:ios` or `npx expo run:android`). It does not run in Expo Go or on the web.
2. Write each frame as a JPEG named `frameFileName(i)` (`frame_000000.jpg`, numbered from 0) into one directory, for example with `expo-file-system` (`new File(framesDir, frameFileName(i)).write(jpegBytes)`).
3. Optionally check for gaps with `findMissingFrames(framesDir.uri, frameCount, exists)`.
4. Call `encodeVideo({ framesDir, frameCount, fps, width, height, outputPath }, { onProgress, signal })` with every path converted by `toNativePath(uri)`, even `width` and `height`, and `outputPath` ending in `.mp4` outside `framesDir`.
5. On iOS, when audio is needed, check `isAudioMixSupported()` and call `mixAudio`; keep the silent video if it throws.
6. Handle errors with `isExpoVideoEncoderError(error, code)` and the `field` property.

## Recipes

Read the recipes in https://raw.githubusercontent.com/ajibadedapo/expo-video-encoder/main/llms-full.txt (section "Recipes") before writing code. They cover: frames to MP4, capturing frames from a Skia canvas, a progress bar with a cancel button, adding audio on iOS with a silent fallback, and failing fast on missing frames.

## Do not

- Do not pass `file://` URIs or strip the prefix by hand; use `toNativePath`.
- Do not use odd dimensions, PNG frames, in-memory frames or unpadded names like `frame_1.jpg`.
- Do not call `mixAudio` on Android or let an audio failure fail the export.
- Do not add FFmpeg, `ffmpeg-kit-react-native` or a server encoder.
- Do not bump the package version when contributing; a version change on `main` publishes a release.
