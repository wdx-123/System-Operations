import type { BizResponse, DataSourceMode, TimeRangeId } from './common';

export type MetricsGranularity = '1m' | '5m' | '1d' | '1w';

export interface MetricsQueryReq {
  granularity: MetricsGranularity;
  start_at: string;
  end_at: string;
  service?: string;
  route_template?: string;
  method?: string;
  status_class?: number;
  error_code?: string;
  limit?: number;
}

export interface MetricsPoint {
  granularity: MetricsGranularity;
  bucket_start: string;
  service: string;
  route_template: string;
  method: string;
  status_class: number;
  error_code: string;
  request_count: number;
  error_count: number;
  total_latency_ms: number;
  max_latency_ms: number;
}

export interface MetricsQueryData {
  granularity: MetricsGranularity;
  list: MetricsPoint[];
}

export type MetricsQueryResp = BizResponse<MetricsQueryData>;

export interface MetricsFilters {
  service: string;
  route_template: string;
  method: string;
  status_class: '' | 2 | 4 | 5;
  error_code: string;
}

export interface MetricsQueryInput {
  rangeId: TimeRangeId;
  filters: MetricsFilters;
  limit?: number;
  now?: Date;
}

export interface MetricsFetchResult {
  data: MetricsQueryData;
  sourceUsed: DataSourceMode;
  warning?: string;
}
