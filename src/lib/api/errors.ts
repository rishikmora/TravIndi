import type { ApiErrorBodyDto, FastApiValidationBodyDto } from '@/types/api';

export type ApiErrorKind =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'bad_gateway'
  | 'unavailable'
  | 'gateway_timeout'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'unknown';

const STATUS_KINDS: Record<number, ApiErrorKind> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'validation',
  429: 'rate_limited',
  500: 'server',
  502: 'bad_gateway',
  503: 'unavailable',
  504: 'gateway_timeout',
};

const RETRYABLE: ReadonlySet<ApiErrorKind> = new Set([
  'rate_limited',
  'server',
  'bad_gateway',
  'unavailable',
  'gateway_timeout',
  'network',
  'timeout',
]);

/**
 * The single error type every repository throws. Components decide what to
 * show from `kind` (and `describeError`), never from raw status codes.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  /** Field-level validation messages keyed by camelCase field path. */
  readonly fieldErrors: Record<string, string>;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;
  /** Server version on 409 conflicts, when provided. */
  readonly currentVersion: number | null;

  constructor(init: {
    kind: ApiErrorKind;
    message: string;
    status?: number | null;
    code?: string | null;
    fieldErrors?: Record<string, string>;
    retryAfterSeconds?: number | null;
    requestId?: string | null;
    currentVersion?: number | null;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.fieldErrors = init.fieldErrors ?? {};
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.requestId = init.requestId ?? null;
    this.currentVersion = init.currentVersion ?? null;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

const camelPath = (segments: Array<string | number>) =>
  segments
    .filter((s) => s !== 'body' && s !== 'query' && s !== 'path')
    .map((s) => String(s).replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()))
    .join('.');

function isErrorEnvelope(body: unknown): body is ApiErrorBodyDto {
  return Boolean(body && typeof body === 'object' && 'error' in body && typeof (body as ApiErrorBodyDto).error === 'object');
}

function isFastApiBody(body: unknown): body is FastApiValidationBodyDto {
  return Boolean(body && typeof body === 'object' && 'detail' in body);
}

export function normalizeHttpError(status: number, body: unknown, headers?: Headers | null): ApiError {
  const kind = STATUS_KINDS[status] ?? (status >= 500 ? 'server' : 'unknown');
  const retryHeader = headers?.get('retry-after');
  const requestIdHeader = headers?.get('x-request-id');

  if (isErrorEnvelope(body)) {
    const { error } = body;
    const fieldErrors: Record<string, string> = {};
    for (const detail of error.details ?? []) {
      if (detail.field) fieldErrors[camelPath(detail.field.split('.'))] = detail.issue;
    }
    return new ApiError({
      kind,
      status,
      code: error.code,
      message: error.message,
      fieldErrors,
      retryAfterSeconds: error.retry_after_seconds ?? (retryHeader ? Number(retryHeader) : null),
      requestId: error.request_id ?? requestIdHeader ?? null,
      currentVersion: error.current_version ?? null,
    });
  }

  if (isFastApiBody(body)) {
    const fieldErrors: Record<string, string> = {};
    let message = 'The request could not be processed.';
    if (Array.isArray(body.detail)) {
      for (const item of body.detail) fieldErrors[camelPath(item.loc)] = item.msg;
      message = body.detail[0]?.msg ?? message;
    } else if (typeof body.detail === 'string') {
      message = body.detail;
    }
    return new ApiError({ kind, status, code: null, message, fieldErrors, requestId: requestIdHeader ?? null });
  }

  return new ApiError({
    kind,
    status,
    message: `Request failed with status ${status}.`,
    retryAfterSeconds: retryHeader ? Number(retryHeader) : null,
    requestId: requestIdHeader ?? null,
  });
}

export function normalizeThrown(error: unknown, timedOut = false): ApiError {
  if (isApiError(error)) return error;
  if (timedOut) return new ApiError({ kind: 'timeout', message: 'The request timed out.', cause: error });
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError({ kind: 'aborted', message: 'The request was cancelled.', cause: error });
  }
  if (error instanceof TypeError) {
    return new ApiError({ kind: 'network', message: 'Network request failed.', cause: error });
  }
  return new ApiError({ kind: 'unknown', message: 'Something unexpected happened.', cause: error });
}
