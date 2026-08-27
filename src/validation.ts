import type { AudioTrack, EncodeVideoOptions, MixAudioOptions } from './index';

const fileSchemePattern = /^file:\/\//i;
const mp4PathPattern = /\.mp4$/i;

function assertFiniteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`expo-video-encoder: ${name} must be a finite number.`);
  }
}

function assertPositiveInteger(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`expo-video-encoder: ${name} must be a positive integer.`);
  }
}

function assertPositiveNumber(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw new Error(`expo-video-encoder: ${name} must be greater than 0.`);
  }
}

function assertNonNegativeNumber(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
  if (value < 0) {
    throw new Error(`expo-video-encoder: ${name} must be 0 or greater.`);
  }
}

function assertNativePath(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`expo-video-encoder: ${name} must be a non-empty path string.`);
  }
  if (fileSchemePattern.test(value)) {
    throw new Error(`expo-video-encoder: ${name} must not include a file:// prefix.`);
  }
}

function assertMp4Path(value: unknown, name: string): asserts value is string {
  assertNativePath(value, name);
  if (!mp4PathPattern.test(value.trim())) {
    throw new Error(`expo-video-encoder: ${name} must end with .mp4.`);
  }
}

function assertAudioTrack(track: AudioTrack, index: number, totalDurationMs: number) {
  if (!track || typeof track !== 'object') {
    throw new Error(`expo-video-encoder: audioTracks[${index}] must be an object.`);
  }
  assertNativePath(track.uri, `audioTracks[${index}].uri`);
  assertNonNegativeNumber(track.startMs, `audioTracks[${index}].startMs`);
  assertPositiveNumber(track.durationMs, `audioTracks[${index}].durationMs`);
  assertFiniteNumber(track.volume, `audioTracks[${index}].volume`);
  if (track.volume < 0 || track.volume > 1) {
    throw new Error(`expo-video-encoder: audioTracks[${index}].volume must be between 0 and 1.`);
  }
  if (track.startMs + track.durationMs > totalDurationMs) {
    throw new Error(`expo-video-encoder: audioTracks[${index}] must fit within totalDurationMs.`);
  }
}

function assertDifferentPaths(left: string, right: string, leftName: string, rightName: string) {
  if (left.trim() === right.trim()) {
    throw new Error(`expo-video-encoder: ${leftName} must be different from ${rightName}.`);
  }
}

export function assertEncodeVideoOptions(options: EncodeVideoOptions) {
  if (!options || typeof options !== 'object') {
    throw new Error('expo-video-encoder: encodeVideo options must be an object.');
  }
  assertNativePath(options.framesDir, 'framesDir');
  assertPositiveInteger(options.frameCount, 'frameCount');
  assertPositiveNumber(options.fps, 'fps');
  assertPositiveInteger(options.width, 'width');
  assertPositiveInteger(options.height, 'height');
  assertMp4Path(options.outputPath, 'outputPath');
}

export function assertMixAudioOptions(options: MixAudioOptions) {
  if (!options || typeof options !== 'object') {
    throw new Error('expo-video-encoder: mixAudio options must be an object.');
  }
  assertMp4Path(options.videoPath, 'videoPath');
  assertMp4Path(options.outputPath, 'outputPath');
  assertDifferentPaths(options.outputPath, options.videoPath, 'outputPath', 'videoPath');
  assertPositiveNumber(options.totalDurationMs, 'totalDurationMs');
  if (!Array.isArray(options.audioTracks) || options.audioTracks.length === 0) {
    throw new Error('expo-video-encoder: audioTracks must contain at least one track.');
  }
  options.audioTracks.forEach((track, index) => assertAudioTrack(track, index, options.totalDurationMs));
}
