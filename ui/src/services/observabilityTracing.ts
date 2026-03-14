import { buildTraceDetailMockResponse, buildTraceSummaryMockResponse, getMockTraceStoreOptions } from './mockCatalog';
import { executeBizRequest } from './transport';
import type { TimeRangeOption } from '../types/common';
import type {
  TraceDetailFetchResult,
  TraceDetailQueryData,
  TraceDetailQueryReq,
  TraceDetailSource,
  TraceExplorerFilters,
  TraceIdSearchMode,
  TraceRootStage,
  TraceSpanResp,
  TraceStatus,
  TraceSummaryFetchResult,
  TraceSummaryQueryData,
  TraceSummaryQueryReq,
  TraceSummaryResp,
} from '../types/tracing';

const DEFAULT_LIST_LIMIT = 200;
const DEFAULT_DETAIL_LIMIT = 1000;

export const TRACE_TIME_RANGE_OPTIONS: TimeRangeOption<TraceExplorerFilters['range_id']>[] = [
  { id: '15m', label: '最近 15 分钟', milliseconds: 15 * 60 * 1000 },
  { id: '1h', label: '最近 1 小时', milliseconds: 60 * 60 * 1000 },
  { id: '6h', label: '最近 6 小时', milliseconds: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '最近 24 小时', milliseconds: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '最近 7 天', milliseconds: 7 * 24 * 60 * 60 * 1000 },
];

export const TRACE_ROOT_STAGE_OPTIONS: Array<{ value: TraceRootStage; label: string }> = [
  { value: 'http.request', label: 'HTTP 请求' },
  { value: 'task', label: '定时任务' },
  { value: 'all', label: '全部 Root' },
];

export const TRACE_PAGE_SIZE_OPTIONS = [20, 50, 100];

export function createDefaultTraceFilters(): TraceExplorerFilters {
  return {
    search_id: '',
    search_mode: 'auto',
    service: '',
    status: '',
    root_stage: 'http.request',
    range_id: '1h',
    page_size: 20,
    route_hint: '',
    method_hint: '',
  };
}

export function getTraceFilterCatalog(): {
  services: string[];
  methods: string[];
} {
  const catalog = getMockTraceStoreOptions();
  return {
    services: catalog.services,
    methods: catalog.methods,
  };
}

export function detectIdType(input: string): TraceDetailSource | null {
  const normalized = input.trim();
  if (!normalized) return null;
  if (/^[a-f0-9]{32}$/i.test(normalized)) return 'trace';
  if (/^trace[-_:]/i.test(normalized)) return 'trace';
  if (/^req[-_:]/i.test(normalized) || /^task[-_:]/i.test(normalized) || /^request[-_:]/i.test(normalized)) {
    return 'request';
  }
  return 'request';
}

export function resolveSearchMode(input: string, mode: TraceIdSearchMode): TraceDetailSource | null {
  const normalized = input.trim();
  if (!normalized) return null;
  if (mode === 'trace') return 'trace';
  if (mode === 'request') return 'request';
  return detectIdType(normalized);
}

function getRangeMs(rangeId: TraceExplorerFilters['range_id']): number {
  return TRACE_TIME_RANGE_OPTIONS.find((item) => item.id === rangeId)?.milliseconds ?? 60 * 60 * 1000;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!value || value <= 0) return fallback;
  return Math.min(1000, Math.floor(value));
}

function normalizeOffset(value: number | undefined): number {
  if (!value || value <= 0) return 0;
  return Math.floor(value);
}

function normalizeSummary(raw: TraceSummaryResp): TraceSummaryResp {
  return {
    trace_id: String(raw.trace_id ?? ''),
    request_id: String(raw.request_id ?? ''),
    service: String(raw.service ?? ''),
    stage: String(raw.stage ?? ''),
    name: String(raw.name ?? ''),
    kind: String(raw.kind ?? ''),
    status: raw.status === 'error' ? 'error' : 'ok',
    error_code: String(raw.error_code ?? ''),
    message: String(raw.message ?? ''),
    start_at: raw.start_at,
    end_at: raw.end_at,
    duration_ms: Math.max(0, Number(raw.duration_ms) || 0),
    span_total: Math.max(0, Number(raw.span_total) || 0),
    error_span_total: Math.max(0, Number(raw.error_span_total) || 0),
    method: String(raw.method ?? ''),
    route_template: String(raw.route_template ?? ''),
  };
}

function normalizeSpan(raw: TraceSpanResp): TraceSpanResp {
  const safeStart = Number.isFinite(Date.parse(raw.start_at)) ? raw.start_at : new Date(0).toISOString();
  const safeEnd = Number.isFinite(Date.parse(raw.end_at))
    ? raw.end_at
    : new Date(Date.parse(safeStart) + Math.max(0, Number(raw.duration_ms) || 0)).toISOString();

  return {
    span_id: String(raw.span_id ?? ''),
    parent_span_id: String(raw.parent_span_id ?? ''),
    trace_id: String(raw.trace_id ?? ''),
    request_id: String(raw.request_id ?? ''),
    service: String(raw.service ?? ''),
    stage: String(raw.stage ?? ''),
    name: String(raw.name ?? ''),
    kind: String(raw.kind ?? ''),
    status: raw.status === 'error' ? 'error' : 'ok',
    start_at: safeStart,
    end_at: safeEnd,
    duration_ms: Math.max(0, Number(raw.duration_ms) || 0),
    error_code: String(raw.error_code ?? ''),
    message: String(raw.message ?? ''),
    tags: raw.tags ?? {},
    request_snippet: raw.request_snippet ?? '',
    response_snippet: raw.response_snippet ?? '',
    error_stack: raw.error_stack ?? '',
    error_detail_json: raw.error_detail_json ?? '',
  };
}

