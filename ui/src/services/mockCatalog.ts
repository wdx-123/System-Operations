import type { BizResponse } from '../types/common';
import type { MetricsPoint, MetricsQueryData, MetricsQueryReq } from '../types/metrics';
import type {
  RuntimeMetric,
  RuntimePoint,
  RuntimeQueryData,
  RuntimeQueryReq,
  RuntimeSummary,
} from '../types/runtime';
import type {
  TraceDetailQueryData,
  TraceDetailQueryReq,
  TraceDetailSource,
  TraceSpanResp,
  TraceSummaryQueryData,
  TraceSummaryQueryReq,
  TraceSummaryResp,
} from '../types/tracing';

interface RouteProfile {
  service: string;
  routeTemplate: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  baseRpm: number;
  baseLatencyMs: number;
  clientErrorRate: number;
  serverErrorRate: number;
  errorCodes: string[];
}

interface TaskProfile {
  name: string;
  service: string;
  baseCount: number;
  baseDurationMs: number;
}

interface TopicProfile {
  topic: string;
  service: string;
  baseCount: number;
  baseDurationMs: number;
}

interface MockTraceStore {
  summaries: TraceSummaryResp[];
  spansByTraceId: Map<string, TraceSpanResp[]>;
  spansByRequestId: Map<string, TraceSpanResp[]>;
}

const ROUTE_PROFILES: RouteProfile[] = [
  {
    service: 'gateway',
    routeTemplate: '/api/v1/login',
    method: 'POST',
    baseRpm: 220,
    baseLatencyMs: 42,
    clientErrorRate: 0.012,
    serverErrorRate: 0.004,
    errorCodes: ['AUTH-10001', 'AUTH-10008'],
  },
  {
    service: 'user-service',
    routeTemplate: '/api/v1/users/:id',
    method: 'GET',
    baseRpm: 180,
    baseLatencyMs: 58,
    clientErrorRate: 0.008,
    serverErrorRate: 0.005,
    errorCodes: ['USR-20001'],
  },
  {
    service: 'user-service',
    routeTemplate: '/api/v1/users/:id',
    method: 'PATCH',
    baseRpm: 46,
    baseLatencyMs: 96,
    clientErrorRate: 0.019,
    serverErrorRate: 0.008,
    errorCodes: ['USR-20014'],
  },
  {
    service: 'order-service',
    routeTemplate: '/api/v1/orders',
    method: 'POST',
    baseRpm: 124,
    baseLatencyMs: 138,
    clientErrorRate: 0.011,
    serverErrorRate: 0.012,
    errorCodes: ['ORD-30006', 'ORD-30011'],
  },
  {
    service: 'order-service',
    routeTemplate: '/api/v1/orders/:id',
    method: 'GET',
    baseRpm: 140,
    baseLatencyMs: 86,
    clientErrorRate: 0.009,
    serverErrorRate: 0.006,
    errorCodes: ['ORD-30019'],
  },
  {
    service: 'payment-service',
    routeTemplate: '/api/v1/payments/confirm',
    method: 'POST',
    baseRpm: 92,
    baseLatencyMs: 196,
    clientErrorRate: 0.014,
    serverErrorRate: 0.017,
    errorCodes: ['PAY-50002', 'PAY-50009'],
  },
  {
    service: 'report-service',
    routeTemplate: '/api/v1/reports/overview',
    method: 'GET',
    baseRpm: 34,
    baseLatencyMs: 268,
    clientErrorRate: 0.005,
    serverErrorRate: 0.012,
    errorCodes: ['RPT-70003'],
  },
];

const TASK_PROFILES: TaskProfile[] = [
  { name: 'ranking.refresh', service: 'ranking-service', baseCount: 28, baseDurationMs: 780 },
  { name: 'digest.dispatch', service: 'notification-service', baseCount: 42, baseDurationMs: 420 },
  { name: 'outbox.relay', service: 'messaging-service', baseCount: 66, baseDurationMs: 215 },
];

