import { buildMetricsMockResponse, getMockTraceStoreOptions } from './mockCatalog';
import { executeBizRequest } from './transport';
import type {
  MetricsFetchResult,
  MetricsFilters,
  MetricsGranularity,
  MetricsPoint,
  MetricsQueryData,
  MetricsQueryInput,
  MetricsQueryReq,
} from '../types/metrics';
import type { TimeRangeOption } from '../types/common';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const METRICS_TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { id: '15m', label: '最近 15 分钟', milliseconds: 15 * 60 * 1000 },
  { id: '1h', label: '最近 1 小时', milliseconds: 60 * 60 * 1000 },
  { id: '6h', label: '最近 6 小时', milliseconds: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '最近 24 小时', milliseconds: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '最近 7 天', milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '最近 30 天', milliseconds: THIRTY_DAYS_MS },
];

function getTimeRangeMs(rangeId: MetricsQueryInput['rangeId']): number {
  return METRICS_TIME_RANGE_OPTIONS.find((item) => item.id === rangeId)?.milliseconds ?? 60 * 60 * 1000;
}

export function mapMetricsGranularity(rangeMs: number): MetricsGranularity {
  if (rangeMs <= 60 * 60 * 1000) return '1m';
  if (rangeMs < SEVEN_DAYS_MS) return '5m';
  if (rangeMs < THIRTY_DAYS_MS) return '1d';
  return '1w';
}

export function getMetricsBucketSeconds(granularity: MetricsGranularity): number {
  switch (granularity) {
    case '1m':
      return 60;
    case '5m':
      return 5 * 60;
    case '1d':
      return 24 * 60 * 60;
    case '1w':
      return 7 * 24 * 60 * 60;
  }
}

export function buildMetricsQueryReq(input: MetricsQueryInput): MetricsQueryReq {
  const now = input.now ?? new Date();
  const rangeMs = getTimeRangeMs(input.rangeId);
  const startAt = new Date(now.getTime() - rangeMs);
  const service = input.filters.service.trim();
  const routeTemplate = input.filters.route_template.trim();
  const method = input.filters.method.trim().toUpperCase();
  const errorCode = input.filters.error_code.trim();

  const req: MetricsQueryReq = {
    granularity: mapMetricsGranularity(rangeMs),
    start_at: startAt.toISOString(),
    end_at: now.toISOString(),
  };

  if (service) req.service = service;
  if (routeTemplate) req.route_template = routeTemplate;
  if (method) req.method = method;
  if (input.filters.status_class !== '') req.status_class = input.filters.status_class;
  if (errorCode) req.error_code = errorCode;
  if (input.limit && input.limit > 0) req.limit = Math.floor(input.limit);

  return req;
}

function normalizePoint(raw: MetricsPoint, fallbackGranularity: MetricsGranularity): MetricsPoint {
  return {
    granularity: raw.granularity ?? fallbackGranularity,
    bucket_start: raw.bucket_start,
    service: String(raw.service ?? ''),
    route_template: String(raw.route_template ?? ''),
    method: String(raw.method ?? '').toUpperCase(),
    status_class: Number(raw.status_class) || 0,
    error_code: String(raw.error_code ?? ''),
    request_count: Math.max(0, Number(raw.request_count) || 0),
    error_count: Math.max(0, Number(raw.error_count) || 0),
    total_latency_ms: Math.max(0, Number(raw.total_latency_ms) || 0),
    max_latency_ms: Math.max(0, Number(raw.max_latency_ms) || 0),
  };
}

function normalizeData(raw: MetricsQueryData, fallbackGranularity: MetricsGranularity): MetricsQueryData {
  const list = (raw.list ?? [])
    .map((item) => normalizePoint(item, fallbackGranularity))
    .filter((item) => Number.isFinite(Date.parse(item.bucket_start)))
    .sort((a, b) => Date.parse(a.bucket_start) - Date.parse(b.bucket_start));

  return {
    granularity: raw.granularity ?? fallbackGranularity,
    list,
  };
}

export async function queryMetricsData(args: {
  mode: 'mock' | 'api';
  input: MetricsQueryInput;
}): Promise<MetricsFetchResult> {
  const req = buildMetricsQueryReq(args.input);
  return executeBizRequest({
    mode: args.mode,
    method: 'POST',
    path: '/system/observability/metrics/query',
    body: req,
    mockResolver: () => buildMetricsMockResponse(req),
    normalize: (data) => normalizeData(data, req.granularity),
    label: 'HTTP 指标',
  });
}

export function getMetricsFilterCatalog(): {
  services: string[];
  routes: string[];
  methods: string[];
} {
  const catalog = getMockTraceStoreOptions();
  return {
    services: catalog.services,
    routes: catalog.routes,
    methods: catalog.methods,
  };
}

export function createEmptyMetricsFilters(): MetricsFilters {
  return {
    service: '',
    route_template: '',
    method: '',
    status_class: '',
    error_code: '',
  };
}

export function canUseFineGranularity(rangeId: MetricsQueryInput['rangeId']): boolean {
  return getTimeRangeMs(rangeId) < SIX_HOURS_MS;
}
