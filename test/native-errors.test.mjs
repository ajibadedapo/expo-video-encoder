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
