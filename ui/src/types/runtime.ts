import type { BizResponse } from './common';

export type RuntimeGranularity = '1m' | '5m' | '1h' | '1d';
export type RuntimeMetric =
  | 'task_execution_total'
  | 'task_duration_seconds'
  | 'outbox_publish_duration_seconds'
  | 'event_consume_total'
  | 'event_consume_duration_seconds'
  | 'outbox_events_total';
export type RuntimeMode = 'series' | 'snapshot';
export type TaskRuntimeStatus = '' | 'success' | 'error' | 'skipped';
export type EventRuntimeStatus = '' | 'success' | 'error';
export type OutboxRuntimeStatus = '' | 'pending' | 'published' | 'failed';

export interface RuntimeQueryReq {
  metric: RuntimeMetric;
  start_at: string;
  end_at: string;
  granularity: RuntimeGranularity;
  task_name?: string;
  topic?: string;
  status?: string;
  limit?: number;
}

export interface RuntimePoint {
  bucket_start: string;
  status?: string;
  name?: string;
  topic?: string;
  count: number;
  avg_duration_ms: number;
  max_duration_ms: number;
}

export interface RuntimeSummary {
  total: number;
  success_total: number;
  error_total: number;
  skipped_total: number;
  pending_total: number;
  published_total: number;
  failed_total: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
  max_duration_ms: number;
  snapshot_at?: string;
}

export interface RuntimeQueryData {
  metric: RuntimeMetric;
  mode: RuntimeMode;
  list: RuntimePoint[];
  summary?: RuntimeSummary;
}

export type RuntimeQueryResp = BizResponse<RuntimeQueryData>;
