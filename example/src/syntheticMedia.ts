import { encode } from 'jpeg-js';

export type FrameSpec = {
  index: number;
  frameCount: number;
  width: number;
  height: number;
};

function hueToRgb(hue: number): [number, number, number] {
  const sector = (hue % 360) / 60;
  const rising = Math.round(255 * (sector % 1));
  const falling = 255 - rising;
  switch (Math.floor(sector)) {
    case 0:
      return [255, rising, 0];
    case 1:
      return [falling, 255, 0];
    case 2:
      return [0, 255, rising];
    case 3:
      return [0, falling, 255];
    case 4:
      return [rising, 0, 255];
    default:
      return [255, 0, falling];
  }
}

export function renderFrameJpeg({ index, frameCount, width, height }: FrameSpec): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const progress = frameCount > 1 ? index / (frameCount - 1) : 1;
  const [baseRed, baseGreen, baseBlue] = hueToRgb(progress * 300);
  const squareSize = Math.floor(height / 3);
  const squareLeft = Math.round(progress * (width - squareSize));
  const squareTop = Math.floor((height - squareSize) / 2);
  const barTop = height - Math.max(4, Math.floor(height / 24));
  const barRight = Math.round(progress * width);

  for (let y = 0; y < height; y += 1) {
    const shade = 0.35 + 0.65 * (1 - y / height);
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const insideSquare = x >= squareLeft && x < squareLeft + squareSize && y >= squareTop && y < squareTop + squareSize;
      const insideBar = y >= barTop && x < barRight;
      if (insideSquare || insideBar) {
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
      } else {
        pixels[offset] = Math.round(baseRed * shade);
        pixels[offset + 1] = Math.round(baseGreen * shade);
        pixels[offset + 2] = Math.round(baseBlue * shade);
      }
      pixels[offset + 3] = 255;
    }
  }

  return encode({ data: pixels, width, height }, 85).data;
}

export function renderToneWav(durationMs: number, frequencyHz = 440, sampleRate = 44100): Uint8Array {
  const sampleCount = Math.round((durationMs / 1000) * sampleRate);
  const dataSize = sampleCount * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const fadeSamples = Math.min(Math.round(sampleRate * 0.05), Math.floor(sampleCount / 2));
  for (let i = 0; i < sampleCount; i += 1) {
    const fade = Math.min(1, i / Math.max(1, fadeSamples), (sampleCount - 1 - i) / Math.max(1, fadeSamples));
    const sample = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * 0.4 * fade;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return bytes;
}
