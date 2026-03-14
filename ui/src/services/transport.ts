import type {
  BizResponse,
  DataSourceMode,
  RequestErrorInfo,
  TransportFetchResult,
} from '../types/common';
import { toRequestErrorDisplayMessage } from '../utils/displayLabel';

const API_BASE = (import.meta.env.VITE_OBSERVABILITY_API_BASE ?? '').replace(/\/$/, '');
const API_TIMEOUT_MS = (() => {
  const raw = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 10000);
  if (!Number.isFinite(raw) || raw <= 0) return 10000;
  return Math.floor(raw);
})();

interface ExecuteBizRequestOptions<T, U = T> {
  mode: DataSourceMode;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  mockResolver: () => Promise<BizResponse<T>> | BizResponse<T>;
  normalize?: (data: T) => U;
  label: string;
}

class TimeoutRequestError extends Error {
  constructor(timeoutMs: number) {
    super(`请求超时(${timeoutMs}ms)`);
    this.name = 'TimeoutRequestError';
  }
}

class NetworkRequestError extends Error {
  constructor(message = '网络连接异常') {
    super(message);
    this.name = 'NetworkRequestError';
  }
}

class HttpRequestError extends Error {
  status: number;

  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'HttpRequestError';
    this.status = status;
  }
}

class BizRequestError extends Error {
  bizCode: number;

  constructor(bizCode: number, message: string) {
    super(message);
    this.name = 'BizRequestError';
    this.bizCode = bizCode;
  }
}

class UnknownRequestError extends Error {
  constructor(message = '未知请求异常') {
    super(message);
    this.name = 'UnknownRequestError';
  }
}

export function buildApiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export function buildAuthHeaders(): Record<string, string> {
  // Intentionally empty in this prototype. Wire real token injection here later.
  return {};
}

export function getBizMessage(payload: { message?: string; msg?: string }): string {
  return payload.message || payload.msg || '请求失败';
}

export function parseBizData<T>(payload: BizResponse<T>): T {
  if (payload.code !== 0) {
    throw new BizRequestError(payload.code, getBizMessage(payload));
  }
  if (payload.data === undefined || payload.data === null) {
    throw new BizRequestError(payload.code, '接口返回 data 为空');
  }
  return payload.data;
}

async function fetchBizPayload<T>(options: {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}): Promise<BizResponse<T>> {
  const headers: Record<string, string> = {
    ...buildAuthHeaders(),
  };

  if (options.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutTimer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildApiUrl(options.path), {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TimeoutRequestError(API_TIMEOUT_MS);
    }
    if (error instanceof TypeError) {
      throw new NetworkRequestError(error.message || '网络连接异常');
    }
    throw new UnknownRequestError(error instanceof Error ? error.message : '未知网络异常');
  } finally {
    window.clearTimeout(timeoutTimer);
  }

  if (!response.ok) {
    throw new HttpRequestError(response.status);
  }

  try {
    return (await response.json()) as BizResponse<T>;
  } catch (error) {
    throw new UnknownRequestError(error instanceof Error ? error.message : '响应解析失败');
  }
}

function classifyRequestError(error: unknown): RequestErrorInfo {
  if (error instanceof TimeoutRequestError) {
    return {
      kind: 'timeout',
      message: error.message,
    };
  }
  if (error instanceof NetworkRequestError) {
    return {
      kind: 'network',
      message: error.message,
    };
  }
  if (error instanceof HttpRequestError) {
    return {
      kind: 'http',
      message: error.message,
      status: error.status,
    };
  }
  if (error instanceof BizRequestError) {
    return {
      kind: 'biz',
      message: error.message,
      bizCode: error.bizCode,
    };
  }
  return {
    kind: 'unknown',
    message: error instanceof Error ? error.message : '未知错误',
  };
}

export async function executeBizRequest<T, U = T>(
  options: ExecuteBizRequestOptions<T, U>,
): Promise<TransportFetchResult<U>> {
  const normalize = options.normalize ?? ((data: T) => data as unknown as U);

  async function resolveFromPayload(
    resolver: () => Promise<BizResponse<T>> | BizResponse<T>,
    sourceUsed: DataSourceMode,
    warning?: string,
  ): Promise<TransportFetchResult<U>> {
    const payload = await resolver();
    return {
      data: normalize(parseBizData(payload)),
      sourceUsed,
      warning,
    };
  }

  if (options.mode === 'mock') {
    return resolveFromPayload(options.mockResolver, 'mock');
  }

  try {
    return await resolveFromPayload(
      () =>
        fetchBizPayload<T>({
          method: options.method,
          path: options.path,
          body: options.body,
        }),
      'api',
    );
  } catch (error) {
    const normalizedError = classifyRequestError(error);
    const warningMessage = toRequestErrorDisplayMessage(normalizedError, options.label);
    return resolveFromPayload(
      options.mockResolver,
      'mock',
      `${warningMessage} 原因：${normalizedError.message}`,
    );
  }
}
