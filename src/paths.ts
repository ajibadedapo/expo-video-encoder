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
