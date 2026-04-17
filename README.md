# expo-video-encoder

> AVFoundation-based H.264 video encoder for Expo & React Native — zero external dependencies.

Assemble a sequence of JPEG frames into an MP4, then optionally mix in audio tracks. Everything runs natively on-device using Apple's built-in AVFoundation framework.

**Why this exists:** `ffmpeg-kit-react-native` was archived in 2023 and all release binaries return 404. This is the drop-in replacement for iOS projects that need frame-level video encoding without shipping a third-party binary.

---

## Platform support

| Platform | Encode | Mix audio |
|----------|--------|-----------|
| iOS 13.4+ | ✅ | ✅ |
| Android | ❌ (throws) | ❌ (throws) |

---

## Installation

```sh
npm install expo-video-encoder
# or
yarn add expo-video-encoder
```

Then run `expo prebuild` (or `pod install` if you manage the native project yourself).

No `app.json` plugin is needed — autolinking handles everything.

---

## Usage

### Encode frames → MP4

Snapshot your canvas frame-by-frame, write each frame as a JPEG to a temp directory, then call `encodeVideo`:

```typescript
import * as FileSystem from 'expo-file-system';
import { encodeVideo } from 'expo-video-encoder';

const framesDir = `${FileSystem.cacheDirectory}frames/`;
const outputPath = `${FileSystem.cacheDirectory}output.mp4`;

// Write frame JPEGs: frame_000000.jpg, frame_000001.jpg, …
await FileSystem.makeDirectoryAsync(framesDir, { intermediates: true });
// … write frames …

const ok = await encodeVideo({
  framesDir:  framesDir.replace(/^file:\/\//, ''),  // strip file:// prefix
  frameCount: 120,
  fps:        30,
  width:      1920,
  height:     1080,
  outputPath: outputPath.replace(/^file:\/\//, ''),
});
```

Frame files **must** be named `frame_000000.jpg`, `frame_000001.jpg`, … (zero-padded to 6 digits).

### Mix audio tracks

```typescript
import { mixAudio } from 'expo-video-encoder';

await mixAudio({
  videoPath:       '/path/to/output.mp4',
  outputPath:      '/path/to/mixed.mp4',
  totalDurationMs: 4000,
  audioTracks: [
    {
      uri:        '/path/to/narration.m4a',
      startMs:    0,
      durationMs: 4000,
      volume:     1.0,
    },
    {
      uri:        '/path/to/music.mp3',
      startMs:    500,
      durationMs: 3500,
      volume:     0.4,
    },
  ],
});
```

---

## API

### `encodeVideo(options: EncodeVideoOptions): Promise<boolean>`

| Option | Type | Description |
|--------|------|-------------|
| `framesDir` | `string` | Absolute filesystem path to the JPEG frame directory |
| `frameCount` | `number` | Number of frames to encode |
| `fps` | `number` | Output frame rate (e.g. `24`, `30`, `60`) |
| `width` | `number` | Output width in pixels |
| `height` | `number` | Output height in pixels |
| `outputPath` | `string` | Absolute filesystem path for the resulting `.mp4` |

Throws on failure. Returns `true` on success.

---

### `mixAudio(options: MixAudioOptions): Promise<boolean>`

| Option | Type | Description |
|--------|------|-------------|
| `videoPath` | `string` | Absolute path to the source (silent) MP4 |
| `audioTracks` | `AudioTrack[]` | Tracks to mix in |
| `outputPath` | `string` | Absolute path for the mixed output MP4 |
| `totalDurationMs` | `number` | Total video duration in milliseconds |

**`AudioTrack`**

| Field | Type | Description |
|-------|------|-------------|
| `uri` | `string` | URI or absolute path to the audio file |
| `startMs` | `number` | Millisecond offset at which this track starts |
| `durationMs` | `number` | Milliseconds of audio to use from this clip |
| `volume` | `number` | Volume multiplier: `0.0` – `1.0` |

Throws on failure. Returns `true` on success.

---

## Notes

- Strip the `file://` prefix from paths before passing them — AVFoundation expects plain filesystem paths.
- Audio mix failure is non-fatal in most workflows. Catch the error and fall back to the silent video.
- GIF export is not supported — AVFoundation does not have a GIF encoder.

---

## License

MIT © AJIBADE HAMMED ADEDAPO
