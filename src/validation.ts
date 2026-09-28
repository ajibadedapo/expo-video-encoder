import type { AudioTrack, EncodeVideoOptions, MixAudioOptions } from './index';
import { ExpoVideoEncoderError } from './errors';

const fileSchemePattern = /^file:\/\//i;
const absoluteNativePathPattern = /^\//;
const mp4PathPattern = /\.mp4$/i;
const audioPathPattern = /\.(aac|caf|m4a|mp3|wav)$/i;
const jpegPathPattern = /\.jpe?g$/i;
const maxAudioTracks = 16;
const maxH264Dimension = 8192;
const maxTotalDurationMs = 60 * 60 * 1000;
const minFps = 1;
const maxFps = 240;

function invalidOption(field: string | undefined, message: string) {
  return new ExpoVideoEncoderError('INVALID_OPTIONS', `expo-video-encoder: ${message}`, field);
}

function normalizeNativePath(value: string) {
  return value.replace(/\/+$/g, '').toLowerCase();
}

function assertFiniteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidOption(name, `${name} must be a finite number.`);
  }
}

function assertPositiveInteger(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
  if (!Number.isInteger(value) || value <= 0) {
    throw invalidOption(name, `${name} must be a positive integer.`);
  }
}

function assertEvenPositiveInteger(value: unknown, name: string): asserts value is number {
  assertPositiveInteger(value, name);
  if (value % 2 !== 0) {
    throw invalidOption(name, `${name} must be an even integer for H.264 encoding.`);
  }
}

function assertH264Dimension(value: unknown, name: string): asserts value is number {
  assertEvenPositiveInteger(value, name);
  if (value > maxH264Dimension) {
    throw invalidOption(name, `${name} must be ${maxH264Dimension} pixels or less for H.264 encoding.`);
  }
}

function assertEncodedVideoDuration(frameCount: number, fps: number) {
  if ((frameCount / fps) * 1000 > maxTotalDurationMs) {
    throw invalidOption('frameCount', 'frameCount and fps must produce a video of 3600000 milliseconds or less.');
  }
}

function assertPositiveNumber(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw invalidOption(name, `${name} must be greater than 0.`);
  }
}

function assertFps(value: unknown): asserts value is number {
  assertPositiveNumber(value, 'fps');
  if (value < minFps) {
    throw invalidOption('fps', `fps must be ${minFps} or greater.`);
  }
  if (value > maxFps) {
    throw invalidOption('fps', `fps must be ${maxFps} or less.`);
  }
}

function assertNonNegativeNumber(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
  if (value < 0) {
    throw invalidOption(name, `${name} must be 0 or greater.`);
  }
}

function assertNonNegativeInteger(value: unknown, name: string): asserts value is number {
  assertNonNegativeNumber(value, name);
  if (!Number.isInteger(value)) {
    throw invalidOption(name, `${name} must be an integer number of milliseconds.`);
  }
}

function assertNativePath(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidOption(name, `${name} must be a non-empty path string.`);
  }
  if (value !== value.trim()) {
    throw invalidOption(name, `${name} must not include leading or trailing whitespace.`);
  }
  if (fileSchemePattern.test(value)) {
    throw invalidOption(name, `${name} must not include a file:// prefix.`);
  }
  if (!absoluteNativePathPattern.test(value)) {
    throw invalidOption(name, `${name} must be an absolute native path.`);
  }
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw invalidOption(name, `${name} must not include . or .. path segments.`);
  }
}

function assertMp4Path(value: unknown, name: string): asserts value is string {
  assertNativePath(value, name);
  if (!mp4PathPattern.test(value.trim())) {
    throw invalidOption(name, `${name} must end with .mp4.`);
  }
}

function assertAudioTrack(track: AudioTrack, index: number, totalDurationMs: number) {
  if (!track || typeof track !== 'object') {
    throw invalidOption(`audioTracks[${index}]`, `audioTracks[${index}] must be an object.`);
  }
  assertNativePath(track.uri, `audioTracks[${index}].uri`);
  if (!audioPathPattern.test(track.uri.trim())) {
    throw invalidOption(`audioTracks[${index}].uri`, `audioTracks[${index}].uri must end with a supported audio extension.`);
  }
  assertNonNegativeInteger(track.startMs, `audioTracks[${index}].startMs`);
  assertPositiveInteger(track.durationMs, `audioTracks[${index}].durationMs`);
  assertFiniteNumber(track.volume, `audioTracks[${index}].volume`);
  if (track.volume < 0 || track.volume > 1) {
    throw invalidOption(`audioTracks[${index}].volume`, `audioTracks[${index}].volume must be between 0 and 1.`);
  }
  if (track.startMs + track.durationMs > totalDurationMs) {
    throw invalidOption(`audioTracks[${index}]`, `audioTracks[${index}] must fit within totalDurationMs.`);
  }
}

