import { createBackend } from '../../shared/src/backend';
import { ApiError } from '../../shared/src/errors';
import type { BackendContext, BackendHandlers } from '../../shared/src/types';
import { getWebRepository } from '../../shared/src/repositories/web';
import { requireSession } from './auth';

let backend: BackendHandlers | undefined;

export function getWebBackend(): BackendHandlers {
  if (!backend) {
    backend = createBackend({ repo: getWebRepository() });
  }
  return backend;
}

export function resetWebBackendForTests(next?: BackendHandlers): void {
  backend = next;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) {
    return {};
  }
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    throw new ApiError('INVALID_JSON', 'Request body must be valid JSON', { status: 400 });
  }
}

export function contextFromRequest(request: Request): BackendContext {
  const session = requireSession(request);
  return { userId: session.userId };
}

export async function jsonData<T>(data: T, init?: ResponseInit): Promise<Response> {
  return json({ data }, init);
}

export async function jsonError(error: unknown): Promise<Response> {
  const normalized = normalizeError(error);
  return json({
    error: {
      code: normalized.code,
      message: normalized.message
    }
  }, { status: normalized.status });
}

export function json(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {})
    }
  });
}

export async function handleApi<T>(handler: () => Promise<T>, init?: ResponseInit): Promise<Response> {
  try {
    return jsonData(await handler(), init);
  } catch (error) {
    return jsonError(error);
  }
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof Error && error.name === 'SyntaxError') {
    return new ApiError('INVALID_JSON', 'Request body must be valid JSON', { status: 400 });
  }
  return new ApiError('INTERNAL_ERROR', 'Internal server error', { status: 500 });
}