const TOPIC_PROFILES: TopicProfile[] = [
  { topic: 'user.activity', service: 'messaging-service', baseCount: 180, baseDurationMs: 76 },
  { topic: 'billing.events', service: 'payment-service', baseCount: 132, baseDurationMs: 122 },
  { topic: 'ranking.refresh', service: 'ranking-service', baseCount: 84, baseDurationMs: 108 },
];

const TRACE_CACHE_WINDOW_MS = 5 * 60 * 1000;
let traceStoreCache: { builtAt: number; store: MockTraceStore } | null = null;

function seeded(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (!value || value <= 0) return fallback;
  return Math.min(max, Math.floor(value));
}

function normalizeOffset(value: number | undefined): number {
  if (!value || value <= 0) return 0;
  return Math.floor(value);
}

function bizOk<T>(data: T): BizResponse<T> {
  return {
    code: 0,
    success: true,
    message: 'ok',
    data,
    timestamp: Date.now(),
  };
}

function hex32(seed: number): string {
  const a = ((seed * 2654435761) >>> 0).toString(16).padStart(8, '0');
  const b = (((seed + 97) * 1597334677) >>> 0).toString(16).padStart(8, '0');
  const c = (((seed + 191) * 2246822519) >>> 0).toString(16).padStart(8, '0');
  const d = (((seed + 313) * 3266489917) >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}${c}${d}`;
}

function hex16(seed: number): string {
  const a = ((seed * 40503) >>> 0).toString(16).padStart(8, '0');
  const b = (((seed + 81) * 982451653) >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}`;
}

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

function addSpan(
  list: TraceSpanResp[],
  span: Omit<TraceSpanResp, 'end_at'> & { end_at?: string },
): TraceSpanResp {
  const next: TraceSpanResp = {
    ...span,
    end_at: span.end_at ?? iso(Date.parse(span.start_at) + Math.max(0, span.duration_ms)),
  };
  list.push(next);
  return next;
}

