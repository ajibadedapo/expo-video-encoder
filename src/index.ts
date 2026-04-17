import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

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

/**
 * A single audio track to mix into the exported video.
 */
export type AudioTrack = {
  /** URI or absolute filesystem path to the audio file. */
  uri: string;
  /** Millisecond offset from the start of the video at which this track begins. */
  startMs: number;
  /** Duration in milliseconds to use from this audio clip. */
  durationMs: number;
  /** Volume multiplier — 0.0 (silent) to 1.0 (full). */
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
  /** Total video duration in milliseconds — used to set the export time range. */
  totalDurationMs: number;
};

// ─── Platform guard ───────────────────────────────────────────────────────────

function unsupported(fn: string): never {
  throw new Error(`expo-video-encoder: ${fn} is only supported on iOS.`);
}

// ─── Module ───────────────────────────────────────────────────────────────────

let _native: { encodeVideo: (o: EncodeVideoOptions) => Promise<boolean>; mixAudio: (o: MixAudioOptions) => Promise<boolean> } | null = null;

function getNative() {
  if (!_native) _native = requireNativeModule('VideoEncoder');
  return _native;
}

/**
 * Assembles a sequence of JPEG frames into an H.264 MP4 using AVFoundation.
 *
 * Frame files must live in `framesDir` and follow the naming convention:
 *   frame_000000.jpg, frame_000001.jpg, …
 *
 * @returns `true` on success, throws on failure.
 *
 * @platform ios
 */
export async function encodeVideo(options: EncodeVideoOptions): Promise<boolean> {
  if (Platform.OS !== 'ios') unsupported('encodeVideo');
  return getNative()!.encodeVideo(options);
}

/**
 * Mixes one or more audio tracks onto an existing silent MP4 using
 * AVMutableComposition + AVAssetExportSession.
 *
 * Audio mix failures should be treated as non-fatal — callers can fall back
 * to the silent video if this throws.
 *
 * @returns `true` on success, throws on failure.
 *
 * @platform ios
 */
export async function mixAudio(options: MixAudioOptions): Promise<boolean> {
  if (Platform.OS !== 'ios') unsupported('mixAudio');
  return getNative()!.mixAudio(options);
}
