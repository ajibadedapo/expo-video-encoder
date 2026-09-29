import { Buffer } from 'buffer';

const globalScope = globalThis as { Buffer?: typeof Buffer };

if (!globalScope.Buffer) {
  globalScope.Buffer = Buffer;
}