function buildHttpTrace(index: number, nowMs: number): { summary: TraceSummaryResp; spans: TraceSpanResp[] } {
  const profile = ROUTE_PROFILES[index % ROUTE_PROFILES.length]!;
  const traceId = hex32(index + 1);
  const requestId = `req-${String(index + 1).padStart(6, '0')}`;
  const startAt = nowMs - Math.floor(seeded(index + 11) * 7 * 24 * 60 * 60 * 1000);
  const spike = seeded(index + 29) > 0.93;
  const isError = spike || seeded(index + 7) > 0.88;
  const baseDuration = profile.baseLatencyMs * (0.92 + seeded(index + 13) * 0.4 + (spike ? 0.95 : 0));
  const rootDuration = Math.round(baseDuration + (isError ? 86 : 0));
  const spans: TraceSpanResp[] = [];

  const root = addSpan(spans, {
    span_id: hex16(index * 100 + 1),
    parent_span_id: '',
    trace_id: traceId,
    request_id: requestId,
    service: profile.service,
    stage: 'http.request',
    name: `${profile.method} ${profile.routeTemplate}`,
    kind: 'server',
    status: isError ? 'error' : 'ok',
    start_at: iso(startAt),
    duration_ms: rootDuration,
    error_code: isError ? profile.errorCodes[0] : '',
    message: isError ? 'upstream dependency timeout' : '',
    tags: {
      method: profile.method,
      route_template: profile.routeTemplate,
      stage_group: 'http',
    },
    request_snippet: JSON.stringify({ trace_id: traceId, request_id: requestId, payload: { account: `u${index + 101}` } }),
    response_snippet: isError
      ? JSON.stringify({ code: 50001, message: 'dependency failed' })
      : JSON.stringify({ code: 0, data: { ok: true } }),
    error_stack: isError ? `gateway/handler.go:${45 + (index % 18)}` : '',
    error_detail_json: isError
      ? JSON.stringify({ provider: 'payment-gateway', timeout_ms: 3000, retryable: true })
      : '',
  });

  const svcStart = startAt + Math.round(12 + seeded(index + 17) * 25);
  const svcDuration = Math.max(20, Math.round(rootDuration * 0.56));
  const svc = addSpan(spans, {
    span_id: hex16(index * 100 + 2),
    parent_span_id: root.span_id,
    trace_id: traceId,
    request_id: requestId,
    service: profile.service,
    stage: 'service',
    name: 'ApplicationService.Execute',
    kind: 'internal',
    status: isError ? 'error' : 'ok',
    start_at: iso(svcStart),
    duration_ms: svcDuration,
    tags: {
      component: 'service',
      module: profile.service,
    },
    request_snippet: root.request_snippet,
    response_snippet: root.response_snippet,
    error_stack: isError ? root.error_stack : '',
    error_detail_json: isError ? root.error_detail_json : '',
  });

  const dbStart = svcStart + Math.round(18 + seeded(index + 19) * 28);
  const dbDuration = Math.max(14, Math.round(rootDuration * (spike ? 0.46 : 0.28)));
  addSpan(spans, {
    span_id: hex16(index * 100 + 3),
    parent_span_id: svc.span_id,
    trace_id: traceId,
    request_id: requestId,
    service: 'mysql-cluster',
    stage: 'repository.db',
    name: spike ? 'SELECT heavy_join_with_rollup' : 'SELECT entity_by_id',
    kind: 'client',
    status: isError || spike ? 'error' : 'ok',
    start_at: iso(dbStart),
    duration_ms: dbDuration,
    error_code: isError || spike ? 'DB-12001' : '',
    message: isError || spike ? 'query timeout' : '',
    tags: {
      db_system: 'mysql',
      table: profile.routeTemplate.includes('orders') ? 'orders' : 'users',
    },
    error_stack: isError || spike ? `repository/mysql/query.go:${120 + (index % 24)}` : '',
    error_detail_json:
      isError || spike ? JSON.stringify({ latency_ms: dbDuration, pool: 'primary', retryable: !spike }) : '',
  });

  const cacheStart = svcStart + Math.round(7 + seeded(index + 23) * 16);
  addSpan(spans, {
    span_id: hex16(index * 100 + 4),
    parent_span_id: svc.span_id,
    trace_id: traceId,
    request_id: requestId,
    service: 'redis-cluster',
    stage: 'cache.redis',
    name: 'GET session',
    kind: 'client',
    status: 'ok',
    start_at: iso(cacheStart),
    duration_ms: Math.max(6, Math.round(rootDuration * 0.1)),
    tags: {
      db_system: 'redis',
      operation: 'GET',
    },
  });

  if (seeded(index + 31) > 0.42) {
    const publishStart = startAt + Math.round(rootDuration * 0.68);
    addSpan(spans, {
      span_id: hex16(index * 100 + 5),
      parent_span_id: root.span_id,
      trace_id: traceId,
      request_id: requestId,
      service: 'messaging-service',
      stage: 'event.publish',
      name: 'redis.stream.publish',
      kind: 'producer',
      status: isError && seeded(index + 33) > 0.6 ? 'error' : 'ok',
      start_at: iso(publishStart),
      duration_ms: Math.max(8, Math.round(rootDuration * 0.16)),
      error_code: isError && seeded(index + 33) > 0.6 ? 'OUTBOX-90002' : '',
      message: isError && seeded(index + 33) > 0.6 ? 'publish retry exhausted' : '',
      tags: {
        topic: TOPIC_PROFILES[index % TOPIC_PROFILES.length]?.topic ?? 'user.activity',
      },
    });
  }

  const errorSpanTotal = spans.filter((span) => span.status === 'error').length;
  return {
    summary: {
      trace_id: traceId,
      request_id: requestId,
      service: profile.service,
      stage: 'http.request',
      name: `${profile.method} ${profile.routeTemplate}`,
      kind: 'server',
      status: isError ? 'error' : 'ok',
      error_code: isError ? profile.errorCodes[0] : '',
      message: isError ? 'upstream dependency timeout' : '',
      start_at: iso(startAt),
      end_at: iso(startAt + rootDuration),
      duration_ms: rootDuration,
      span_total: spans.length,
      error_span_total: errorSpanTotal,
      method: profile.method,
      route_template: profile.routeTemplate,
    },
    spans,
  };
}

