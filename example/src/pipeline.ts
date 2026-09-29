import { Directory, File, Paths } from 'expo-file-system';
import {
  encodeVideo,
  findMissingFrames,
  frameFileName,
  isAudioMixSupported,
  mixAudio,
  toNativePath,
} from 'expo-video-encoder';

import { renderFrameJpeg, renderToneWav } from './syntheticMedia';

export const exportSettings = {
  frameCount: 60,
  fps: 30,
  width: 480,
  height: 320,
};

export type PipelineResult = {
  videoUri: string;
  hasAudio: boolean;
  elapsedMs: number;
};

type Report = (message: string) => void;

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function prepareWorkspace() {
  const workspace = new Directory(Paths.cache, 'expo-video-encoder-example');
  if (workspace.exists) workspace.delete();
  workspace.create({ intermediates: true });
  const framesDir = new Directory(workspace, 'frames');
  framesDir.create();
  return { workspace, framesDir };
}

export async function runExportPipeline(report: Report): Promise<PipelineResult> {
  const startedAt = Date.now();
  const { frameCount, fps, width, height } = exportSettings;
  const totalDurationMs = Math.round((frameCount / fps) * 1000);
  const { workspace, framesDir } = prepareWorkspace();

  for (let index = 0; index < frameCount; index += 1) {
    new File(framesDir, frameFileName(index)).write(renderFrameJpeg({ index, frameCount, width, height }));
    if ((index + 1) % 10 === 0 || index + 1 === frameCount) {
      report(`Wrote ${index + 1} of ${frameCount} JPEG frames`);
      await yieldToUi();
    }
  }

  const missing = await findMissingFrames(framesDir.uri, frameCount, (_path, index) => new File(framesDir, frameFileName(index)).exists);
  if (missing.length > 0) {
    throw new Error(`Frames missing before encoding: ${missing.join(', ')}`);
  }
  report('All frames present, encoding H.264');

  const silentVideo = new File(workspace, 'silent.mp4');
  await encodeVideo({
    framesDir: toNativePath(framesDir.uri),
    frameCount,
    fps,
    width,
    height,
    outputPath: toNativePath(silentVideo.uri),
  });
  report(`Encoded ${silentVideo.size} bytes to silent.mp4`);

  if (!isAudioMixSupported()) {
    report('Audio mixing is iOS only, keeping the silent video');
    return { videoUri: silentVideo.uri, hasAudio: false, elapsedMs: Date.now() - startedAt };
  }

  const tone = new File(workspace, 'tone.wav');
  tone.write(renderToneWav(totalDurationMs));
  const mixedVideo = new File(workspace, 'with-audio.mp4');
  try {
    await mixAudio({
      videoPath: toNativePath(silentVideo.uri),
      audioTracks: [{ uri: toNativePath(tone.uri), startMs: 0, durationMs: totalDurationMs, volume: 0.8 }],
      outputPath: toNativePath(mixedVideo.uri),
      totalDurationMs,
    });
    report(`Mixed a ${totalDurationMs} ms tone into with-audio.mp4`);
    return { videoUri: mixedVideo.uri, hasAudio: true, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    report(`Audio mix failed (${describeError(error)}), falling back to the silent video`);
    return { videoUri: silentVideo.uri, hasAudio: false, elapsedMs: Date.now() - startedAt };
  }
}

export async function runInvalidOptionsDemo(): Promise<string> {
  try {
    await encodeVideo({
      framesDir: toNativePath(new Directory(Paths.cache, 'unused-frames').uri),
      frameCount: 10,
      fps: 30,
      width: 481,
      height: 320,
      outputPath: toNativePath(new File(Paths.cache, 'unused.mp4').uri),
    });
    return 'Unexpectedly succeeded';
  } catch (error) {
    return describeError(error);
  }
}

export function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, field, message } = error as { code?: unknown; field?: unknown; message?: unknown };
    const parts = [
      typeof code === 'string' ? code : undefined,
      typeof field === 'string' ? `field ${field}` : undefined,
      typeof message === 'string' ? message : undefined,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(': ');
  }
  return String(error);
}
