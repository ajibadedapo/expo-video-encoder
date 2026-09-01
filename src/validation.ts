import type { AudioTrack, EncodeVideoOptions, MixAudioOptions } from './index';

const fileSchemePattern = /^file:\/\//i;
const mp4PathPattern = /\.mp4$/i;
const audioPathPattern = /\.(aac|caf|m4a|mp3|wav)$/i;
const jpegPathPattern = /\.jpe?g$/i;
const maxAudioTracks = 16;

function normalizeNativePath(value: string) {
  return value.replace(/\/+$/g, '');
}

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

function assertEvenPositiveInteger(value: unknown, name: string): asserts value is number {
  assertPositiveInteger(value, name);
  if (value % 2 !== 0) {
    throw new Error(`expo-video-encoder: ${name} must be an even integer for H.264 encoding.`);
  }
}

function assertPositiveNumber(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw new Error(`expo-video-encoder: ${name} must be greater than 0.`);
  }
}

function assertFps(value: unknown): asserts value is number {
  assertPositiveNumber(value, 'fps');
  if (value > 240) {
    throw new Error('expo-video-encoder: fps must be 240 or less.');
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
  if (value !== value.trim()) {
    throw new Error(`expo-video-encoder: ${name} must not include leading or trailing whitespace.`);
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
  if (!audioPathPattern.test(track.uri.trim())) {
    throw new Error(`expo-video-encoder: audioTracks[${index}].uri must end with a supported audio extension.`);
  }
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
      throw new Error(`expo-video-encoder: audioTracks[${current.index}] must not overlap audioTracks[${previous.index}].`);
    }
  }
}

function assertAudioTracksUseDifferentInputs(tracks: AudioTrack[]) {
  const seen = new Map<string, number>();
  tracks.forEach((track, index) => {
    const uri = track.uri.trim();
    const previous = seen.get(uri);
    if (typeof previous === 'number') {
      throw new Error(`expo-video-encoder: audioTracks[${index}].uri must be different from audioTracks[${previous}].uri.`);
    }
    seen.set(uri, index);
  });
}

function assertDifferentPaths(left: string, right: string, leftName: string, rightName: string) {
  if (left.trim() === right.trim()) {
    throw new Error(`expo-video-encoder: ${leftName} must be different from ${rightName}.`);
  }
}

function assertOutputOutsideFramesDir(framesDir: string, outputPath: string) {
  const dir = normalizeNativePath(framesDir.trim());
  const output = outputPath.trim();
  if (output === dir || output.startsWith(`${dir}/`)) {
    throw new Error('expo-video-encoder: outputPath must be outside framesDir.');
  }
}

export function assertEncodeVideoOptions(options: EncodeVideoOptions) {
  if (!options || typeof options !== 'object') {
    throw new Error('expo-video-encoder: encodeVideo options must be an object.');
  }
  assertNativePath(options.framesDir, 'framesDir');
  if (jpegPathPattern.test(options.framesDir.trim())) {
    throw new Error('expo-video-encoder: framesDir must point to a directory, not a JPEG frame file.');
  }
  assertPositiveInteger(options.frameCount, 'frameCount');
  assertFps(options.fps);
  assertEvenPositiveInteger(options.width, 'width');
  assertEvenPositiveInteger(options.height, 'height');
  assertMp4Path(options.outputPath, 'outputPath');
  assertOutputOutsideFramesDir(options.framesDir, options.outputPath);
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
  if (options.audioTracks.length > maxAudioTracks) {
    throw new Error(`expo-video-encoder: audioTracks must contain ${maxAudioTracks} tracks or fewer.`);
  }
  options.audioTracks.forEach((track, index) => assertAudioTrack(track, index, options.totalDurationMs));
  assertAudioTracksUseDifferentInputs(options.audioTracks);
  assertAudioTracksDoNotOverlap(options.audioTracks);
}