function buildTaskTrace(index: number, nowMs: number): { summary: TraceSummaryResp; spans: TraceSpanResp[] } {
  const profile = TASK_PROFILES[index % TASK_PROFILES.length]!;
  const traceId = hex32(index + 1001);
  const requestId = `task-${String(index + 1).padStart(6, '0')}`;
  const startAt = nowMs - Math.floor(seeded(index + 211) * 7 * 24 * 60 * 60 * 1000);
  const isError = seeded(index + 227) > 0.85;
  const isSlow = seeded(index + 229) > 0.9;
  const rootDuration = Math.round(profile.baseDurationMs * (0.76 + seeded(index + 233) * 0.48 + (isSlow ? 0.88 : 0)));
  const spans: TraceSpanResp[] = [];

  const root = addSpan(spans, {
    span_id: hex16(index * 100 + 401),
    parent_span_id: '',
    trace_id: traceId,
    request_id: requestId,
    service: profile.service,
    stage: 'task',
    name: profile.name,
    kind: 'cron',
    status: isError ? 'error' : 'ok',
    start_at: iso(startAt),
    duration_ms: rootDuration,
    error_code: isError ? 'TASK-40001' : '',
    message: isError ? 'cron execution failed' : '',
    tags: {
      name: profile.name,
      stage_group: 'task',
    },
    request_snippet: JSON.stringify({ trigger: 'cron', task: profile.name }),
    response_snippet: isError
      ? JSON.stringify({ code: 40001, message: 'task failed' })
      : JSON.stringify({ code: 0, status: 'completed' }),
    error_stack: isError ? `task/${profile.name}.go:${36 + (index % 11)}` : '',
    error_detail_json: isError ? JSON.stringify({ attempts: 2, timeout_ms: 120000 }) : '',
  });

  const serviceStart = startAt + Math.round(14 + seeded(index + 239) * 38);
  const serviceDuration = Math.max(36, Math.round(rootDuration * 0.58));
  const svc = addSpan(spans, {
    span_id: hex16(index * 100 + 402),
    parent_span_id: root.span_id,
    trace_id: traceId,
    request_id: requestId,
    service: profile.service,
    stage: 'service',
    name: 'Runner.Execute',
    kind: 'internal',
    status: isError ? 'error' : 'ok',
    start_at: iso(serviceStart),
    duration_ms: serviceDuration,
    tags: {
      task_name: profile.name,
    },
  });

  addSpan(spans, {
    span_id: hex16(index * 100 + 403),
    parent_span_id: svc.span_id,
    trace_id: traceId,
    request_id: requestId,
    service: 'mysql-cluster',
    stage: 'repository.db',
    name: 'UPSERT materialized_stats',
    kind: 'client',
    status: isError && seeded(index + 241) > 0.5 ? 'error' : 'ok',
    start_at: iso(serviceStart + 22),
    duration_ms: Math.max(18, Math.round(rootDuration * 0.24)),
    error_code: isError && seeded(index + 241) > 0.5 ? 'DB-12008' : '',
    message: isError && seeded(index + 241) > 0.5 ? 'deadlock detected' : '',
    tags: {
      db_system: 'mysql',
      table: 'materialized_stats',
    },
  });

  addSpan(spans, {
    span_id: hex16(index * 100 + 404),
    parent_span_id: root.span_id,
    trace_id: traceId,
    request_id: requestId,
    service: 'messaging-service',
    stage: 'event.publish',
    name: 'redis.stream.publish',
    kind: 'producer',
    status: isError && seeded(index + 243) > 0.55 ? 'error' : 'ok',
    start_at: iso(startAt + Math.round(rootDuration * 0.74)),
    duration_ms: Math.max(12, Math.round(rootDuration * 0.12)),
    error_code: isError && seeded(index + 243) > 0.55 ? 'OUTBOX-90002' : '',
    message: isError && seeded(index + 243) > 0.55 ? 'publish failed' : '',
    tags: {
      topic: TOPIC_PROFILES[index % TOPIC_PROFILES.length]?.topic ?? 'ranking.refresh',
    },
  });

  const errorSpanTotal = spans.filter((span) => span.status === 'error').length;
  return {
    summary: {
      trace_id: traceId,
      request_id: requestId,
      service: profile.service,
      stage: 'task',
      name: profile.name,
      kind: 'cron',
      status: isError ? 'error' : 'ok',
      error_code: isError ? 'TASK-40001' : '',
      message: isError ? 'cron execution failed' : '',
      start_at: iso(startAt),
      end_at: iso(startAt + rootDuration),
      duration_ms: rootDuration,
      span_total: spans.length,
      error_span_total: errorSpanTotal,
      method: '',
      route_template: '',
    },
    spans,
  };
}

