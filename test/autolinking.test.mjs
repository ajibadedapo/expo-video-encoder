import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readText = (path) => readFileSync(new URL(path, root), 'utf8');
const config = JSON.parse(readText('expo-module.config.json'));
const pkg = JSON.parse(readText('package.json'));

test('iOS podspecPath points at a podspec that ships in the package', () => {
  const podspecPath = config.ios?.podspecPath;
  assert.equal(typeof podspecPath, 'string');
  assert.ok(podspecPath.endsWith('.podspec'));
  assert.ok(existsSync(new URL(podspecPath, root)), `${podspecPath} does not exist`);
  assert.ok(pkg.files.includes(podspecPath), `${podspecPath} is not in package.json files`);
});

test('iOS module class in the config matches the Swift module', () => {
  const swift = readText('ios/VideoEncoderModule.swift');
  for (const moduleClass of config.ios.modules) {
    assert.match(swift, new RegExp(`class ${moduleClass}\\s*:\\s*Module\\b`));
  }
});

test('Android module class in the config matches the Kotlin module', () => {
  const kotlin = readText('android/src/main/java/expo/modules/videoencoder/VideoEncoderModule.kt');
  const packageName = kotlin.match(/^package\s+([\w.]+)/m)?.[1];
  for (const qualified of config.android.modules) {
    const className = qualified.split('.').pop();
    assert.equal(qualified, `${packageName}.${className}`);
    assert.match(kotlin, new RegExp(`class ${className}\\s*:\\s*Module\\(\\)`));
  }
});

test('native modules register the name the JavaScript layer requires', () => {
  const entry = readText('src/index.ts');
  const requiredName = entry.match(/requireNativeModule\('([^']+)'\)/)?.[1];
  assert.equal(requiredName, 'VideoEncoder');
  assert.match(readText('ios/VideoEncoderModule.swift'), new RegExp(`Name\\("${requiredName}"\\)`));
  assert.match(readText('android/src/main/java/expo/modules/videoencoder/VideoEncoderModule.kt'), new RegExp(`Name\\("${requiredName}"\\)`));
});
