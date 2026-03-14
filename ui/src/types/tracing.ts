import type { BizResponse, DataSourceMode, TimeRangeId } from './common';

export type TraceDetailSource = 'trace' | 'request';
export type TraceIdSearchMode = 'auto' | 'trace' | 'request';
export type TraceStatus = '' | 'ok' | 'error';
export type TraceRootStage = 'http.request' | 'task' | 'all';

export interface TraceSummaryQueryReq {
  trace_id?: string;
  request_id?: string;
  service?: string;
  status?: 'ok' | 'error';
  root_stage: TraceRootStage;
  start_at: string;
  end_at: string;
  limit?: number;
  offset?: number;
}

export interface TraceSummaryResp {
  trace_id: string;
  request_id: string;
  service: string;
  stage: string;
  name: string;
  kind: string;
  status: 'ok' | 'error';
  error_code?: string;
  message?: string;
  start_at: string;
  end_at: string;
  duration_ms: number;
  span_total: number;
  error_span_total: number;
  method?: string;
  route_template?: string;
}

export interface TraceSummaryQueryData {
  list: TraceSummaryResp[];
  total: number;
}

export interface TraceSpanResp {
  span_id: string;
  parent_span_id: string;
  trace_id: string;
  request_id: string;
  service: string;
  stage: string;
  name: string;
  kind: string;
  status: 'ok' | 'error';
  start_at: string;
  end_at: string;
  duration_ms: number;
  error_code?: string;
  message?: string;
  tags?: Record<string, string>;
  request_snippet?: string;
  response_snippet?: string;
  error_stack?: string;
  error_detail_json?: string;
}

export interface TraceDetailQueryReq {
  limit?: number;
  offset?: number;
  include_payload?: boolean;
  include_error_detail?: boolean;
}

export interface TraceDetailQueryData {
  list: TraceSpanResp[];
  total: number;
}

export type TraceSummaryQueryResp = BizResponse<TraceSummaryQueryData>;
export type TraceDetailQueryResp = BizResponse<TraceDetailQueryData>;

export interface TraceExplorerFilters {
  search_id: string;
  search_mode: TraceIdSearchMode;
  service: string;
  status: TraceStatus;
  root_stage: TraceRootStage;
  range_id: Exclude<TimeRangeId, '30d'>;
  page_size: number;
  route_hint: string;
  method_hint: string;
}

export interface TraceSummaryFetchResult {
  data: TraceSummaryQueryData;
  sourceUsed: DataSourceMode;
  warning?: string;
}

export interface TraceDetailFetchResult {
  data: TraceDetailQueryData;
  sourceUsed: DataSourceMode;
  warning?: string;
}