function buildMockTraceStore(): MockTraceStore {
  const now = Date.now();
  const summaries: TraceSummaryResp[] = [];
  const spansByTraceId = new Map<string, TraceSpanResp[]>();
  const spansByRequestId = new Map<string, TraceSpanResp[]>();

  for (let index = 0; index < 96; index += 1) {
    const { summary, spans } = buildHttpTrace(index, now);
    summaries.push(summary);
    spansByTraceId.set(summary.trace_id, spans);
    spansByRequestId.set(summary.request_id, spans);
  }

  for (let index = 0; index < 28; index += 1) {
    const { summary, spans } = buildTaskTrace(index, now);
    summaries.push(summary);
    spansByTraceId.set(summary.trace_id, spans);
    spansByRequestId.set(summary.request_id, spans);
  }

  summaries.sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at));
  return { summaries, spansByTraceId, spansByRequestId };
}

function getMockTraceStore(): MockTraceStore {
  const now = Date.now();
  if (!traceStoreCache || now - traceStoreCache.builtAt > TRACE_CACHE_WINDOW_MS) {
    traceStoreCache = {
      builtAt: now,
      store: buildMockTraceStore(),
    };
  }
  return traceStoreCache.store;
}

function bucketSizeMs(granularity: '1m' | '5m' | '1h' | '1d' | '1w'): number {
  switch (granularity) {
    case '1m':
      return 60 * 1000;
    case '5m':
      return 5 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
  }
}

function buildBuckets(startMs: number, endMs: number, granularity: '1m' | '5m' | '1h' | '1d' | '1w'): number[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return [];
  const step = bucketSizeMs(granularity);
  const alignedStart = Math.floor(startMs / step) * step;
  const alignedEnd = Math.floor(endMs / step) * step;
  const result: number[] = [];
  for (let ts = alignedStart; ts <= alignedEnd; ts += step) {
    result.push(ts);
    if (result.length > 2500) break;
  }
  return result;
}

function normalizeMetricPoint(raw: MetricsPoint): MetricsPoint {
  return {
    ...raw,
    method: raw.method.toUpperCase(),
    request_count: Math.max(0, Math.round(raw.request_count)),
    error_count: Math.max(0, Math.round(raw.error_count)),
    total_latency_ms: Math.max(0, Math.round(raw.total_latency_ms)),
    max_latency_ms: Math.max(0, Math.round(raw.max_latency_ms)),
  };
}

