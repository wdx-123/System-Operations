import { buildRuntimeMockResponse, getMockTraceStoreOptions } from './mockCatalog';
import { executeBizRequest } from './transport';
import { toEventStatusLabel, toTaskStatusLabel } from '../utils/displayLabel';
import type { RuntimeTimeRangeId, TimeRangeOption } from '../types/common';
import type {
  RuntimeDashboardMetricKey,
  RuntimePageFilters,
} from '../types/runtime-page';
import type {
  EventRuntimeStatus,
  OutboxRuntimeStatus,
  RuntimeGranularity,
  RuntimeQueryReq,
  TaskRuntimeStatus,
} from '../types/runtime';
import type { RuntimeMetricResult } from '../types/runtime-page';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const RUNTIME_TIME_RANGE_OPTIONS: TimeRangeOption<RuntimeTimeRangeId>[] = [
  { id: '15m', label: '最近 15 分钟', milliseconds: 15 * 60 * 1000 },
  { id: '1h', label: '最近 1 小时', milliseconds: 60 * 60 * 1000 },
  { id: '6h', label: '最近 6 小时', milliseconds: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '最近 24 小时', milliseconds: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '最近 7 天', milliseconds: SEVEN_DAYS_MS },
];

function getRangeMs(rangeId: RuntimeTimeRangeId): number {
  return RUNTIME_TIME_RANGE_OPTIONS.find((item) => item.id === rangeId)?.milliseconds ?? 60 * 60 * 1000;
}

export function createDefaultRuntimeFilters(): RuntimePageFilters {
  return {
    range_id: '1h',
    task_name: '',
    task_status: '',
    topic: '',
    event_status: '',
  };
}

export function getRuntimeCatalog(): {
  taskNames: string[];
  topics: string[];
  services: string[];
} {
  const catalog = getMockTraceStoreOptions();
  return {
    taskNames: catalog.taskNames,
    topics: catalog.topics,
    services: catalog.services,
  };
}

export function mapRuntimeGranularity(rangeId: RuntimeTimeRangeId): RuntimeGranularity {
  const rangeMs = getRangeMs(rangeId);
  if (rangeMs <= 60 * 60 * 1000) return '1m';
  if (rangeMs < SIX_HOURS_MS) return '5m';
  if (rangeMs < SEVEN_DAYS_MS) return '1h';
  return '1d';
}

function normalizeLimit(limit?: number): number {
  if (!limit || limit <= 0) return 240;
  return Math.min(2000, Math.floor(limit));
}

function buildBaseReq(rangeId: RuntimeTimeRangeId, now?: Date): Pick<RuntimeQueryReq, 'start_at' | 'end_at' | 'granularity' | 'limit'> {
  const endAt = now ?? new Date();
  const startAt = new Date(endAt.getTime() - getRangeMs(rangeId));
  return {
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    granularity: mapRuntimeGranularity(rangeId),
    limit: normalizeLimit(),
  };
}

function buildTaskReq(
  metric: 'task_execution_total' | 'task_duration_seconds',
  filters: RuntimePageFilters,
  now?: Date,
): RuntimeQueryReq {
  return {
    metric,
    ...buildBaseReq(filters.range_id, now),
    task_name: filters.task_name.trim() || undefined,
    status: filters.task_status || undefined,
  };
}

function buildEventReq(
  metric: 'outbox_publish_duration_seconds' | 'event_consume_total' | 'event_consume_duration_seconds',
  filters: RuntimePageFilters,
  now?: Date,
): RuntimeQueryReq {
  return {
    metric,
    ...buildBaseReq(filters.range_id, now),
    topic: filters.topic.trim() || undefined,
    status: filters.event_status || undefined,
  };
}

function buildOutboxReq(status: OutboxRuntimeStatus, filters: RuntimePageFilters, now?: Date): RuntimeQueryReq {
  return {
    metric: 'outbox_events_total',
    ...buildBaseReq(filters.range_id, now),
    status: status || undefined,
  };
}

export interface RuntimeDashboardResult {
  requests: Array<{ key: RuntimeDashboardMetricKey; request: RuntimeQueryReq }>;
  metrics: Record<RuntimeDashboardMetricKey, RuntimeMetricResult>;
  warning?: string;
}

async function fetchRuntimeMetric(
  key: RuntimeDashboardMetricKey,
  mode: 'mock' | 'api',
  request: RuntimeQueryReq,
): Promise<[RuntimeDashboardMetricKey, RuntimeMetricResult]> {
  const result = await executeBizRequest({
    mode,
    method: 'POST',
    path: '/system/observability/runtime/query',
    body: request,
    mockResolver: () => buildRuntimeMockResponse(request),
    label: `运行时指标 ${request.metric}`,
  });
  return [key, { request, response: result.data, sourceUsed: result.sourceUsed, warning: result.warning }];
}

export async function loadRuntimeDashboard(args: {
  mode: 'mock' | 'api';
  filters: RuntimePageFilters;
  now?: Date;
}): Promise<RuntimeDashboardResult> {
  const requests: Array<{ key: RuntimeDashboardMetricKey; request: RuntimeQueryReq }> = [
    { key: 'taskExecution', request: buildTaskReq('task_execution_total', args.filters, args.now) },
    { key: 'taskDuration', request: buildTaskReq('task_duration_seconds', args.filters, args.now) },
    { key: 'publishDuration', request: buildEventReq('outbox_publish_duration_seconds', args.filters, args.now) },
    { key: 'consumeTotal', request: buildEventReq('event_consume_total', args.filters, args.now) },
    { key: 'consumeDuration', request: buildEventReq('event_consume_duration_seconds', args.filters, args.now) },
    { key: 'outboxSnapshot', request: buildOutboxReq('', args.filters, args.now) },
    { key: 'outboxPublished', request: buildOutboxReq('published', args.filters, args.now) },
    { key: 'outboxFailed', request: buildOutboxReq('failed', args.filters, args.now) },
  ];

  const settled = await Promise.allSettled(
    requests.map((item) => fetchRuntimeMetric(item.key, args.mode, item.request)),
  );

  const metrics = {} as Record<RuntimeDashboardMetricKey, RuntimeMetricResult>;
  const warnings: string[] = [];

  settled.forEach((entry, index) => {
    const fallbackRequest = requests[index];
    if (!fallbackRequest) return;

    if (entry.status === 'fulfilled') {
      const [key, result] = entry.value;
      metrics[key] = result;
      if (result.warning) warnings.push(result.warning);
      return;
    }

    const request = fallbackRequest.request;
    metrics[fallbackRequest.key] = {
      request,
      response: buildRuntimeMockResponse(request).data!,
      sourceUsed: 'mock',
      warning: `运行时指标 ${request.metric} 请求异常，已强制回退为模拟数据`,
    };
    warnings.push(`运行时指标 ${request.metric} 请求异常，已强制回退为模拟数据`);
  });

  return {
    requests,
    metrics,
    warning: warnings.length > 0 ? Array.from(new Set(warnings)).join(' ') : '',
  };
}

export function formatTaskStatusLabel(status: TaskRuntimeStatus): string {
  return toTaskStatusLabel(status);
}

export function formatEventStatusLabel(status: EventRuntimeStatus): string {
  return toEventStatusLabel(status);
}
