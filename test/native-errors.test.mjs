import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const swift = read('ios/VideoEncoderModule.swift');
const kotlin = read('android/src/main/java/expo/modules/videoencoder/VideoEncoderModule.kt');
const errorsSource = read('src/errors.ts');

const quotedCodes = (source, pattern) => new Set([...source.matchAll(pattern)].map((match) => match[1]));

const nativeCodeUnion = errorsSource.match(/type ExpoVideoEncoderNativeErrorCode =([^;]+);/)[1];
const typedNativeCodes = quotedCodes(nativeCodeUnion, /'([A-Z_]+)'/g);
const mappedNativeCodes = quotedCodes(errorsSource.match(/const nativeErrorCodes[^\]]+\]/)[0], /'([A-Z_]+)'/g);

test('every code the native modules reject with is typed and mapped in JavaScript', () => {
  const rejected = new Set([
    ...quotedCodes(swift, /reject\("([A-Z_]+)"/g),
    ...quotedCodes(swift, /code: "([A-Z_]+)"/g),
    ...quotedCodes(kotlin, /reject\(\s*"([A-Z_]+)"/g),
  ]);
  assert.ok(rejected.size >= 6, [...rejected].join(', '));
  for (const code of rejected) {
    assert.ok(typedNativeCodes.has(code), `${code} is missing from ExpoVideoEncoderNativeErrorCode`);
    assert.ok(mappedNativeCodes.has(code), `${code} is missing from nativeErrorCodes`);
  }
  assert.deepEqual([...typedNativeCodes].sort(), [...mappedNativeCodes].sort());
});

test('both native encoders report NO_READABLE_FRAMES when no frame could be read', () => {
  assert.match(swift, /code: "NO_READABLE_FRAMES"/);
  assert.match(kotlin, /reject\("NO_READABLE_FRAMES"/);
});

test('iOS frame timestamps keep fractional fps instead of truncating it to a whole-number time scale', () => {
  assert.doesNotMatch(swift, /CMTimeScale\(fps\)/);
  assert.match(swift, /CMTime\(seconds: Double\(frameIndex\) \/ fps, preferredTimescale: presentationTimescale\)/);
});

test('iOS encoding checks the writer status instead of waiting forever or ignoring a failed start', () => {
  assert.match(swift, /guard writer\.startWriting\(\) else/);
  assert.match(swift, /if writer\.status != \.writing/);
  assert.match(swift, /guard writer\.status == \.completed else/);
});

test('Android frame timestamps round i / fps in microseconds instead of multiplying a truncated frame duration', () => {
  assert.doesNotMatch(kotlin, /frameDurationUs/);
  assert.match(kotlin, /Math\.round\(frameIndex \* 1_000_000\.0 \/ fps\)/);
  assert.match(kotlin, /presentationTimeUs\(i, fps\)/);
  assert.match(kotlin, /presentationTimeUs\(lastFrameIndex \+ 1, fps\)/);
});

test('Android bit rate keeps fractional fps and cannot overflow Int at large sizes', () => {
  assert.doesNotMatch(kotlin, /fps\.toInt\(\)/);
  assert.match(kotlin, /width\.toDouble\(\) \* height \* fps \/ 8\)\.coerceIn\(1\.0, Int\.MAX_VALUE\.toDouble\(\)\)/);
  const intMax = 2 ** 31 - 1;
  assert.ok(8192 * 8192 * 240 > intMax, 'the old Int product overflowed before dividing by 8');
  assert.ok((8192 * 8192 * 240) / 8 <= intMax, 'the Double result fits at the largest size validation allows');
});

test('Android reports MediaMuxer failures as WRITER_FAILED and no longer ignores a failed muxer.stop()', () => {
  assert.match(kotlin, /catch \(error: MuxerFailureException\) \{\s*promise\.reject\("WRITER_FAILED"/);
  assert.match(kotlin, /muxerStep\("Could not create the MP4 muxer"\)/);
  assert.match(kotlin, /muxerStep\("Could not finish the MP4"\) \{ muxer\.stop\(\) \}/);
  assert.match(kotlin, /muxerStep\("Could not write an encoded frame to the MP4"\)/);
});

test('Android removes the partial MP4 when encoding fails, matching iOS for NO_READABLE_FRAMES', () => {
  assert.match(kotlin, /if \(!finished\) outFile\.delete\(\)/);
});

test('Android drains encoder output while waiting for an input buffer so a full encoder cannot stall', () => {
  assert.match(kotlin, /while \(inIndex < 0\) \{\s*drain\(false\)/);
});

test('both native encoders declare and send the onEncodeProgress event with the fields the JavaScript layer reads', () => {
  const indexSource = read('src/index.ts');
  assert.match(indexSource, /const encodeProgressEvent = 'onEncodeProgress'/);
  assert.match(swift, /static let encodeProgressEvent = "onEncodeProgress"/);
  assert.match(swift, /Events\(VideoEncoderModule\.encodeProgressEvent\)/);
  assert.match(kotlin, /const val ENCODE_PROGRESS_EVENT = "onEncodeProgress"/);
  assert.match(kotlin, /Events\(ENCODE_PROGRESS_EVENT\)/);
  for (const field of ['progressId', 'processedFrames', 'encodedFrames', 'frameCount']) {
    assert.match(swift, new RegExp(`"${field}":`), `Swift event is missing ${field}`);
    assert.match(kotlin, new RegExp(`"${field}" to`), `Kotlin event is missing ${field}`);
    assert.match(indexSource, new RegExp(`${field}\\?: unknown`), `NativeEncodeProgressEvent is missing ${field}`);
  }
  assert.match(swift, /options\["progressId"\] as\? String/);
  assert.match(kotlin, /options\["progressId"\] as\? String/);
});

test('both native encoders report progress for skipped frames too, at most once per percent plus the last frame', () => {
  assert.equal([...swift.matchAll(/reportProgress\(processedFrames: i \+ 1\)/g)].length, 2);
  assert.equal([...kotlin.matchAll(/reportProgress\(i \+ 1\)/g)].length, 2);
  assert.match(swift, /guard percent != lastReportedPercent \|\| processedFrames == frameCount else \{ return \}/);
  assert.match(kotlin, /if \(percent == lastReportedPercent && processedFrames != frameCount\) return/);
  assert.match(swift, /processedFrames \* 100 \/ max\(frameCount, 1\)/);
  assert.match(kotlin, /processedFrames \* 100 \/ frameCount\.coerceAtLeast\(1\)/);
});

test('both native modules expose cancelEncode as a synchronous function so it is not queued behind a running encode', () => {
  assert.match(swift, /Function\("cancelEncode"\) \{ \(cancelId: String\) in/);
  assert.doesNotMatch(swift, /AsyncFunction\("cancelEncode"\)/);
  assert.match(kotlin, /Function\("cancelEncode"\) \{ cancelId: String ->/);
  assert.doesNotMatch(kotlin, /AsyncFunction\("cancelEncode"\)/);
  assert.match(swift, /options\["cancelId"\] as\? String/);
  assert.match(kotlin, /options\["cancelId"\] as\? String/);
  const indexSource = read('src/index.ts');
  assert.match(indexSource, /cancelEncode\?: \(cancelId: string\) => void/);
  assert.match(indexSource, /cancelId/);
});

test('both native encoders check for cancellation before touching the output, for every frame, and before finishing', () => {
  assert.equal([...swift.matchAll(/try throwIfCancelled\(\)/g)].length, 1);
  assert.equal([...swift.matchAll(/try stopIfCancelled\(\)/g)].length, 3);
  assert.equal([...kotlin.matchAll(/throwIfCancelled\(isCancelled\)/g)].length, 3);
  assert.match(swift, /code: "ENCODE_CANCELLED"/);
  assert.match(kotlin, /catch \(error: EncodeCancelledException\) \{\s*promise\.reject\("ENCODE_CANCELLED"/);
});

test('a cancelled iOS encode stops the writer and removes the partial file', () => {
  assert.match(swift, /writer\.cancelWriting\(\)\s*try\? FileManager\.default\.removeItem\(at: outputURL\)\s*throw cancelled/);
});

test('both native modules forget a cancelled job id once its encode settles', () => {
  assert.match(swift, /defer \{ self\.forgetCancel\(cancelId\) \}/);
  assert.match(kotlin, /finally \{\s*if \(cancelId != null\) cancelledEncodes\.remove\(cancelId\)/);
});