function assertAudioTracksDoNotOverlap(tracks: AudioTrack[]) {
  const windows = tracks
    .map((track, index) => ({
      index,
      startMs: track.startMs,
      endMs: track.startMs + track.durationMs,
    }))
    .sort((left, right) => left.startMs - right.startMs);

  for (let index = 1; index < windows.length; index += 1) {
    const previous = windows[index - 1];
    const current = windows[index];
    if (current.startMs < previous.endMs) {
      throw invalidOption(`audioTracks[${current.index}]`, `audioTracks[${current.index}] must not overlap audioTracks[${previous.index}].`);
    }
  }
}

function assertAudioTracksUseDifferentInputs(tracks: AudioTrack[]) {
  const seen = new Map<string, number>();
  tracks.forEach((track, index) => {
    const uri = normalizeNativePath(track.uri.trim());
    const previous = seen.get(uri);
    if (typeof previous === 'number') {
      throw invalidOption(`audioTracks[${index}].uri`, `audioTracks[${index}].uri must be different from audioTracks[${previous}].uri.`);
    }
    seen.set(uri, index);
  });
}

function assertDifferentPaths(left: string, right: string, leftName: string, rightName: string) {
  if (normalizeNativePath(left.trim()) === normalizeNativePath(right.trim())) {
    throw invalidOption(leftName, `${leftName} must be different from ${rightName}.`);
  }
}

function assertOutputOutsideFramesDir(framesDir: string, outputPath: string) {
  const dir = normalizeNativePath(framesDir.trim());
  const output = normalizeNativePath(outputPath.trim());
  if (output === dir || output.startsWith(`${dir}/`)) {
    throw invalidOption('outputPath', 'outputPath must be outside framesDir.');
  }
}

export function assertEncodeVideoOptions(options: EncodeVideoOptions) {
  if (!options || typeof options !== 'object') {
    throw invalidOption(undefined, 'encodeVideo options must be an object.');
  }
  assertNativePath(options.framesDir, 'framesDir');
  if (jpegPathPattern.test(options.framesDir.trim())) {
    throw invalidOption('framesDir', 'framesDir must point to a directory, not a JPEG frame file.');
  }
  assertPositiveInteger(options.frameCount, 'frameCount');
  assertFps(options.fps);
  assertEncodedVideoDuration(options.frameCount, options.fps);
  assertH264Dimension(options.width, 'width');
  assertH264Dimension(options.height, 'height');
  assertMp4Path(options.outputPath, 'outputPath');
  assertOutputOutsideFramesDir(options.framesDir, options.outputPath);
}

export function assertMixAudioOptions(options: MixAudioOptions) {
  if (!options || typeof options !== 'object') {
    throw invalidOption(undefined, 'mixAudio options must be an object.');
  }
  assertMp4Path(options.videoPath, 'videoPath');
  assertMp4Path(options.outputPath, 'outputPath');
  assertDifferentPaths(options.outputPath, options.videoPath, 'outputPath', 'videoPath');
  assertPositiveInteger(options.totalDurationMs, 'totalDurationMs');
  if (options.totalDurationMs > maxTotalDurationMs) {
    throw invalidOption('totalDurationMs', 'totalDurationMs must be 3600000 milliseconds or less.');
  }
  if (!Array.isArray(options.audioTracks) || options.audioTracks.length === 0) {
    throw invalidOption('audioTracks', 'audioTracks must contain at least one track.');
  }
  if (options.audioTracks.length > maxAudioTracks) {
    throw invalidOption('audioTracks', `audioTracks must contain ${maxAudioTracks} tracks or fewer.`);
  }
  options.audioTracks.forEach((track, index) => assertAudioTrack(track, index, options.totalDurationMs));
  assertAudioTracksUseDifferentInputs(options.audioTracks);
  assertAudioTracksDoNotOverlap(options.audioTracks);
}