export function buildMetricsMockResponse(req: MetricsQueryReq): BizResponse<MetricsQueryData> {
  const startMs = Date.parse(req.start_at);
  const endMs = Date.parse(req.end_at);
  const buckets = buildBuckets(startMs, endMs, req.granularity);
  const minuteScale = bucketSizeMs(req.granularity) / (60 * 1000);
  const list: MetricsPoint[] = [];

  for (const bucketTs of buckets) {
    const bucketIso = iso(bucketTs);
    const clock = new Date(bucketTs);
    const minuteOfDay = clock.getUTCHours() * 60 + clock.getUTCMinutes();
    const dayWave = 0.74 + 0.24 * Math.sin((2 * Math.PI * minuteOfDay) / 1440);
    const trafficWave = 0.9 + 0.18 * Math.sin((2 * Math.PI * bucketTs) / (12 * 60 * 60 * 1000));

    ROUTE_PROFILES.forEach((profile, profileIndex) => {
      const seed = bucketTs / 1000 + (profileIndex + 1) * 97;
      const spike = seeded(seed * 3.1) > 0.985 ? 1.8 : 1;
      const noise = 0.84 + seeded(seed) * 0.34;
      const baseRequests = profile.baseRpm * minuteScale;
      const totalRequests = Math.max(0, Math.round(baseRequests * dayWave * trafficWave * noise * spike));
      if (totalRequests <= 0) return;

      const count4xx = Math.round(totalRequests * profile.clientErrorRate);
      const count5xx = Math.round(totalRequests * profile.serverErrorRate * (spike > 1 ? 1.7 : 1));
      const count2xx = Math.max(0, totalRequests - count4xx - count5xx);
      const latencyBase = profile.baseLatencyMs * (0.9 + seeded(seed * 5.1) * 0.28 + (spike > 1 ? 0.45 : 0));

      if (count2xx > 0) {
        list.push(
          normalizeMetricPoint({
            granularity: req.granularity,
            bucket_start: bucketIso,
            service: profile.service,
            route_template: profile.routeTemplate,
            method: profile.method,
            status_class: 2,
            error_code: '',
            request_count: count2xx,
            error_count: 0,
            total_latency_ms: count2xx * latencyBase,
            max_latency_ms: latencyBase * (1.55 + seeded(seed * 7.9)),
          }),
        );
      }

      if (count4xx > 0) {
        list.push(
          normalizeMetricPoint({
            granularity: req.granularity,
            bucket_start: bucketIso,
            service: profile.service,
            route_template: profile.routeTemplate,
            method: profile.method,
            status_class: 4,
            error_code: '',
            request_count: count4xx,
            error_count: count4xx,
            total_latency_ms: count4xx * latencyBase * 0.76,
            max_latency_ms: latencyBase * 1.18,
          }),
        );
      }

      if (count5xx > 0) {
        list.push(
          normalizeMetricPoint({
            granularity: req.granularity,
            bucket_start: bucketIso,
            service: profile.service,
            route_template: profile.routeTemplate,
            method: profile.method,
            status_class: 5,
            error_code: profile.errorCodes[Math.floor(seeded(seed * 11.3) * profile.errorCodes.length)] ?? '',
            request_count: count5xx,
            error_count: count5xx,
            total_latency_ms: count5xx * latencyBase * 1.58,
            max_latency_ms: latencyBase * (2.18 + seeded(seed * 13.7)),
          }),
        );
      }
    });
  }

  const filtered = list
    .filter((item) => {
      if (req.service && item.service !== req.service) return false;
      if (req.route_template && item.route_template !== req.route_template) return false;
      if (req.method && item.method.toUpperCase() !== req.method.toUpperCase()) return false;
      if (typeof req.status_class === 'number' && item.status_class !== req.status_class) return false;
      if (req.error_code && item.error_code !== req.error_code) return false;
      return true;
    })
    .sort((a, b) => Date.parse(a.bucket_start) - Date.parse(b.bucket_start));

  const limit = normalizeLimit(req.limit, filtered.length || 1, 50000);
  return bizOk({
    granularity: req.granularity,
    list: limit < filtered.length ? filtered.slice(filtered.length - limit) : filtered,
  });
}

