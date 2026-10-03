export type ExpoVideoEncoderNativeErrorCode =
  | 'NO_READABLE_FRAMES'
  | 'WRITER_FAILED'
  | 'ENCODE_CANCELLED'
  | 'ENCODE_ERROR'
  | 'MIX_ERROR'
  | 'MIX_UNSUPPORTED'
  | 'INVALID_ARGS';

export type ExpoVideoEncoderErrorCode =
  | 'INVALID_OPTIONS'
  | 'INVALID_ARGUMENT'
  | 'UNSUPPORTED_PLATFORM'
  | ExpoVideoEncoderNativeErrorCode;

const nativeErrorCodes: ReadonlyArray<string> = [
  'NO_READABLE_FRAMES',
  'WRITER_FAILED',
  'ENCODE_CANCELLED',
  'ENCODE_ERROR',
  'MIX_ERROR',
  'MIX_UNSUPPORTED',
  'INVALID_ARGS',
];

export class ExpoVideoEncoderError extends Error {
  readonly code: ExpoVideoEncoderErrorCode;
  readonly field: string | undefined;
  readonly cause: unknown;

  constructor(code: ExpoVideoEncoderErrorCode, message: string, field?: string, cause?: unknown) {
    super(message);
    this.name = 'ExpoVideoEncoderError';
    this.code = code;
    this.field = field;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isExpoVideoEncoderError(
  error: unknown,
  code?: ExpoVideoEncoderErrorCode,
): error is ExpoVideoEncoderError {
  return error instanceof ExpoVideoEncoderError && (code === undefined || error.code === code);
}

export function fromNativeError(error: unknown): unknown {
  if (error instanceof ExpoVideoEncoderError || !error || typeof error !== 'object') return error;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || !nativeErrorCodes.includes(code)) return error;
  const text = typeof message === 'string' && message.length > 0 ? message : code;
  return new ExpoVideoEncoderError(code as ExpoVideoEncoderNativeErrorCode, `expo-video-encoder: ${text}`, undefined, error);
}
