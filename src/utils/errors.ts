import type { JsonRecord, ServiceResult } from "../types/index.js";

export class AppError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly details: JsonRecord = {},
    public readonly retryable = false,
    public readonly statusCode = 400
  ) {
    super(message);
  }
}

export function errorResult<T = JsonRecord>(error: unknown): ServiceResult<T> {
  if (error instanceof AppError) {
    return {
      ok: false,
      errorCode: error.errorCode,
      message: error.message,
      details: error.details,
      retryable: error.retryable
    };
  }

  return {
    ok: false,
    errorCode: "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : "Unexpected error",
    retryable: false
  };
}