function normalizeSummaryData(raw: TraceSummaryQueryData): TraceSummaryQueryData {
  const list = (raw.list ?? [])
    .map((item) => normalizeSummary(item))
    .filter((item) => item.trace_id)
    .sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at));
  return {
    list,
    total: Number.isFinite(Number(raw.total)) ? Math.max(0, Number(raw.total)) : list.length,
  };
}

function normalizeDetailData(raw: TraceDetailQueryData): TraceDetailQueryData {
  const list = (raw.list ?? [])
    .map((item) => normalizeSpan(item))
    .filter((item) => item.trace_id && item.span_id)
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  return {
    list,
    total: Number.isFinite(Number(raw.total)) ? Math.max(0, Number(raw.total)) : list.length,
  };
}

export function buildTraceSummaryReq(input: {
  rangeId: TraceExplorerFilters['range_id'];
  service: string;
  status: TraceStatus;
  rootStage: TraceRootStage;
  traceId?: string;
  requestId?: string;
  limit?: number;
  offset?: number;
  now?: Date;
}): TraceSummaryQueryReq {
  const now = input.now ?? new Date();
  const rangeMs = getRangeMs(input.rangeId);
  const startAt = new Date(now.getTime() - rangeMs);
  const req: TraceSummaryQueryReq = {
    root_stage: input.rootStage,
    start_at: startAt.toISOString(),
    end_at: now.toISOString(),
    limit: normalizeLimit(input.limit, DEFAULT_LIST_LIMIT),
    offset: normalizeOffset(input.offset),
  };

  const service = input.service.trim();
  const traceId = (input.traceId ?? '').trim();
  const requestId = (input.requestId ?? '').trim();

  if (service) req.service = service;
  if (input.status) req.status = input.status;
  if (traceId) req.trace_id = traceId;
  if (requestId) req.request_id = requestId;
  return req;
}

export function buildTraceDetailReq(overrides?: Partial<TraceDetailQueryReq>): TraceDetailQueryReq {
  return {
    limit: normalizeLimit(overrides?.limit, DEFAULT_DETAIL_LIMIT),
    offset: normalizeOffset(overrides?.offset),
    include_payload: overrides?.include_payload ?? true,
    include_error_detail: overrides?.include_error_detail ?? true,
  };
}

function buildTraceDetailPath(source: TraceDetailSource, id: string, req: TraceDetailQueryReq): string {
  const params = new URLSearchParams();
  params.set('id_type', source);
  params.set('limit', String(normalizeLimit(req.limit, DEFAULT_DETAIL_LIMIT)));
  params.set('offset', String(normalizeOffset(req.offset)));
  params.set('include_payload', String(req.include_payload ?? true));
  params.set('include_error_detail', String(req.include_error_detail ?? true));
  return `/system/observability/traces/detail/${encodeURIComponent(id)}?${params.toString()}`;
}

export async function queryTraceList(args: {
  mode: 'mock' | 'api';
  req: TraceSummaryQueryReq;
}): Promise<TraceSummaryFetchResult> {
  return executeBizRequest({
    mode: args.mode,
    method: 'POST',
    path: '/system/observability/traces/query',
    body: args.req,
    mockResolver: () => buildTraceSummaryMockResponse(args.req),
    normalize: normalizeSummaryData,
    label: '链路摘要',
  });
}

export async function queryTraceDetail(args: {
  mode: 'mock' | 'api';
  source: TraceDetailSource;
  id: string;
  req: TraceDetailQueryReq;
}): Promise<TraceDetailFetchResult> {
  const normalizedId = args.id.trim();
  if (!normalizedId) {
    return {
      data: { list: [], total: 0 },
      sourceUsed: args.mode,
      warning: '空 ID 无法查询详情',
    };
  }

  return executeBizRequest({
    mode: args.mode,
    method: 'GET',
    path: buildTraceDetailPath(args.source, normalizedId, args.req),
    mockResolver: () => buildTraceDetailMockResponse(args.source, normalizedId, args.req),
    normalize: normalizeDetailData,
    label: '链路详情',
  });
}

export function applyTraceLocalHints(
  list: TraceSummaryResp[],
  hints: { methodHint?: string; routeHint?: string },
): TraceSummaryResp[] {
  const methodHint = (hints.methodHint ?? '').trim().toLowerCase();
  const routeHint = (hints.routeHint ?? '').trim().toLowerCase();
  if (!methodHint && !routeHint) return list;

  return list.filter((item) => {
    if (methodHint && !String(item.method ?? '').toLowerCase().includes(methodHint)) return false;
    if (routeHint && !String(item.route_template ?? '').toLowerCase().includes(routeHint)) return false;
    return true;
  });
}

export function toTraceDetailRoute(id: string, source: TraceDetailSource): {
  path: string;
  query: { idType: TraceDetailSource };
} {
  return {
    path: `/trace/detail/${encodeURIComponent(id)}`,
    query: { idType: source },
  };
}
