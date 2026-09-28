export type ExpoVideoEncoderErrorCode = 'INVALID_OPTIONS' | 'INVALID_ARGUMENT' | 'UNSUPPORTED_PLATFORM';

export class ExpoVideoEncoderError extends Error {
  readonly code: ExpoVideoEncoderErrorCode;
  readonly field: string | undefined;

  constructor(code: ExpoVideoEncoderErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ExpoVideoEncoderError';
    this.code = code;
    this.field = field;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isExpoVideoEncoderError(
  error: unknown,
  code?: ExpoVideoEncoderErrorCode,
): error is ExpoVideoEncoderError {
  return error instanceof ExpoVideoEncoderError && (code === undefined || error.code === code);
}
