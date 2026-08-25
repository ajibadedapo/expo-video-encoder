import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

const failures = [];

if (lock.version !== pkg.version) failures.push(`package-lock version ${lock.version} does not match package version ${pkg.version}`);
if (lock.packages?.[""]?.version !== pkg.version) failures.push(`package-lock root package version ${lock.packages?.[""]?.version} does not match package version ${pkg.version}`);

const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
});

if (pack.status !== 0) {
  failures.push(`npm pack dry run failed: ${pack.stderr || pack.stdout}`);
} else {
  const [entry] = JSON.parse(pack.stdout);
  const files = new Set(entry.files.map((file) => file.path));
  const required = [
    "build/index.d.ts",
    "build/index.js",
    "CHANGELOG.md",
    "ExpoVideoEncoder.podspec",
    "expo-module.config.json",
    "ios/VideoEncoderModule.swift",
    "LICENSE",
    "package.json",
    "README.md",
    "src/index.ts",
  ];
  for (const file of required) {
    if (!files.has(file)) failures.push(`npm tarball is missing ${file}`);
  }
  const unexpected = entry.files
    .map((file) => file.path)
    .filter((file) => file.startsWith(".github/") || file.startsWith("scripts/") || file === "package-lock.json");
  if (unexpected.length > 0) failures.push(`npm tarball includes non-runtime files: ${unexpected.join(", ")}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`expo-video-encoder package check passed for ${pkg.version}`);
