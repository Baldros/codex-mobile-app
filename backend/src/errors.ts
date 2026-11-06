import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function getErrorPayload(error: unknown) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      error: {
        code: "invalid_request",
        message: "Request validation failed.",
        details: error.issues
      }
    };
  }

  const message = error instanceof Error ? error.message : "Unexpected error.";
  return {
    statusCode: 500,
    error: {
      code: "internal_error",
      message
    }
  };
}
