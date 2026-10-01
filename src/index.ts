import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import { ExpoVideoEncoderError, fromNativeError } from './errors';
import { assertEncodeVideoOptions, assertMixAudioOptions } from './validation';

export { findMissingFrames, frameFileName, frameFilePath, toNativePath } from './paths';
export type { FrameExistsCheck } from './paths';
export { ExpoVideoEncoderError, isExpoVideoEncoderError } from './errors';
export type { ExpoVideoEncoderErrorCode, ExpoVideoEncoderNativeErrorCode } from './errors';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Options for assembling a sequence of JPEG frames into an H.264 MP4.
 */
export type EncodeVideoOptions = {
  /** Absolute filesystem path to the directory containing frame JPEGs. */
  framesDir: string;
  /** Total number of frames to encode (files must be named frame_000000.jpg … frame_NNNNNN.jpg). */
  frameCount: number;
  /** Output frame rate (e.g. 24, 30, 60). */
  fps: number;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Absolute filesystem path for the resulting .mp4 file. */
  outputPath: string;
};

export type EncodeProgress = {
  processedFrames: number;
  encodedFrames: number;
  frameCount: number;
  progress: number;
};

export type EncodeVideoProgressOptions = {
  onProgress?: (progress: EncodeProgress) => void;
};

/**
 * A single audio track to mix into the exported video.
 */
export type AudioTrack = {
  /** Absolute filesystem path to the audio file, without a file:// prefix. */
  uri: string;
  /** Millisecond offset from the start of the video at which this track begins. */
  startMs: number;
  /** Duration in milliseconds to use from this audio clip. */
  durationMs: number;
  /** Volume multiplier: 0.0 (silent) to 1.0 (full). */
  volume: number;
};

/**
 * Options for mixing one or more audio tracks onto an existing MP4.
 */
export type MixAudioOptions = {
  /** Absolute filesystem path to the source video (no audio). */
  videoPath: string;
  /** Audio tracks to mix in. */
  audioTracks: AudioTrack[];
  /** Absolute filesystem path for the resulting mixed .mp4 file. */
  outputPath: string;
  /** Total video duration in milliseconds, used to set the export time range. */
  totalDurationMs: number;
};

// ─── Platform guard ───────────────────────────────────────────────────────────

function unsupported(fn: string): never {
  throw new ExpoVideoEncoderError('UNSUPPORTED_PLATFORM', `expo-video-encoder: ${fn} is only supported on iOS and Android.`);
}

function isSupportedPlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

// ─── Module ───────────────────────────────────────────────────────────────────

type NativeEncodeProgressEvent = {
  progressId?: unknown;
  processedFrames?: unknown;
  encodedFrames?: unknown;
  frameCount?: unknown;
};

type NativeSubscription = { remove: () => void };

type NativeVideoEncoder = {
  encodeVideo: (o: EncodeVideoOptions & { progressId?: string }) => Promise<boolean>;
  mixAudio: (o: MixAudioOptions) => Promise<boolean>;
  addListener?: (eventName: string, listener: (event: NativeEncodeProgressEvent) => void) => NativeSubscription;
};

let _native: NativeVideoEncoder | null = null;
let nextProgressId = 0;
const encodeProgressEvent = 'onEncodeProgress';

function getNative(): NativeVideoEncoder {
  if (!_native) _native = requireNativeModule('VideoEncoder') as NativeVideoEncoder;
  return _native;
}

function assertProgressOptions(progressOptions: unknown): asserts progressOptions is EncodeVideoProgressOptions | undefined {
  if (progressOptions === undefined) return;
  if (!progressOptions || typeof progressOptions !== 'object') {
    throw new ExpoVideoEncoderError('INVALID_ARGUMENT', 'expo-video-encoder: encodeVideo progress options must be an object.');
  }
  const { onProgress } = progressOptions as { onProgress?: unknown };
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new ExpoVideoEncoderError('INVALID_ARGUMENT', 'expo-video-encoder: encodeVideo onProgress must be a function.');
  }
}

function toEncodeProgress(event: NativeEncodeProgressEvent, progressId: string): EncodeProgress | null {
  if (!event || event.progressId !== progressId) return null;
  const { processedFrames, encodedFrames, frameCount } = event;
  if (typeof processedFrames !== 'number' || typeof encodedFrames !== 'number' || typeof frameCount !== 'number' || frameCount <= 0) {
    return null;
  }
  return { processedFrames, encodedFrames, frameCount, progress: Math.min(1, Math.max(0, processedFrames / frameCount)) };
}

/**
 * Assembles a sequence of JPEG frames into an H.264 MP4, using AVFoundation on
 * iOS and MediaCodec + MediaMuxer on Android.
 *
 * Frame files must live in `framesDir` and follow the naming convention:
 *   frame_000000.jpg, frame_000001.jpg, …
 *
 * @returns `true` on success, throws on failure.
 *
 * @platform ios
 * @platform android
 */
export async function encodeVideo(options: EncodeVideoOptions, progressOptions?: EncodeVideoProgressOptions): Promise<boolean> {
  if (!isSupportedPlatform()) unsupported('encodeVideo');
  assertEncodeVideoOptions(options);
  assertProgressOptions(progressOptions);
  const native = getNative();
  const onProgress = progressOptions?.onProgress;
  let subscription: NativeSubscription | null = null;
  let nativeOptions: EncodeVideoOptions & { progressId?: string } = options;
  if (onProgress && typeof native.addListener === 'function') {
    const progressId = `encode-${++nextProgressId}`;
    nativeOptions = { ...options, progressId };
    subscription = native.addListener(encodeProgressEvent, (event) => {
      const progress = toEncodeProgress(event, progressId);
      if (progress) onProgress(progress);
    });
  }
  try {
    return await native.encodeVideo(nativeOptions);
  } catch (error) {
    throw fromNativeError(error);
  } finally {
    subscription?.remove();
  }
}

export function isAudioMixSupported(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Mixes one or more audio tracks onto an existing silent MP4 using
 * AVMutableComposition + AVAssetExportSession.
 *
 * Audio mix failures should be treated as non-fatal, callers can fall back
 * to the silent video if this throws. Android does not yet implement audio
 * mixing; calling this on Android throws.
 *
 * @returns `true` on success, throws on failure.
 *
 * @platform ios
 */
export async function mixAudio(options: MixAudioOptions): Promise<boolean> {
  if (!isAudioMixSupported()) {
    throw new ExpoVideoEncoderError('UNSUPPORTED_PLATFORM', 'expo-video-encoder: mixAudio is only supported on iOS.');
  }
  assertMixAudioOptions(options);
  try {
    return await getNative().mixAudio(options);
  } catch (error) {
    throw fromNativeError(error);
  }
}
