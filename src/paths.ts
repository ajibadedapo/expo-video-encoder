import { ExpoVideoEncoderError } from './errors';

const maxFrameIndex = 999_999;
const fileSchemePattern = /^file:\/\//i;

export function frameFileName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > maxFrameIndex) {
    throw new ExpoVideoEncoderError('INVALID_ARGUMENT', `expo-video-encoder: frame index must be an integer from 0 to ${maxFrameIndex}.`);
  }
  return `frame_${String(index).padStart(6, '0')}.jpg`;
}

export function toNativePath(uri: string): string {
  if (typeof uri !== 'string' || uri.trim().length === 0) {
    throw new ExpoVideoEncoderError('INVALID_ARGUMENT', 'expo-video-encoder: toNativePath needs a non-empty path or file:// URI.');
  }
  const trimmed = uri.trim();
  if (!fileSchemePattern.test(trimmed)) return trimmed;
  const withoutScheme = trimmed.replace(fileSchemePattern, '').replace(/^localhost(?=\/)/i, '');
  const absolute = withoutScheme.startsWith('/') ? withoutScheme : `/${withoutScheme}`;
  try {
    return decodeURIComponent(absolute);
  } catch {
    throw new ExpoVideoEncoderError('INVALID_ARGUMENT', 'expo-video-encoder: toNativePath received a file:// URI with invalid percent-encoding.');
  }
}

export function frameFilePath(framesDir: string, index: number): string {
  const dir = toNativePath(framesDir).replace(/\/+$/g, '');
  return `${dir}/${frameFileName(index)}`;
}

const maxFrameCount = maxFrameIndex + 1;
const frameCheckBatchSize = 32;

export type FrameExistsCheck = (path: string, index: number) => boolean | Promise<boolean>;

export async function findMissingFrames(
  framesDir: string,
  frameCount: number,
  frameExists: FrameExistsCheck,
): Promise<number[]> {
  if (typeof frameCount !== 'number' || !Number.isInteger(frameCount) || frameCount < 1 || frameCount > maxFrameCount) {
    throw new ExpoVideoEncoderError('INVALID_ARGUMENT', `expo-video-encoder: findMissingFrames frameCount must be an integer from 1 to ${maxFrameCount}.`);
  }
  if (typeof frameExists !== 'function') {
    throw new ExpoVideoEncoderError('INVALID_ARGUMENT', 'expo-video-encoder: findMissingFrames needs a frameExists function.');
  }
  const dir = toNativePath(framesDir).replace(/\/+$/g, '');
  const missing: number[] = [];
  for (let start = 0; start < frameCount; start += frameCheckBatchSize) {
    const end = Math.min(start + frameCheckBatchSize, frameCount);
    const indexes = Array.from({ length: end - start }, (_, offset) => start + offset);
    const results = await Promise.all(indexes.map((index) => frameExists(`${dir}/${frameFileName(index)}`, index)));
    results.forEach((exists, offset) => {
      const index = start + offset;
      if (typeof exists !== 'boolean') {
        throw new ExpoVideoEncoderError(
          'INVALID_ARGUMENT',
          `expo-video-encoder: findMissingFrames frameExists must return a boolean, got ${typeof exists} for frame ${index}.`,
        );
      }
      if (!exists) missing.push(index);
    });
  }
  return missing;
}