export function buildTraceSummaryMockResponse(req: TraceSummaryQueryReq): BizResponse<TraceSummaryQueryData> {
  const store = getMockTraceStore();
  const startMs = Date.parse(req.start_at);
  const endMs = Date.parse(req.end_at);
  const filtered = store.summaries.filter((item) => {
    const ts = Date.parse(item.start_at);
    if (Number.isFinite(startMs) && ts < startMs) return false;
    if (Number.isFinite(endMs) && ts >= endMs) return false;
    if (req.trace_id && item.trace_id !== req.trace_id) return false;
    if (req.request_id && item.request_id !== req.request_id) return false;
    if (req.service && item.service !== req.service) return false;
    if (req.status && item.status !== req.status) return false;
    if (req.root_stage !== 'all' && item.stage !== req.root_stage) return false;
    return true;
  });

  const total = filtered.length;
  const offset = normalizeOffset(req.offset);
  const limit = normalizeLimit(req.limit, 200, 1000);
  return bizOk({
    total,
    list: filtered.slice(offset, offset + limit),
  });
}

export function buildTraceDetailMockResponse(
  source: TraceDetailSource,
  id: string,
  req: TraceDetailQueryReq,
): BizResponse<TraceDetailQueryData> {
  const store = getMockTraceStore();
  const items =
    source === 'trace'
      ? store.spansByTraceId.get(id) ?? []
      : store.spansByRequestId.get(id) ?? [];
  const sorted = [...items].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const offset = normalizeOffset(req.offset);
  const limit = normalizeLimit(req.limit, 200, 1000);
  const includePayload = req.include_payload ?? true;
  const includeErrorDetail = req.include_error_detail ?? true;

  const paged = sorted.slice(offset, offset + limit).map((item) => ({
    ...item,
    request_snippet: includePayload ? item.request_snippet ?? '' : '',
    response_snippet: includePayload ? item.response_snippet ?? '' : '',
    error_stack: includeErrorDetail ? item.error_stack ?? '' : '',
    error_detail_json: includeErrorDetail ? item.error_detail_json ?? '' : '',
  }));

  return bizOk({
    total: sorted.length,
    list: paged,
  });
}

