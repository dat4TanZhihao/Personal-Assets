export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly provider?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, options: { status?: number; provider?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status ?? 400;
    this.provider = options.provider;
    this.details = options.details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      provider: this.provider,
      details: this.details
    };
  }
}

export function assertCondition(condition: unknown, code: string, message: string, status = 400): asserts condition {
  if (!condition) {
    throw new ApiError(code, message, { status });
  }
}

export function notFound(resource: string, id: string) {
  return new ApiError('NOT_FOUND', `${resource} not found: ${id}`, { status: 404 });
}

export function forbidden(message = 'The requested resource belongs to another user') {
  return new ApiError('FORBIDDEN', message, { status: 403 });
}