function buildRuntimeRows(
  metric: RuntimeMetric,
  req: RuntimeQueryReq,
  profileName: string,
): { rows: RuntimePoint[]; summary: RuntimeSummary } {
  const startMs = Date.parse(req.start_at);
  const endMs = Date.parse(req.end_at);
  const buckets = buildBuckets(startMs, endMs, req.granularity);
  const summary: RuntimeSummary = {
    total: 0,
    success_total: 0,
    error_total: 0,
    skipped_total: 0,
    pending_total: 0,
    published_total: 0,
    failed_total: 0,
    p50_duration_ms: 0,
    p95_duration_ms: 0,
    p99_duration_ms: 0,
    max_duration_ms: 0,
  };
  const rows: RuntimePoint[] = [];
  const statusPool =
    metric === 'task_execution_total' || metric === 'task_duration_seconds'
      ? (['success', 'error', 'skipped'] as const)
      : metric === 'outbox_events_total'
        ? (['published', 'failed'] as const)
        : (['success', 'error'] as const);

  const labelKey = metric.startsWith('task_') ? 'name' : 'topic';
  const selectedLabel = metric.startsWith('task_') ? req.task_name || profileName : req.topic || profileName;

  for (const bucketTs of buckets) {
    const baseSeed = bucketTs / 1000 + selectedLabel.length * 17 + metric.length * 11;
    const traffic = 0.82 + seeded(baseSeed) * 0.46;
    const spike = seeded(baseSeed * 1.3) > 0.97 ? 1.7 : 1;

    statusPool.forEach((status, index) => {
      if (req.status && req.status !== status) return;
      const countBase = metric.startsWith('task_')
        ? (TASK_PROFILES.find((item) => item.name === selectedLabel)?.baseCount ?? 30)
        : metric === 'outbox_events_total'
          ? 110
          : (TOPIC_PROFILES.find((item) => item.topic === selectedLabel)?.baseCount ?? 80);
      const durationBase = metric.startsWith('task_')
        ? (TASK_PROFILES.find((item) => item.name === selectedLabel)?.baseDurationMs ?? 320)
        : (TOPIC_PROFILES.find((item) => item.topic === selectedLabel)?.baseDurationMs ?? 90);
      const statusWeight =
        status === 'success' || status === 'published'
          ? 1
          : status === 'error' || status === 'failed'
            ? 0.18
            : 0.11;
      const count = Math.max(0, Math.round(countBase * traffic * spike * statusWeight));
      if (count === 0) return;
      const avgDuration = Math.round(
        durationBase * (0.88 + seeded(baseSeed * (index + 2)) * 0.4 + (status.includes('error') ? 0.35 : 0)),
      );
      const maxDuration = Math.round(avgDuration * (1.45 + seeded(baseSeed * (index + 5)) * 0.9));

      rows.push({
        bucket_start: iso(bucketTs),
        status,
        name: labelKey === 'name' ? selectedLabel : '',
        topic: labelKey === 'topic' ? selectedLabel : '',
        count,
        avg_duration_ms: avgDuration,
        max_duration_ms: maxDuration,
      });

      summary.total += count;
      if (status === 'success') summary.success_total += count;
      if (status === 'error') summary.error_total += count;
      if (status === 'skipped') summary.skipped_total += count;
      if (status === 'published') summary.published_total += count;
      if (status === 'failed') summary.failed_total += count;
      summary.max_duration_ms = Math.max(summary.max_duration_ms, maxDuration);
    });
  }

  if (metric.includes('duration')) {
    summary.p50_duration_ms = Math.round(summary.max_duration_ms * 0.44);
    summary.p95_duration_ms = Math.round(summary.max_duration_ms * 0.82);
    summary.p99_duration_ms = Math.round(summary.max_duration_ms * 0.94);
  }

  return {
    rows: rows.sort((a, b) => Date.parse(a.bucket_start) - Date.parse(b.bucket_start)),
    summary,
  };
}

export function buildRuntimeMockResponse(req: RuntimeQueryReq): BizResponse<RuntimeQueryData> {
  if (req.metric === 'outbox_events_total' && (!req.status || req.status === 'pending')) {
    return bizOk({
      metric: req.metric,
      mode: 'snapshot',
      list: [],
      summary: {
        total: 0,
        success_total: 0,
        error_total: 0,
        skipped_total: 0,
        pending_total: 42,
        published_total: 18320,
        failed_total: 38,
        p50_duration_ms: 0,
        p95_duration_ms: 0,
        p99_duration_ms: 0,
        max_duration_ms: 0,
        snapshot_at: new Date().toISOString(),
      },
    });
  }

  const profileName =
    req.metric.startsWith('task_')
      ? req.task_name || TASK_PROFILES[0]!.name || 'ranking.refresh'
      : req.topic || TOPIC_PROFILES[0]!.topic || 'user.activity';
  const { rows, summary } = buildRuntimeRows(req.metric, req, profileName);
  const limit = normalizeLimit(req.limit, rows.length || 1, 2000);
  return bizOk({
    metric: req.metric,
    mode: 'series',
    list: limit < rows.length ? rows.slice(rows.length - limit) : rows,
    summary,
  });
}

export function getMockTraceStoreOptions(): {
  services: string[];
  routes: string[];
  methods: string[];
  taskNames: string[];
  topics: string[];
} {
  return {
    services: Array.from(
      new Set(ROUTE_PROFILES.map((item) => item.service).concat(TASK_PROFILES.map((item) => item.service))),
    ).sort(),
    routes: Array.from(new Set(ROUTE_PROFILES.map((item) => item.routeTemplate))).sort(),
    methods: Array.from(new Set(ROUTE_PROFILES.map((item) => item.method))).sort(),
    taskNames: TASK_PROFILES.map((item) => item.name),
    topics: TOPIC_PROFILES.map((item) => item.topic),
  };
}
